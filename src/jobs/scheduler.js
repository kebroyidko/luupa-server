import { enqueueAllChannels, runChannelSync } from "./channel-sync.js";

console.log("[scheduler] Enqueuing channels...");
const count = await enqueueAllChannels();
console.log(`[scheduler] ${count} channels enqueued. Starting sync...`);
const report = await runChannelSync();
if (report) {
  console.log(`[scheduler] Sync complete. Updated: ${report.totalUpdated}, Failed: ${report.totalFailed}`);
}
process.exit(0);
