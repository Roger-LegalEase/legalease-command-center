// Phase S verifier — Review Desk approve/fix wizard (usability overhaul, approved 2026-07-12).
// Roger's conditions, pinned here:
//   1. Auto-render fires ONLY after the text gates pass (no OpenAI credits on failing drafts).
//   2. Auto-render sits under a persisted daily cap (AUTO_RENDER_DAILY_CAP).
//   3. Approve absorbs the ceremony flags (copyReviewed) — but the guidelines hard-fail gate
//      and render QA stay HARD at approve time (campaign/content safety untouched).
//   4. The wizard shows exactly three operator states and translates every gate rule id the
//      codebase can emit into plain English (no engineer-facing rule ids on the happy path).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "preview-server.mjs"), "utf8");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("Phase S social wizard tests");

// ---- 1. auto-render gate + cap --------------------------------------------------------------
{
  const fn = source.match(/async function autoRenderNewPosts\(posts = \[\]\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(fn, "autoRenderNewPosts exists");
  assert.ok(fn.includes("socialGuidelinesGate(post)"), "auto-render re-derives the text gate when unstamped");
  assert.ok(fn.indexOf("hardFails.length) continue") < fn.indexOf("claimAutoRenderBudget"),
    "text-gate check runs BEFORE the budget claim: failing drafts spend neither budget nor credits");
  assert.ok(fn.includes("claimAutoRenderBudget()"), "every auto render claims the daily budget");
  assert.ok(fn.includes("break"), "cap exhaustion stops the batch instead of skipping silently");
  assert.ok(!fn.includes("throw"), "auto-render failures never abort the generation batch");
  assert.ok(source.includes("AUTO_RENDER_DAILY_CAP"), "cap is env-tunable");
  const claim = source.match(/async function claimAutoRenderBudget\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(claim.includes("store.updateSettings({ autoRenderUsage:"), "usage persists in the settings singleton (scoped write)");
  assert.ok(claim.includes("usage.count >= AUTO_RENDER_DAILY_CAP()"), "claim fails closed at the cap");
  ok("auto-render: text gates first, then a persisted daily cap; failures never abort the batch");
}

// ---- 2. the three generation surfaces route through the gated path --------------------------
{
  for (const marker of ['url.pathname === "/api/content-bank/generate"', '"/api/generate" || url.pathname === "/api/sources/generate"']) {
    const at = source.indexOf(marker);
    assert.ok(at > 0, marker + " endpoint exists");
    const block = source.slice(at, at + 1200);
    assert.ok(block.includes("autoRenderNewPosts("), marker + " routes renders through the gated path");
  }
  const automation = source.match(/async function runSourceAutomation\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(automation.includes("autoRenderNewPosts(posts)"), "source automation routes through the gated path");
  assert.ok(!automation.includes("await generateImageForPost(post.id);"),
    "the old unconditional per-post render loop is gone from source automation");
  ok("content-bank, /api/generate, and source automation all render via the gated, capped path");
}

// ---- 3. approve absorbs ceremony flags; hard gates stay hard --------------------------------
{
  const at = source.indexOf('url.pathname === "/api/posts/update"');
  assert.ok(at > 0, "server route for /api/posts/update exists");
  const block = source.slice(at, at + 3400);
  assert.ok(!block.includes("Review copy before approving"), "the copy-review rejection is gone (Approve IS the review)");
  assert.ok(block.includes("copyReviewed: true"), "Approve absorbs the copyReviewed ceremony flag");
  assert.ok(block.includes("Guidelines hard fail - cannot approve"), "guidelines hard-fail gate still blocks approval");
  assert.ok(block.includes("failed its quality check. Fix or regenerate"), "approve-time render QA check present (plain-English message)");
  assert.ok(source.includes("socialGuidelinesGate({ ...post, ...patch })"), "gate evaluates the post as patched");
  const clientSetStatus = source.match(/async function setStatus\(id, status\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.ok(!clientSetStatus.includes("Review copy before approving"), "client-side copy-review block removed");
  ok("Approve absorbs copyReviewed; guidelines gate + render QA remain hard at approve time");
}

// ---- 4. wizard: three states, on the page, workbench off the page ---------------------------
{
  const wizardState = source.match(/function wizardStateForPost\(post, image\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.ok(wizardState, "wizardStateForPost exists");
  for (const key of ['key: "ready"', 'key: "working"', 'key: "fix"']) {
    assert.ok(wizardState.includes(key), "wizard state machine has " + key);
  }
  const stateKeys = [...wizardState.matchAll(/key: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(stateKeys)].sort(), ["fix", "ready", "working"],
    "exactly three operator-facing states — no exposed pipeline stages");
  assert.ok(source.includes("${socialWizardHtml(reviewPosts)}"), "wizard renders on the Review Desk page");
  const queueSection = source.slice(source.indexOf('<section id="queue" class="queue-review-shell'), source.indexOf('<section id="queue" class="queue-review-shell') + 3000);
  assert.ok(!queueSection.includes("guidedQueueWorkbenchHtml()"), "guided workbench modes no longer render");
  assert.ok(queueSection.indexOf("socialWizardHtml") < queueSection.indexOf("queueReviewListHtml"),
    "wizard leads; the list view is the collapsed advanced surface");
  ok("wizard leads the Review Desk with exactly three states; workbench modes are gone");
}

// ---- 5. every emittable gate rule id has a plain-English translation ------------------------
{
  const mapBlock = source.match(/const WIZARD_PLAIN_REASONS = \{[\s\S]*?\n    \};/)?.[0] || "";
  assert.ok(mapBlock, "plain-reason map exists");
  const mapped = new Set([...mapBlock.matchAll(/^\s{6}([a-z_]+):/gm)].map((m) => m[1]));
  const emitted = new Set([...source.matchAll(/rule: "([a-z_]+)"/g)].map((m) => m[1]));
  const missing = [...emitted].filter((rule) => !mapped.has(rule));
  assert.deepEqual(missing, [], "gate rules with no plain-English translation: " + missing.join(", "));
  ok("all " + emitted.size + " emittable gate rule ids translate to plain English (" + mapped.size + " mapped)");
}

console.log("\ntest-social-wizard: all " + passed + " checks passed.");
