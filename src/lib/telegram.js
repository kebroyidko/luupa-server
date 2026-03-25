import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

function isJoinLink(link) {
  return link.startsWith("+");
}

function validateLink(link) {
  if (isJoinLink(link)) return /^\+[A-Za-z0-9_-]{16,}$/.test(link);
  return /^[A-Za-z0-9_]{5,32}$/.test(link);
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

export async function fetchChannelInfo(link) {
  if (!validateLink(link)) throw new Error("Invalid channel link format");

  const sessionRow = await getRandomSession();
  const client = new TelegramClient(
    new StringSession(sessionRow.session),
    Number(process.env.TG_API_ID),
    process.env.TG_API_HASH,
    { connectionRetries: 3, useWSS: false, receiveSendDifference: false, noUpdates: true }
  );

  await client.connect();

  try {
    let entity;

    if (isJoinLink(link)) {
      try {
        await client.invoke(new Api.messages.ImportChatInvite({ hash: link.slice(1) }));
      } catch (e) {
        if (!e.message.includes("INVITE_REQUEST_SENT") && !e.message.includes("USER_ALREADY_PARTICIPANT")) throw e;
      }
      entity = await client.getEntity(await client.invoke(new Api.messages.CheckChatInvite({ hash: link.slice(1) })).then(r => r.chat ?? r.channel));
    } else {
      entity = await client.getEntity(link);
    }

    const full = await client.invoke(new Api.channels.GetFullChannel({ channel: entity }));
    const fullChannel = full.fullChat;
    const channel = full.chats[0];

    let profileImageBuffer = null;
    try {
      const photoPromise = client.downloadProfilePhoto(entity, { isBig: false });
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("photo timeout")), 10000));
      const result = await Promise.race([photoPromise, timeoutPromise]);
      if (result) profileImageBuffer = Buffer.from(result);
    } catch {}

    return {
      name: channel.title,
      subscribers: fullChannel.participantsCount ?? 0,
      description: fullChannel.about ?? null,
      profileImageBuffer,
    };
  } finally {
    await client.disconnect();
  }
}
