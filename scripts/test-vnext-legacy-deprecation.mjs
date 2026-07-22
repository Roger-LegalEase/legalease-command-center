#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PRIMARY_SHELL_DESTINATIONS } from "./ui/app-shell-navigation.mjs";
import { resolveRouteCompatibility } from "./ui/route-compatibility.mjs";
import { VNEXT_ALIAS_RETENTION_RELEASES, VNEXT_LEGACY_DEPRECATION } from "./vnext-legacy-deprecation.mjs";
import { VNEXT_ROLLBACK_CHECKPOINT } from "./vnext-production-contract.mjs";

assert.deepEqual(PRIMARY_SHELL_DESTINATIONS.map((item) => item.label), ["Today", "Inbox", "Relationships", "Social", "Outreach", "Scoreboard", "Support", "Calendar", "Company Health", "Files"]);
assert.equal(VNEXT_LEGACY_DEPRECATION.removed.length, 0);
assert.equal(VNEXT_LEGACY_DEPRECATION.sourceBytesRemoved, 0);
assert.equal(VNEXT_LEGACY_DEPRECATION.retained.length, 5);
assert.ok(VNEXT_LEGACY_DEPRECATION.retained.every((item) => item.blocker && item.normalModeVisibility));
assert.equal(VNEXT_ALIAS_RETENTION_RELEASES, 1);
assert.equal(VNEXT_ROLLBACK_CHECKPOINT.baseSha, "c6089bb571aa2a3e9b31a1c8aed8706e10e05586");

for (const [alias, destination] of [
  ["#overview", "Today"], ["#cockpit", "Today"], ["#queue", "Social"], ["#growth", "Social"],
  ["#campaigns", "Outreach"], ["#partner-programs", "Partners"], ["#proof", "Files"], ["#dataroom", "Files"], ["#reports", "Files"]
]) {
  const resolution = resolveRouteCompatibility(alias);
  assert.equal(resolution.destination, destination, `${alias} must remain mapped to ${destination}.`);
  assert.notEqual(resolution.kind, "unknown");
}

const shell = await readFile("scripts/ui/app-shell.mjs", "utf8");
assert.match(shell, /PRIMARY_SHELL_DESTINATIONS/);
assert.doesNotMatch(shell.slice(shell.indexOf("function primaryNavigationHtml"), shell.indexOf("function secondaryNavigationHtml")), /Reports|Proof|Data Room|Campaigns|Review Desk/);
const verifier = await readFile("scripts/verify-vnext-production.mjs", "utf8");
assert.match(verifier, /flag-off legacy shell|rollback shell/i);

console.log("VNEXT_LEGACY_DEPRECATION_EVIDENCE", JSON.stringify({
  removed:VNEXT_LEGACY_DEPRECATION.removed,
  retained:VNEXT_LEGACY_DEPRECATION.retained.map(({ id, blocker }) => ({ id, blocker })),
  aliasesVerified:9,
  aliasRetentionReleases:VNEXT_ALIAS_RETENTION_RELEASES,
  sourceBytesRemoved:VNEXT_LEGACY_DEPRECATION.sourceBytesRemoved,
  rollbackCheckpoint:VNEXT_ROLLBACK_CHECKPOINT.baseSha
}));
console.log("PASS test-vnext-legacy-deprecation");
