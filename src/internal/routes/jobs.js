import { Hono } from "hono";
import { db } from "../../db/index.js";
import { reports } from "../../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { enqueueAllChannelsForScrape, runScraper } from "../../jobs/scraper.js";
import { enqueueAllChannels, runChannelSync } from "../../jobs/channel-sync.js";

export const jobRoutes = new Hono();

jobRoutes.post("/channels/sync", async (c) => {
  const count = await enqueueAllChannels();
  runChannelSync().catch(e => console.error("[manual sync error]", e.message));
  return c.json({ ok: true, enqueued: count });
});

jobRoutes.get("/reports", async (c) => {
  const rows = await db.select().from(reports).orderBy(desc(reports.startedAt)).limit(20);
  return c.json(rows);
});

jobRoutes.get("/reports/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(reports).where(eq(reports.id, id));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

jobRoutes.post("/channels/scrape", async (c) => {
  const count = await enqueueAllChannelsForScrape();
  runScraper().catch(e => console.error("[manual scrape error]", e.message));
  return c.json({ ok: true, enqueued: count });
});
