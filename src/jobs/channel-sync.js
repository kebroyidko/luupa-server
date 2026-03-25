import { db } from "../db/index.js";
import { channels, reports } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { fetchChannelInfo } from "../lib/telegram.js";
import { deleteImage, uploadImage } from "../lib/storage.js";
import { redis } from "../lib/redis.js";
import sharp from "sharp";
import { randomUUID } from "crypto";

const QUEUE_KEY = "queue:channel-sync";
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2000;

function keyFromUrl(url) {
  if (!url) return null;
  return url.replace(`${process.env.S3_PUBLIC_URL.replace(/\/$/, "")}/`, "");
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function enqueueAllChannels() {
  const active = await db.select({ id: channels.id }).from(channels).where(eq(channels.isActive, true));
  if (!active.length) return 0;
  await redis.del(QUEUE_KEY);
  await redis.rpush(QUEUE_KEY, ...active.map(c => String(c.id)));
  return active.length;
}

export async function runChannelSync() {
  const total = await redis.llen(QUEUE_KEY);
  if (total === 0) return null;

  const report = await db.insert(reports).values({
    type: "channels",
    totalProcessed: 0,
    totalUpdated: 0,
    totalFailed: 0,
    failures: [],
    startedAt: new Date(),
  }).returning().then(r => r[0]);

  let updated = 0;
  let failed = 0;
  const failures = [];

  while (true) {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const id = await redis.lpop(QUEUE_KEY);
      if (!id) break;
      batch.push(Number(id));
    }
    if (!batch.length) break;

    await Promise.all(batch.map(async (id) => {
      const [existing] = await db.select().from(channels).where(eq(channels.id, id));
      if (!existing) return;

      try {
        const info = await fetchChannelInfo(existing.link);
        const updates = {
          name: info.name,
          subscribers: info.subscribers,
          description: info.description,
          updatedAt: new Date(),
        };

        if (info.profileImageBuffer) {
          if (existing.profileImage) {
            const oldKey = keyFromUrl(existing.profileImage);
            if (oldKey) await deleteImage(oldKey).catch(() => {});
          }
          const avif = await sharp(info.profileImageBuffer).avif({ quality: 70 }).toBuffer();
          const key = `channels/${randomUUID()}.avif`;
          updates.profileImage = await uploadImage(avif, key);
        }

        await db.update(channels).set(updates).where(eq(channels.id, id));
        updated++;
      } catch (e) {
        failed++;
        failures.push({ id: existing.id, name: existing.name, reason: e.message });
      }
    }));

    if (await redis.llen(QUEUE_KEY) > 0) await sleep(BATCH_DELAY_MS);
  }

  const finished = await db.update(reports).set({
    totalProcessed: updated + failed,
    totalUpdated: updated,
    totalFailed: failed,
    failures,
    finishedAt: new Date(),
  }).where(eq(reports.id, report.id)).returning().then(r => r[0]);

  return finished;
}
