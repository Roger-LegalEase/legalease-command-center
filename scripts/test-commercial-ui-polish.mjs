import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

for (const marker of ["commercial-shell", "commercial-sidebar", "command-bar", "workspace-card", "department-card", "lee-assistant-window"]) {
  assert(source.includes(marker), `Commercial UI marker ${marker} should exist.`);
}
assert.match(source, /background:\s*#F6F7F9|background:\s*#F7F5F0|--app-bg|--command-bg/, "App should use a warm/off-white canvas.");
assert.match(source, /#111827|#0F172A|#0f172a/, "App should use a dark sidebar/nav accent.");
assert.match(source, /skeleton|loading-line|Working|Checking/, "Loading/pending states should exist.");
assert.match(source, /empty-state|founder-empty|No data yet|No .* yet/, "Premium empty states should exist.");
assert.match(source, /grid-template-columns:repeat\(auto-fit|department-grid|workspace-grid/, "Dashboard grids should reduce endless scrolling.");
assert.match(source, /data-action-pending|runAction/, "Buttons should use action feedback/pending state.");

console.log("commercial UI polish tests passed");
