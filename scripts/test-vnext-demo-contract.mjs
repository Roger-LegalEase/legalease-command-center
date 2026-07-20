import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { applyVNextDemoContract, VNEXT_DEMO_DESTINATIONS } from "./vnext-demo-contract.mjs";

const fixture = {
  tasks: [{ id: "demo-task-fulton-kickoff" }],
  posts: [{ id: "demo-post-review" }],
  campaigns: [{ id: "demo-campaign-county-intake" }],
  partners: [{ id: "demo-partner-fulton" }],
  dataRoomItems: [{ id: "demo-dr-compliance" }],
  settings: { retained: true }
};

const result = applyVNextDemoContract(fixture, { generatedAt: "2026-07-20T00:00:00.000Z" });
assert.deepEqual(result.settings.vnextDemo.primaryDestinations, VNEXT_DEMO_DESTINATIONS);
assert.equal(result.settings.vnextDemo.source, "persisted-local-demo-dataset");
assert.equal(result.settings.vnextDemo.externalActionsEnabled, false);
assert.equal(result.posts[0]._version, 1);
assert.equal(result.settings.retained, true);
assert.equal(Object.keys(result.settings.vnextDemo.workflows).length, 5);

assert.throws(
  () => applyVNextDemoContract({ ...fixture, posts: [] }),
  /posts\/demo-post-review/,
  "seed generation must fail if a walkthrough object is missing"
);

const root = path.resolve(import.meta.dirname, "..");
const requiredDocs = [
  "README.md",
  "docs/PRODUCTION_RUNBOOK.md",
  "docs/MORNING_WALKTHROUGH.md",
  "DEMO_SCRIPT.md",
  "docs/ux-vnext/demo-walkthrough.md",
  "docs/ux-vnext/troubleshooting.md",
  "docs/ux-vnext/brand-usage.md",
  ".env.example"
];
const combined = requiredDocs.map((relativePath) => readFileSync(path.join(root, relativePath), "utf8")).join("\n");

for (const destination of VNEXT_DEMO_DESTINATIONS) {
  assert.match(combined, new RegExp(`\\b${destination}\\b`), `${destination} must be documented`);
}
assert.match(combined, /#F04800/);
assert.match(combined, /legalease-logo-white-2025\.png/);
assert.match(combined, /command-center-vnext-approved-direction\.png/);
assert.match(combined, /COMMAND_CENTER_UX_VNEXT=false/);
assert.match(combined, /ENABLE_LIVE_LINKEDIN_POSTING=false/);
assert.match(combined, /rollback/i);
assert.match(combined, /reload/i);

assert.ok(existsSync(path.join(root, "assets/brand/logos/legalease-logo-white-2025.png")));
assert.ok(existsSync(path.join(root, "docs/ux-vnext/reference/command-center-vnext-approved-direction.png")));

const seedSource = readFileSync(path.join(root, "scripts/create-demo-dataset.mjs"), "utf8");
assert.match(seedSource, /ALLOW_DEMO_DATA/);
assert.match(seedSource, /STORAGE_BACKEND.*supabase/s);
assert.match(seedSource, /applyVNextDemoContract/);
assert.match(seedSource, /COMMAND_CENTER_DATA_PATH/);

console.log("PASS vNext persisted demo and documentation contract");
