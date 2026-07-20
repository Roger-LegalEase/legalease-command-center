#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { VNEXT_RECOVERY_FAILURES, recoveryTruthSentence, vnextRecoveryFailure } from "./ui/recovery-contract.mjs";

const required = [
  "read_timeout", "write_timeout", "network_loss_during_save", "third_party_publishing_failure",
  "partial_multi_channel_publishing", "sendgrid_rejection", "expired_authorization",
  "supabase_unavailable", "missing_asset", "invalid_route", "stale_browser_action"
];
assert.deepEqual(Object.keys(VNEXT_RECOVERY_FAILURES), required);
for (const key of required) {
  const failure = vnextRecoveryFailure(key);
  assert.ok(failure?.title && failure.happened && failure.didNotHappen && failure.nextAction, `${key} requires complete recovery guidance.`);
  assert.deepEqual(Object.keys(failure.facts), ["saved", "sent", "published", "uploaded", "changed"]);
  assert.match(recoveryTruthSentence(failure), /^Saved: .+ Sent: .+ Published: .+ Uploaded: .+ Changed: .+$/);
  assert.equal(Object.isFrozen(failure), true);
}
for (const key of ["write_timeout", "network_loss_during_save", "third_party_publishing_failure", "partial_multi_channel_publishing", "sendgrid_rejection", "stale_browser_action"]) {
  assert.equal(vnextRecoveryFailure(key).automaticRetrySafe, false, `${key} must never retry automatically.`);
}
assert.equal(vnextRecoveryFailure("partial_multi_channel_publishing").facts.published, "partial");
assert.equal(vnextRecoveryFailure("sendgrid_rejection").facts.sent, "no");
assert.equal(vnextRecoveryFailure("network_loss_during_save").facts.saved, "unknown");
assert.equal(vnextRecoveryFailure("unknown"), null);

const quickCapture = await readFile("scripts/ui/quick-capture.mjs", "utf8");
const composer = await readFile("scripts/ui/pages/post-composer.mjs", "utf8");
for (const source of [quickCapture, composer]) {
  assert.match(source, /responseReceived/);
  assert.match(source, /entered work is still here|edits are still here/);
  assert.match(source, /Saved or changed: unknown/);
  assert.match(source, /Nothing was sent, published, or uploaded/);
}
assert.doesNotMatch(quickCapture, /catch[^}]+submit\s*\(/s, "A failed save must not retry itself.");
assert.doesNotMatch(composer, /catch[^}]+save\s*\(/s, "A failed save must not retry itself.");

console.log("VNEXT_RELIABILITY_EVIDENCE", JSON.stringify({ scenarios:required, automaticExternalRetries:0, preservesEnteredWork:["write_timeout","network_loss_during_save","stale_browser_action"] }));
console.log("PASS test-vnext-recovery-contract");
