import { Hono } from "hono";
import { db } from "../../db/index.js";
import { channels } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { uploadImage, deleteImage } from "../../lib/storage.js";
import { fetchChannelInfo } from "../../lib/telegram.js";
import { detectRegion } from "../../lib/qwen.js";
import { randomUUID } from "crypto";

export const channelRoutes = new Hono();

const VALID_TYPES = ["store", "market"];

function keyFromUrl(url) {
  if (!url) return null;
  return url.replace(`${process.env.S3_PUBLIC_URL.replace(/\/$/, "")}/`, "");
}

channelRoutes.get("/", async (c) => {
  const rows = await db.select().from(channels);
  return c.json(rows);
});

channelRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(channels).where(eq(channels.id, id));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

channelRoutes.post("/", async (c) => {
  const { link, type } = await c.req.json();

  if (!link) return c.json({ error: "link is required" }, 400);
  if (!type || !VALID_TYPES.includes(type)) return c.json({ error: "type must be store or market" }, 400);

  const existing = await db.select().from(channels).where(eq(channels.link, link));
  if (existing.length > 0) return c.json({ error: "Channel already exists" }, 409);

  let info;
  try {
    info = await fetchChannelInfo(link);
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }

  let profileImage = null;
  if (info.profileImageBuffer) {
    const avif = await sharp(info.profileImageBuffer).avif({ quality: 70 }).toBuffer();
    const key = `channels/${randomUUID()}.avif`;
    profileImage = await uploadImage(avif, key);
  }

  const region = await detectRegion(info.description);

  const [created] = await db.insert(channels).values({
    name: info.name,
    subscribers: info.subscribers,
    profileImage,
    link,
    description: info.description,
    region,
    type,
    isActive: true,
  }).returning();

  return c.json(created, 201);
});

channelRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const fields = await c.req.json();
  const allowed = {};

  if (fields.type !== undefined) {
    if (!VALID_TYPES.includes(fields.type)) return c.json({ error: "type must be store or market" }, 400);
    allowed.type = fields.type;
  }
  if (fields.region !== undefined) allowed.region = fields.region;
  if (fields.isActive !== undefined) allowed.isActive = fields.isActive;

  if (!Object.keys(allowed).length) return c.json({ error: "Nothing to update" }, 400);
  allowed.updatedAt = new Date();

  const [updated] = await db.update(channels).set(allowed).where(eq(channels.id, id)).returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

channelRoutes.post("/:id/refresh", async (c) => {
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(channels).where(eq(channels.id, id));
  if (!existing) return c.json({ error: "Not found" }, 404);

  let info;
  try {
    info = await fetchChannelInfo(existing.link);
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }

  const updates = {
    name: info.name,
    subscribers: info.subscribers,
    description: info.description,
    updatedAt: new Date(),
  };

  if (info.profileImageBuffer) {
    if (existing.profileImage) {
      const oldKey = keyFromUrl(existing.profileImage);
      if (oldKey) await deleteImage(oldKey);
    }
    const avif = await sharp(info.profileImageBuffer).avif({ quality: 70 }).toBuffer();
    const key = `channels/${randomUUID()}.avif`;
    updates.profileImage = await uploadImage(avif, key);
  }

  updates.region = await detectRegion(info.description);

  const [updated] = await db.update(channels).set(updates).where(eq(channels.id, id)).returning();
  return c.json(updated);
});

channelRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(channels).where(eq(channels.id, id));
  if (!existing) return c.json({ error: "Not found" }, 404);

  const channelProducts = await db.select({ media: products.media }).from(products).where(eq(products.channelId, id));
  for (const product of channelProducts) {
    if (!Array.isArray(product.media)) continue;
    for (const item of product.media) {
      const key = keyFromUrl(item.url);
      if (key) await deleteImage(key).catch(() => {});
    }
  }

  if (existing.profileImage) {
    const key = keyFromUrl(existing.profileImage);
    if (key) await deleteImage(key).catch(() => {});
  }

  await db.delete(channels).where(eq(channels.id, id));
  return c.json({ ok: true });
});
