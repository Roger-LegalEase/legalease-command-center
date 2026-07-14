import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const nav = source.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
for (const [label, href, section] of [
  ["Today", "#today", "today"], ["Queue", "#decisions", "queue"], ["Campaigns", "#campaigns", "campaigns"],
  ["Review Desk", "#queue", "review-desk"], ["Reports", "#reports", "reports"], ["More", "#more", "more"]
]) {
  assert(nav.includes(`href="${href}" data-nav-section="${section}">${label}</a>`), `${label} must be a primary link.`);
}
assert.equal((nav.match(/class="nav-top-link"/g) || []).length, 6);
for (const alias of ['overview:"today"', 'rcap:"production-activation-rcap"', 'recovery:"safe-mode"', 'privacy:"settings"']) assert(source.includes(alias));
for (const label of ["Open App Status", "Open Recovery Mode", "Open Guide", "Open Team Roles", "Review Follow-ups", "Review Partner Proof"]) assert(source.includes(label));
assert(source.includes("liveGatesCount:0"));
console.log("navigation discoverability tests passed.");
