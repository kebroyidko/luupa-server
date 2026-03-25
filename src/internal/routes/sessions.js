import { Hono } from "hono";
import { db } from "../../db/index.js";
import { sessions } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export const sessionRoutes = new Hono();

sessionRoutes.get("/", async (c) => {
  const rows = await db.select().from(sessions);
  return c.json(rows);
});

sessionRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

sessionRoutes.post("/", async (c) => {
  const { name, session, active = true } = await c.req.json();
  if (!name || !session) return c.json({ error: "name and session are required" }, 400);
  const [created] = await db.insert(sessions).values({ name, session, active }).returning();
  return c.json(created, 201);
});

sessionRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const fields = await c.req.json();
  const allowed = {};
  if (fields.name) allowed.name = fields.name;
  if (fields.session) allowed.session = fields.session;
  if (fields.active !== undefined) allowed.active = fields.active;
  if (!Object.keys(allowed).length) return c.json({ error: "Nothing to update" }, 400);
  allowed.updatedAt = new Date();
  const [updated] = await db.update(sessions).set(allowed).where(eq(sessions.id, id)).returning();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

sessionRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db.delete(sessions).where(eq(sessions.id, id)).returning();
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
