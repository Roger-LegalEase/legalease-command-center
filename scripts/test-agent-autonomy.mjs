#!/usr/bin/env node
// Phase 18C guard: agent-run review fields, campaign-command run recording, and the
// declared autonomy-level registry. No engine may quietly claim more autonomy than declared.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAgentRun, transitionQueueItem } from "./company-memory.mjs";
import { AUTONOMY_LEVELS, AUTONOMY_LEVEL_MEANINGS, autonomyLevelFor } from "./autonomy-levels.mjs";
import { HEARTBEAT_ENGINE_IDS } from "./heartbeat-engines.mjs";
import { proposeWaveRelease, executeApprovedWaveRelease } from "./campaign-command.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = "2026-07-04T15:00:00.000Z";
const ENV = {};

check("agent runs carry the review layer fields", () => {
  const run = createAgentRun({
    agent: "campaign-command",
    purpose: "Prepare a wave release",
    risk: "caution",
    recommended_next_step: "Approve it on the Decisions page.",
    approval_required: true,
    queue_item_id: "qi-1",
    approval_id: "ap-1",
    reviewed_by: "roger",
    reviewed_at: NOW,
    final_action: "Released wave 3."
  }, { now: () => NOW });
  assert.equal(run.purpose, "Prepare a wave release");
  assert.equal(run.risk, "caution");
  assert.equal(run.approval_required, true);
  assert.equal(run.queue_item_id, "qi-1");
  assert.equal(run.approval_id, "ap-1");
  assert.equal(run.reviewed_by, "roger");
  assert.equal(run.final_action, "Released wave 3.");
  assert.equal(createAgentRun({ agent: "x", risk: "made-up" }).risk, "safe", "unknown risk falls back to safe");
});

check("every heartbeat engine has a declared autonomy level with a plain sentence", () => {
  for (const id of HEARTBEAT_ENGINE_IDS) {
    const declared = autonomyLevelFor(id);
    assert(Number.isInteger(declared.level) && declared.level >= 0 && declared.level <= 4, `${id} level in 0..4`);
    assert(declared.plain && declared.plain.length > 20, `${id} has a real plain-English sentence`);
  }
});

check("external-facing senders are capped at level 3 (execute after approval)", () => {
  for (const id of ["reactivation-sequencer", "outreach-sequencer", "campaign-command", "intake", "prospect-scout"]) {
    assert.equal(autonomyLevelFor(id).level, 3, `${id} declares level 3`);
  }
  const level4 = Object.entries(AUTONOMY_LEVELS).filter(([, v]) => v.level === 4).map(([k]) => k);
  assert.deepEqual(level4, ["heartbeat"], "only internal housekeeping runs at level 4");
});

check("read-only loops and unknown helpers default safely", () => {
  assert.equal(autonomyLevelFor("loop-revenue").level, 0, "operating loops are watch-only");
  assert.equal(autonomyLevelFor("some-future-helper").level, 2, "unknown helpers default to prepare-for-approval");
  assert(autonomyLevelFor("some-future-helper").plain === AUTONOMY_LEVEL_MEANINGS[2]);
});

check("autonomy sentences carry no developer jargon", () => {
  const jargon = /\b(webhook|cron|payload|env var|service role|JSON|API|RPC|endpoint)\b/i;
  for (const [id, entry] of Object.entries(AUTONOMY_LEVELS)) {
    assert(!jargon.test(entry.plain), `${id} sentence is plain English`);
  }
  for (const meaning of Object.values(AUTONOMY_LEVEL_MEANINGS)) {
    assert(!jargon.test(meaning), "level meanings are plain English");
  }
});

function baseState() {
  return {
    reactivationContacts: [
      { contact_id: "c1", email: "a@example.com", wave: 3 },
      { contact_id: "c2", email: "b@example.com", wave: 3 }
    ],
    reactivationCampaign: { releasedWaves: [], status: "active" }
  };
}

check("proposing a wave release records a linked agent run", () => {
  const result = proposeWaveRelease(baseState(), 3, { actor: "roger", env: ENV, now: NOW });
  assert.equal(result.ok, true);
  const run = (result.state.agentRuns || []).find((r) => r.agent === "campaign-command");
  assert(run, "propose recorded an agent run");
  assert.match(run.purpose, /wave 3 release for approval/i);
  assert.equal(run.approval_required, true);
  assert.equal(run.queue_item_id, result.queueItemId);
  assert.equal(run.approval_id, result.approvalId);
  assert.equal(run.final_action, "", "nothing final happened at propose time");
});

check("executing the approved release records who reviewed it and what finally happened", () => {
  const proposed = proposeWaveRelease(baseState(), 3, { actor: "roger", env: ENV, now: NOW });
  const approved = transitionQueueItem(proposed.state, { id: proposed.queueItemId, status: "approved", actor: "roger", now: () => NOW });
  assert.equal(approved.ok, true);
  const executed = executeApprovedWaveRelease(approved.state, { approvalId: proposed.approvalId, actor: "roger", env: ENV, now: NOW });
  assert.equal(executed.ok, true);
  const run = (executed.state.agentRuns || []).find((r) => r.final_action && /released wave 3/i.test(r.final_action));
  assert(run, "execute recorded a final-action agent run");
  assert.equal(run.reviewed_by, "roger");
  assert.equal(run.approval_id, proposed.approvalId);
  assert.equal(run.writes_performed, 1);
});

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

check("campaign routes persist the agent runs they record", () => {
  const count = (source.match(/agentRuns: result\.state\.agentRuns/g) || []).length;
  assert(count >= 5, `all five campaign routes persist agentRuns (found ${count})`);
});

check("the cockpit shows autonomy ceilings and agent activity from real data", () => {
  assert(source.includes("s.agentDirectory"), "agents module reads the served directory");
  assert(source.includes("s.recentAgentRuns"), "agents module reads real recent runs");
  assert(source.includes('CK_LEVEL_CHIPS'), "level chips exist");
  assert(!/Checked \d+ minutes ago/.test(source), "no fabricated last-ran timestamps");
});

check("the today summary serves agentDirectory and recentAgentRuns", () => {
  const projector = readFileSync(new URL("./company-memory-projector.mjs", import.meta.url), "utf8");
  assert(projector.includes("agentDirectory,"), "summary returns the directory");
  assert(projector.includes("recentAgentRuns,"), "summary returns recent runs");
  assert(projector.includes("autonomyLevelFor"), "directory derives from the declared registry");
});

console.log(`\ntest-agent-autonomy: all ${passed} checks passed.`);
