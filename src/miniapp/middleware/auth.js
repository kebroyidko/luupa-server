import { createHmac } from "crypto";
import { db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { sign, verify } from "hono/jwt";
import { getCookie, setCookie } from "hono/cookie";

const MAX_AGE_SECONDS = 86400;

function validateInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Missing hash");

  const authDate = Number(params.get("auth_date"));
  if (!authDate) throw new Error("Missing auth_date");

  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > MAX_AGE_SECONDS) throw new Error("Init data expired");

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(process.env.BOT_TOKEN)
    .digest();

  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (expectedHash !== hash) throw new Error("Invalid hash");

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("Missing user");

  return JSON.parse(userRaw);
}

export async function requireMiniAppUser(c, next) {
  const initData = c.req.header("x-init-data");
  if (!initData) return c.json({ error: "Missing init data" }, 401);

  let telegramUser;
  try {
    telegramUser = validateInitData(initData);
  } catch (e) {
    return c.json({ error: e.message }, 401);
  }

  const identifier = String(telegramUser.id);

  let [user] = await db.select().from(users).where(eq(users.identifier, identifier));

  if (!user) {
    [user] = await db.insert(users).values({
      identifier,
      firstName: telegramUser.first_name ?? null,
      lastName: telegramUser.last_name ?? null,
      username: telegramUser.username ?? null,
      allowsWriteToPm: telegramUser.allows_write_to_pm ?? false,
    }).returning();
  } else {
    [user] = await db.update(users).set({
      firstName: telegramUser.first_name ?? null,
      lastName: telegramUser.last_name ?? null,
      username: telegramUser.username ?? null,
      allowsWriteToPm: telegramUser.allows_write_to_pm ?? false,
      updatedAt: new Date(),
    }).where(eq(users.identifier, identifier)).returning();
  }

  c.set("user", user);
  await next();
}
