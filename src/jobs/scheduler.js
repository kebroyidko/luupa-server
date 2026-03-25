import { enqueueAllChannels, runChannelSync } from "./channel-sync.js";

const INTERVAL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

async function tick() {
  console.log("[scheduler] Enqueuing channels...");
  const count = await enqueueAllChannels();
  console.log(`[scheduler] ${count} channels enqueued. Starting sync...`);
  const report = await runChannelSync();
  if (report) {
    console.log(`[scheduler] Sync complete. Updated: ${report.totalUpdated}, Failed: ${report.totalFailed}`);
  }
}

await tick();
setInterval(tick, INTERVAL_MS);
