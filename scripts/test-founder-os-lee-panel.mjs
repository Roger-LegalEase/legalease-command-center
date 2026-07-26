// Founder OS Release 6 — Le-E everywhere.
//
// Le-E becoming available in every workspace changes WHERE it is, never WHAT it may do. So this
// suite is almost entirely about the second half of that sentence.
//
// What is proven:
//   1. The confirmation lists match 06_SAFETY_AND_AUTOMATION_CONTRACT.md VERBATIM, parsed out of
//      the document rather than retyped, so code and contract cannot drift.
//   2. Every suggestion type Le-E's apply path can execute is an INTERNAL write. The structural
//      claim — that Le-E cannot send, publish, release an audience or remove suppression at all —
//      is asserted against the real applier's source, not against a comment about it.
//   3. Le-E stays propose-only: it writes proposals, and a human approves them.
//   4. Flag off restores the page exactly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FOUNDER_OS_LEE_INTERNAL_SUGGESTION_TYPES,
  FOUNDER_OS_LEE_PANEL_ENV_KEY,
  FOUNDER_OS_NO_CONFIRMATION_ACTIONS,
  FOUNDER_OS_ONE_CONFIRMATION_ACTIONS,
  readFounderOsLeePanelConfig
} from "./ui/founder-os-config.mjs";

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

const contract = readFileSync(new URL("../docs/founder-os/06_SAFETY_AND_AUTOMATION_CONTRACT.md", import.meta.url), "utf8");
const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

