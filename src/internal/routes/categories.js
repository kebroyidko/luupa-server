import { Hono } from "hono";
import { db } from "../../db/index.js";
import { categories } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { uploadImage, deleteImage } from "../../lib/storage.js";
import { randomUUID } from "crypto";

export const categoryRoutes = new Hono();

function keyFromUrl(url) {
  if (!url) return null;
  return url.replace(`${process.env.S3_PUBLIC_URL.replace(/\/$/, "")}/`, "");
}

categoryRoutes.get("/", async (c) => {
  const rows = await db.select().from(categories);
  return c.json(rows);
});

categoryRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

categoryRoutes.post("/", async (c) => {
  const formData = await c.req.formData();
  const name = formData.get("name");
  const isActive = formData.get("is_active") === "true";
  const file = formData.get("thumbnail");

  if (!name) return c.json({ error: "name is required" }, 400);

  let thumbnail = null;
  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const avif = await sharp(buffer).avif({ quality: 70 }).toBuffer();
    const key = `categories/${randomUUID()}.avif`;
    thumbnail = await uploadImage(avif, key);
  }

  const [created] = await db.insert(categories).values({ name, thumbnail, isActive }).returning();
  return c.json(created, 201);
});

categoryRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const formData = await c.req.formData();
  const allowed = {};

  const name = formData.get("name");
  const isActive = formData.get("is_active");
  const file = formData.get("thumbnail");

  if (name) allowed.name = name;
  if (isActive !== null) allowed.isActive = isActive === "true";

  if (file && file.size > 0) {
    const [existing] = await db.select().from(categories).where(eq(categories.id, id));
    if (existing?.thumbnail) {
      const oldKey = keyFromUrl(existing.thumbnail);
      if (oldKey) await deleteImage(oldKey);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const avif = await sharp(buffer).avif({ quality: 70 }).toBuffer();
    const key = `categories/${randomUUID()}.avif`;
    allowed.thumbnail = await uploadImage(avif, key);
  }

  if (!Object.keys(allowed).length) return c.json({ error: "Nothing to update" }, 400);
  allowed.updatedAt = new Date();

  const [updated] = await db.update(categories).set(allowed).where(eq(categories.id, id)).returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

categoryRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(categories).where(eq(categories.id, id));
  if (!existing) return c.json({ error: "Not found" }, 404);

  if (existing.thumbnail) {
    const key = keyFromUrl(existing.thumbnail);
    if (key) await deleteImage(key);
  }

  const [deleted] = await db.delete(categories).where(eq(categories.id, id)).returning();
  return c.json({ ok: true });
});
