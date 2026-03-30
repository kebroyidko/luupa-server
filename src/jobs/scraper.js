import { db } from "../db/index.js";
import { channels, categories, products, sessions, reports } from "../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";
import { redis } from "../lib/redis.js";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram";
import { sql } from "drizzle-orm";
import { extractProducts } from "../lib/qwen.js";
import { uploadImage } from "../lib/storage.js";
import sharp from "sharp";
import { randomUUID } from "crypto";

const SCRAPE_QUEUE_KEY = "queue:channel-scrape";
const BATCH_SIZE = 2;
const QWEN_BATCH_SIZE = 15;
const BATCH_DELAY_MS = 20000;
const CHANNEL_DELAY_MS = 1000;
const SCRAPE_DAYS = 15;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getRandomSession() {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.active, true))
    .orderBy(sql`RANDOM()`)
    .limit(1);
  if (!session) throw new Error("No active sessions available");
  return session;
}

async function markSessionInactive(sessionRow) {
  await db.update(sessions).set({ active: false }).where(eq(sessions.id, sessionRow.id));
  console.log(`[scraper] Session "${sessionRow.name}" marked inactive (AUTH_KEY_UNREGISTERED)`);
}

async function getClient(sessionRow) {
  const client = new TelegramClient(
    new StringSession(sessionRow.session),
    Number(process.env.TG_API_ID),
    process.env.TG_API_HASH,
    { connectionRetries: 3, useWSS: false, receiveSendDifference: false, noUpdates: true }
  );
  await client.connect();
  return client;
}

async function downloadAndUploadMediaItem(client, message) {
  try {
    const isVideo = message.media?.className === "MessageMediaDocument" &&
      message.media.document?.mimeType?.startsWith("video");
    const isPhoto = message.media?.className === "MessageMediaPhoto";
    if (!isPhoto && !isVideo) return null;
    const buffer = await Promise.race([
      client.downloadMedia(message, { thumb: isVideo ? 0 : undefined }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("media timeout")), 15000)),
    ]);
    if (!buffer) return null;
    const avif = await sharp(Buffer.from(buffer)).avif({ quality: 70 }).toBuffer();
    const key = `products/${randomUUID()}.avif`;
    const url = await uploadImage(avif, key);
    return { url, type: isVideo ? "video" : "image" };
  } catch {
    return null;
  }
}

async function resolveEntity(client, channelRow) {
  if (channelRow.link.startsWith("+")) {
    const hash = channelRow.link.slice(1);
    let chatEntity = null;
    try {
      const check = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
      if (check.chat) chatEntity = check.chat;
      else if (check.channel) chatEntity = check.channel;
    } catch {}
    if (!chatEntity) {
      try {
        const result = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
        chatEntity = result.chats?.[0] ?? null;
      } catch (e) {
        if (e.message.includes("USER_ALREADY_PARTICIPANT") || e.message.includes("INVITE_REQUEST_SENT")) {
          const dialogs = await client.getDialogs({ limit: 50 });
          chatEntity = dialogs.find(d => d.entity?.username === undefined)?.entity ?? null;
        } else {
          throw e;
        }
      }
    }
    if (!chatEntity) throw new Error("Could not resolve private channel entity");
    return chatEntity;
  }
  return await client.getEntity(channelRow.link);
}