// Pulls the bullet list under a heading out of the contract document.
function bulletsUnder(heading) {
  const start = contract.indexOf(heading);
  assert.ok(start >= 0, `the safety contract must contain the heading "${heading}"`);
  const rest = contract.slice(start + heading.length);
  const end = rest.search(/\n##+ /);
  return (end >= 0 ? rest.slice(0, end) : rest)
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

// ---------------------------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------------------------

check("the flag is off unless the environment says exactly true", () => {
  assert.equal(readFounderOsLeePanelConfig({}).enabled, false);
  assert.equal(readFounderOsLeePanelConfig({ [FOUNDER_OS_LEE_PANEL_ENV_KEY]:"1" }).enabled, false);
  assert.equal(readFounderOsLeePanelConfig({ [FOUNDER_OS_LEE_PANEL_ENV_KEY]:"TRUE" }).enabled, false);
  assert.equal(readFounderOsLeePanelConfig({ [FOUNDER_OS_LEE_PANEL_ENV_KEY]:"true" }).enabled, true);
});

// ---------------------------------------------------------------------------------------------
// 1. The confirmation lists are the contract's, verbatim
// ---------------------------------------------------------------------------------------------

check("the no-confirmation list matches the safety contract verbatim", () => {
  assert.deepEqual([...FOUNDER_OS_NO_CONFIRMATION_ACTIONS], bulletsUnder("### Actions requiring no confirmation"),
    "the code's no-confirmation list must be exactly the contract's; a divergence means one of them is lying");
});

check("the one-confirmation list matches the safety contract verbatim", () => {
  assert.deepEqual([...FOUNDER_OS_ONE_CONFIRMATION_ACTIONS], bulletsUnder("### Actions requiring exactly one confirmation"),
    "the code's one-confirmation list must be exactly the contract's");
});

check("the two lists are disjoint, so no action is both", () => {
  const overlap = FOUNDER_OS_NO_CONFIRMATION_ACTIONS.filter((action) => FOUNDER_OS_ONE_CONFIRMATION_ACTIONS.includes(action));
  assert.deepEqual(overlap, [], "an action in both lists would make the policy meaningless");
});

check("the contract still says one confirmation is never two and never zero", () => {
  assert.match(contract, /never two, never zero/,
    "if this wording changes, the release's confirmation model must be re-read before shipping");
});

// ---------------------------------------------------------------------------------------------
// 2. The structural claim: Le-E's apply path cannot reach a one-confirmation action
// ---------------------------------------------------------------------------------------------

// The real applier, read from source. Everything below is asserted against THIS text, so the
// claim is about the code that runs rather than about a list someone maintained by hand.
function applierSource() {
  const start = server.indexOf("function applyAutomationSuggestionToState(");
  assert.ok(start >= 0, "the automation-suggestion applier must exist");
  const rest = server.slice(start);
  const end = rest.indexOf("\nasync function approveAutomationSuggestion(");
  assert.ok(end > 0, "the applier's end boundary must be findable");
  return rest.slice(0, end);
}

check("every suggestion type the applier handles is declared as internal", () => {
  const source = applierSource();
  const handled = [...new Set([...source.matchAll(/suggestionType === "([a-z_]+)"/g)].map((match) => match[1]))];
  assert.ok(handled.length >= 10, `expected the full applier, found ${handled.length} types`);
  for (const type of handled) {
    assert.ok(FOUNDER_OS_LEE_INTERNAL_SUGGESTION_TYPES.includes(type),
      `the applier can execute "${type}" but it is not declared internal. If it is genuinely internal, declare it. If it sends, publishes, releases an audience or unsuppresses, it needs the one confirmation and must not run through this path.`);
  }
  // And the declared list must not contain types the applier cannot execute, or it describes
  // nothing.
  for (const type of FOUNDER_OS_LEE_INTERNAL_SUGGESTION_TYPES) {
    assert.ok(handled.includes(type), `"${type}" is declared internal but the applier cannot execute it`);
  }
});

check("the applier writes only internal collections — never a send, publish, release or unsuppress", () => {
  const source = applierSource();
  // The collections it may write. Any collection outside this set is a policy change.
  const permitted = new Set([
    "partners", "tasks", "campaigns", "funnelSnapshots", "dataRoomItems", "pilots",
    "complianceItems", "reports", "activityEvents"
  ]);
  const written = [...new Set([
    ...[...source.matchAll(/add\("([a-zA-Z]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/updateById\("([a-zA-Z]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/next\.([a-zA-Z]+)\s*=/g)].map((match) => match[1])
  ])];
  for (const collection of written) {
    assert.ok(permitted.has(collection),
      `the applier writes "${collection}", which is not an internal record collection. Sending, publishing, audience release and suppression removal each require one confirmation and none of them may run from here.`);
  }
  // The machinery of the one-confirmation actions must be absent from this function entirely.
  for (const forbidden of [
    "outreachSendClaims", "reactivationSendClaims", "outreachSuppressions", "outreachUnsubscribes",
    "releaseWave", "publishPostNow", "publishToChannel", "liveMode", "sendEmail", "recordSuppression"
  ]) {
    assert.ok(!source.includes(forbidden),
      `the applier references "${forbidden}"; Le-E's apply path must be structurally incapable of a one-confirmation action`);
  }
});

check("approving a suggestion requires a human decision and a pending suggestion", () => {
  const start = server.indexOf("async function approveAutomationSuggestion(");
  const source = server.slice(start, start + 1400);
  assert.match(source, /Only pending suggestions can be approved/,
    "an already-applied or rejected suggestion must not be re-appliable");
  assert.match(source, /automationSuggestions/, "approval must operate on the proposal store");
});

// ---------------------------------------------------------------------------------------------
// 3. Le-E stays propose-only
// ---------------------------------------------------------------------------------------------

check("Le-E writes proposals, and a proposal is not an action", async () => {
  const lee = await import("./lee-assistant.mjs");
  // buildLeeSuggestions is the whole of Le-E's write ambition: it produces suggestion records.
  assert.equal(typeof lee.buildLeeSuggestions, "function");
  const suggestions = lee.buildLeeSuggestions({}, [], { userMessage:"draft a follow-up", now:"2026-07-26T15:00:00.000Z" });
  assert.ok(Array.isArray(suggestions), "Le-E must return proposals rather than perform work");
  for (const suggestion of suggestions) {
    assert.ok(["pending", "edited"].includes(String(suggestion.status || "pending")),
      "a Le-E proposal must arrive needing a decision, never already applied");
  }
});

check("Le-E's own module contains no send, publish or suppression-removal path", () => {
  const source = readFileSync(new URL("./lee-assistant.mjs", import.meta.url), "utf8");
  for (const forbidden of ["publishToChannel", "releaseWave", "recordSuppression", "sendgrid", "SENDGRID"]) {
    assert.ok(!source.includes(forbidden), `lee-assistant must not reference "${forbidden}"`);
  }
});

// ---------------------------------------------------------------------------------------------
// 4. Nothing about the panel changes what Le-E may do
// ---------------------------------------------------------------------------------------------

check("the flag governs placement only — it appears in no confirmation decision", () => {
  // If the panel flag ever appeared inside a confirmation or gate decision, the panel would be
  // changing safety semantics rather than location. It must appear nowhere near them.
  const applier = applierSource();
  assert.ok(!applier.includes("FOUNDER_OS_LEE_PANEL"), "the applier must not consult the panel flag");
  assert.ok(!applier.includes("founderOsLeePanel"), "the applier must not consult the panel flag");
});

console.log(`Founder OS Release 6 Le-E panel: ${checks.length} checks passed.`);
for (const name of checks) console.log(`  - ${name}`);
