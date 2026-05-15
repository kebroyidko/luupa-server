import { enqueueAllChannelsForScrape, runScraper } from "./scraper.js";

console.log("[scrape-scheduler] Enqueuing channels...");
const count = await enqueueAllChannelsForScrape();
console.log(`[scrape-scheduler] ${count} channels enqueued. Starting scraper...`);
await runScraper();
console.log("[scrape-scheduler] Scrape complete.");
process.exit(0);