async function scrapeChannel(channelRow, allCategories, sessionRow) {
  const client = await getClient(sessionRow);
  let messages = [];

  try {
    const entity = await resolveEntity(client, channelRow);
    const since = new Date();
    since.setDate(since.getDate() - SCRAPE_DAYS);
    const sinceTimestamp = Math.floor(since.getTime() / 1000);
    const allMessages = await client.getMessages(entity, { limit: 200 });
    messages = allMessages.filter(m => m.date >= sinceTimestamp);
  } finally {
    try { await client.disconnect(); } catch {}
  }

  const existingProducts = await db
    .select({ postId: products.postId, isSold: products.isSold, updatedAt: products.updatedAt })
    .from(products)
    .where(eq(products.channelId, channelRow.id));

  const existingMap = new Map(existingProducts.map(p => [p.postId, p]));
  const fetchedIds = new Set(messages.map(m => m.id));

  for (const existing of existingProducts) {
    if (!fetchedIds.has(existing.postId) && !existing.isSold) {
      await db.update(products)
        .set({ wasDeletedFromChannel: true, updatedAt: new Date() })
        .where(and(eq(products.channelId, channelRow.id), eq(products.postId, existing.postId)));
    }
  }

  const albumGroups = new Map();
  const standaloneMessages = [];

  for (const msg of messages) {
    if (!msg.text && !msg.media) continue;
    if (msg.groupedId) {
      const key = msg.groupedId.toString();
      if (!albumGroups.has(key)) albumGroups.set(key, []);
      albumGroups.get(key).push(msg);
    } else {
      standaloneMessages.push(msg);
    }
  }

  const postsToProcess = [];

  for (const msg of standaloneMessages) {
    const existing = existingMap.get(msg.id);
    if (existing) {
      if (!msg.editDate) continue;
      if (new Date(msg.editDate * 1000) <= new Date(existing.updatedAt)) continue;
    }
    postsToProcess.push({ primary: msg, group: [msg] });
  }

  for (const [, group] of albumGroups) {
    const primary = group.find(m => m.text) ?? group[0];
    const existing = existingMap.get(primary.id);
    if (existing) {
      const anyEdited = group.some(m => m.editDate && new Date(m.editDate * 1000) > new Date(existing.updatedAt));
      if (!anyEdited) continue;
    }
    postsToProcess.push({ primary, group });
  }

  if (!postsToProcess.length) return { updated: 0, failed: 0, failures: [] };

  let updated = 0;
  let failed = 0;
  const failures = [];

  const mediaClient = await getClient(sessionRow);

  try {
    for (let i = 0; i < postsToProcess.length; i += QWEN_BATCH_SIZE) {
      const batch = postsToProcess.slice(i, i + QWEN_BATCH_SIZE);
      const qwenInput = batch.map(({ primary }) => ({
        id: primary.id,
        text: primary.text ?? "",
        replyToId: primary.replyTo?.replyToMsgId ?? null,
      }));

      let results = [];
      try {
        results = await extractProducts(qwenInput, allCategories);
      } catch (e) {
        for (const { primary } of batch) {
          failures.push({ postId: primary.id, channelId: channelRow.id, name: channelRow.name, reason: e.message });
          failed++;
        }
        continue;
      }

      for (const result of results) {
        try {
          if (!result.post_id) continue;

          if (result.is_sold && result.reply_to_id) {
            await db.update(products)
              .set({ isSold: true, updatedAt: new Date() })
              .where(and(eq(products.channelId, channelRow.id), eq(products.postId, result.reply_to_id)));
            continue;
          }

          if (result.is_sold && existingMap.has(result.post_id)) {
            await db.update(products)
              .set({ isSold: true, updatedAt: new Date() })
              .where(and(eq(products.channelId, channelRow.id), eq(products.postId, result.post_id)));
            continue;
          }

          if (!result.is_product) continue;

          const entry = batch.find(b => b.primary.id === result.post_id);
          if (!entry) continue;

          const mediaItems = (await Promise.all(
            entry.group.map(msg => downloadAndUploadMediaItem(mediaClient, msg))
          )).filter(Boolean);

          const region = result.region ?? (channelRow.type === "store" ? channelRow.region : null);

          const productData = {
            name: result.name ?? null,
            price: result.price ?? null,
            description: entry.primary.text ?? null,
            channelId: channelRow.id,
            postId: result.post_id,
            media: mediaItems,
            categoryId: result.category_id ?? null,
            meta: result.meta ?? {},
            isSold: result.is_sold ?? false,
            wasDeletedFromChannel: false,
            updatedAt: new Date(),
          };

          if (existingMap.has(result.post_id)) {
            await db.update(products).set(productData)
              .where(and(eq(products.channelId, channelRow.id), eq(products.postId, result.post_id)));
          } else {
            await db.insert(products).values(productData);
          }
          updated++;
        } catch (e) {
          failures.push({ postId: result.post_id, channelId: channelRow.id, name: channelRow.name, reason: e.message });
          failed++;
        }
      }
    }
  } finally {
    try { await mediaClient.disconnect(); } catch {}
  }

  return { updated, failed, failures };
}

export async function enqueueAllChannelsForScrape() {
  const active = await db.select({ id: channels.id }).from(channels).where(eq(channels.isActive, true));
  if (!active.length) return 0;
  await redis.del(SCRAPE_QUEUE_KEY);
  await redis.rpush(SCRAPE_QUEUE_KEY, ...active.map(c => String(c.id)));
  return active.length;
}

export async function runScraper() {
  const allCategories = await db.select().from(categories).where(eq(categories.isActive, true));

  let totalUpdated = 0;
  let totalFailed = 0;
  const allFailures = [];

  const report = await db.insert(reports).values({
    type: "channels",
    totalProcessed: 0,
    totalUpdated: 0,
    totalFailed: 0,
    failures: [],
    startedAt: new Date(),
  }).returning().then(r => r[0]);

  while (true) {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const id = await redis.lpop(SCRAPE_QUEUE_KEY);
      if (!id) break;
      batch.push(Number(id));
    }
    if (!batch.length) break;

    const channelRows = await db.select().from(channels).where(inArray(channels.id, batch));

    for (const ch of channelRows) {
      let sessionRow;
      try {
        sessionRow = await getRandomSession();
      } catch (e) {
        allFailures.push({ channelId: ch.id, name: ch.name, reason: e.message });
        totalFailed++;
        continue;
      }

      try {
        const result = await scrapeChannel(ch, allCategories, sessionRow);
        totalUpdated += result.updated;
        totalFailed += result.failed;
        allFailures.push(...result.failures);
      } catch (e) {
        if (e.message.includes("AUTH_KEY_UNREGISTERED")) {
          await markSessionInactive(sessionRow);
        }
        allFailures.push({ channelId: ch.id, name: ch.name, reason: e.message });
        totalFailed++;
      }

      await sleep(CHANNEL_DELAY_MS);
    }

    if (await redis.llen(SCRAPE_QUEUE_KEY) > 0) await sleep(BATCH_DELAY_MS);
  }

  const finished = await db.update(reports).set({
    totalProcessed: totalUpdated + totalFailed,
    totalUpdated,
    totalFailed,
    failures: allFailures,
    finishedAt: new Date(),
  }).where(eq(reports.id, report.id)).returning().then(r => r[0]);

  return finished;
}
