import { enqueueAllChannelsForScrape, runScraper } from "./scraper.js";

const INTERVAL_MS = 6 * 60 * 60 * 1000;

async function tick() {
  console.log("[scrape-scheduler] Enqueuing channels...");
  const count = await enqueueAllChannelsForScrape();
  console.log(`[scrape-scheduler] ${count} channels enqueued. Starting scraper...`);
  await runScraper();
  console.log("[scrape-scheduler] Scrape complete.");
}

await tick();
setInterval(tick, INTERVAL_MS);
