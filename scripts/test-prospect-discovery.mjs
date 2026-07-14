// B5 — Prospect Discovery tests. Proves the non-negotiables BEFORE any live Tier-1 fetch
// client exists:
//   1. Collections persist (membership in coreStateCollections / singletonCollections).
//   2. Classification ALWAYS matches the shared B2 vocab (OUTREACH_CLASSIFICATIONS).
//   3. Code can NEVER write review_state "approved" — structurally (engineSetReviewState
//      throws) AND behaviorally (full plan+act never produces "approved").
//   4. act() promotes ONLY "approved"; it IGNORES "pending_review".
//   5. There is NO send path in B5 (no email/SendGrid symbols; promoted contacts Not Enrolled).
//   6. Dedup by EIN / domain / name works; candidate ids are deterministic.
//   7. plan() is side-effect-free — never invokes the discovery dep (no network).
//   8. Autopilot OFF => no discovery and no promotion, even with the window open.
//   9. Discovery is throttled to once per ET day.

import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coreStateCollections, singletonCollections } from "./storage.mjs";
import { runHeartbeat, etParts } from "./heartbeat.mjs";
import { OUTREACH_CLASSIFICATIONS as B2_CLASSIFICATIONS } from "./outreach-os.mjs";
import {
  PROSPECT_COLLECTIONS, PROSPECT_SINGLETON_COLLECTIONS, PROSPECT_ENGINE_ID, PROSPECT_REVIEW,
  OUTREACH_CLASSIFICATIONS, isOutreachClassification, normalizeClassification,
  classifyFromText, scoreCandidate, prospectKeys, prospectCandidateId, dedupCandidates,
  engineSetReviewState, planProspects, actProspects, promoteApproved, buildProspectEngine
} from "./prospect-discovery.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

// 2026-07-01 is a Wednesday; 10:00Z = 06:00 ET (EDT) => the daily-engine window (6am ET).
const DAILY_TICK = new Date("2026-07-01T10:00:00Z");

function makeStore(initial = {}) {
  let state = JSON.parse(JSON.stringify(initial));
  return {
    async readState() { return JSON.parse(JSON.stringify(state)); },
    async writeState(next) { state = JSON.parse(JSON.stringify(next)); return state; },
    async writeCollections(patch) { state = { ...state, ...JSON.parse(JSON.stringify(patch)) }; return state; },
    snapshot() { return JSON.parse(JSON.stringify(state)); }
  };
}

// A discovery dep that returns fixture rows (stands in for a Tier-1 dataset fetch). It NEVER
// invents an org list at runtime — the rows are fixed test data, exactly as the real dep will
// only ever return rows fetched from IRS BMF / LSC / NLADA.
function fixtureDiscovery(rowsBySource = {}) {
  let calls = 0;
  const dep = async ({ source }) => { calls += 1; return { rows: rowsBySource[source.id] || [] }; };
  dep.calls = () => calls;
  return dep;
}

const SAMPLE_ROWS = {
  irs_bmf: [
    { organization_name: "Greater Boston Legal Aid", ein: "04-1234567", website: "https://gbla.org", email: "intake@example.com", contact_name: "Pat Lee", city: "Boston", state: "MA", source_url: "https://irs.gov/bmf/1" },
    { organization_name: "Helping Hands Foundation", ein: "12-3456789", website: "helpinghands.org", source_url: "https://irs.gov/bmf/2" }
  ],
  lsc_grantees: [
    { organization_name: "Cook County Public Defender", website: "cookdefender.gov", email: "info@example.com", source_url: "https://lsc.gov/g/1" }
  ]
};

// ---- 1. collections persist ----------------------------------------------
function testCollectionsPersist() {
  for (const c of PROSPECT_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(c), `${c} in coreStateCollections (persists to Supabase)`);
  }
  for (const c of PROSPECT_SINGLETON_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(c), `${c} in coreStateCollections`);
    assert.ok(singletonCollections.has(c), `${c} is a singleton collection`);
  }
  ok("all prospect collections persist (membership + singleton)");
}

// ---- 2. classification matches the shared B2 vocab -----------------------
function testClassificationVocab() {
  // B5 and B2 import the EXACT SAME constant.
  assert.deepEqual([...OUTREACH_CLASSIFICATIONS].sort(), [...B2_CLASSIFICATIONS].sort(), "B5 vocab === B2 vocab");
  assert.deepEqual(
    [...OUTREACH_CLASSIFICATIONS].sort(),
    ["clinic", "county_reentry", "funders_intermediaries", "government", "legal_aid", "nonprofit", "public_defender", "second_chance_employer"],
    "exactly the locked classifications (incl. clinic + funders_intermediaries added for B2 sequence routing)"
  );
  // Every label classifyFromText can emit is a member of the vocab (or "").
  const samples = [
    ["Greater Boston Legal Aid", "legal_aid"],
    ["Cook County Public Defender", "public_defender"],
    ["County Reentry Services", "county_reentry"],
    ["Second Chance Staffing", "second_chance_employer"],
    ["City of Oakland", "government"],
    ["Helping Hands Foundation", "nonprofit"],
    ["Joe's Pizza", ""]
  ];
  for (const [text, expected] of samples) {
    const got = classifyFromText(text);
    assert.equal(got, expected, `classify "${text}" => ${expected || "(none)"}`);
    if (got) assert.ok(isOutreachClassification(got), `${got} is in vocab`);
  }
  // normalizeClassification rejects anything outside the vocab (LLM-label guard).
  assert.equal(normalizeClassification("Nonprofit "), "nonprofit", "normalizes casing/space");
  assert.equal(normalizeClassification("charity"), "", "rejects out-of-vocab label");
  assert.equal(normalizeClassification("hospital"), "", "rejects invented label");
  ok("classification always matches B2 vocab (and rejects out-of-vocab labels)");
}

// ---- 3a. engineSetReviewState refuses "approved" (structural lockout) ------
function testEngineCannotSetApproved() {
  assert.throws(() => engineSetReviewState({ id: "x" }, PROSPECT_REVIEW.APPROVED), /may not set review_state="approved"/, "engine cannot set approved");
  assert.throws(() => engineSetReviewState({ id: "x" }, "rejected"), /may not set review_state/, "engine cannot set rejected either");
  // allowed engine targets work
  assert.equal(engineSetReviewState({ id: "x" }, PROSPECT_REVIEW.PENDING).review_state, "pending_review");
  assert.equal(engineSetReviewState({ id: "x" }, PROSPECT_REVIEW.PROMOTED).review_state, "promoted");
  ok("engineSetReviewState is the structural self-approval lockout (throws on 'approved')");
}

// ---- 3b. full plan+act never produces "approved" -------------------------
async function testNoApprovedFromEngine() {
  let state = {
    prospectConfig: {}, prospectCandidates: [], prospectDiscoveryRuns: [],
    outreachOrganizations: [], outreachContacts: []
  };
  // discover -> stage pending, plan -> enrich, act again
  const dep = fixtureDiscovery(SAMPLE_ROWS);
  const a1 = await actProspects(state, { now: DAILY_TICK, env: {}, runProspectDiscovery: dep });
  state = a1.state;
  const p1 = planProspects(state, { now: DAILY_TICK, env: {} });
  state = p1.state;
  const a2 = await actProspects(state, { now: DAILY_TICK, env: {}, runProspectDiscovery: dep });
  state = a2.state;
  const approved = (state.prospectCandidates || []).filter((c) => c.review_state === "approved");
  assert.equal(approved.length, 0, "engine plan+act never yields an 'approved' candidate");
  // all staged candidates are pending_review
  assert.ok(state.prospectCandidates.length >= 2, "candidates were staged from fixtures");
  assert.ok(state.prospectCandidates.every((c) => c.review_state === "pending_review"), "all staged are pending_review");
  ok("full plan+act never writes 'approved' (only the human endpoint can)");
}

// ---- 4. act() promotes ONLY approved; ignores pending_review -------------
async function testActIgnoresPendingPromotesApproved() {
  const staged = (await actProspects(
    { prospectConfig: {}, prospectCandidates: [], prospectDiscoveryRuns: [], outreachOrganizations: [], outreachContacts: [] },
    { now: DAILY_TICK, env: {}, runProspectDiscovery: fixtureDiscovery(SAMPLE_ROWS) }
  )).state;

  // All candidates are pending_review here. A promotion pass must do NOTHING.
  const pendingOnly = promoteApproved(staged, {});
  assert.equal((pendingOnly.state.outreachOrganizations || []).length, 0, "no orgs created from pending candidates");
  assert.equal((pendingOnly.state.outreachContacts || []).length, 0, "no contacts created from pending candidates");
  assert.ok(pendingOnly.state.prospectCandidates.every((c) => c.review_state === "pending_review"), "pending candidates untouched");

  // Now a HUMAN approves one (simulating the endpoint writing 'approved' directly).
  const target = staged.prospectCandidates.find((c) => c.email && c.classification);
  assert.ok(target, "a classified candidate with an email exists to approve");
  const approvedState = {
    ...staged,
    prospectCandidates: staged.prospectCandidates.map((c) => c.id === target.id ? { ...c, review_state: "approved" } : c)
  };
  const promoted = promoteApproved(approvedState, {});
  assert.equal((promoted.state.outreachOrganizations || []).length, 1, "exactly the approved org promoted");
  assert.equal((promoted.state.outreachContacts || []).length, 1, "exactly the approved contact promoted");
  const promotedCand = promoted.state.prospectCandidates.find((c) => c.id === target.id);
  assert.equal(promotedCand.review_state, "promoted", "approved candidate moved to promoted");
  // the OTHER candidates remain pending (never promoted)
  assert.ok(promoted.state.prospectCandidates.filter((c) => c.id !== target.id).every((c) => c.review_state === "pending_review"), "non-approved stay pending");

  // promotion is idempotent — a second pass promotes nothing new
  const again = promoteApproved(promoted.state, {});
  assert.equal((again.state.outreachOrganizations || []).length, 1, "promotion idempotent (no duplicate org)");
  ok("act/promotion promotes ONLY approved and ignores pending_review");
}

// ---- 5. NO send path exists ----------------------------------------------
function testNoSendPath() {
  const src = readFileSync(path.join(__dirname, "prospect-discovery.mjs"), "utf8");
  assert.ok(!/sendgrid|sendmail|smtp|nodemailer|mailgun/i.test(src), "no email-provider symbols in B5");
  assert.ok(!/runOutreachSend|assembleCompliantMessage|\.send\s*\(/i.test(src), "no send-message machinery in B5");
  // promoted contacts are seeded Not Enrolled, so promotion can never trigger a B2 send.
  const mod = src;
  assert.ok(/sequence_status:\s*"Not Enrolled"/.test(mod), "promoted contacts are Not Enrolled");
  ok("B5 has NO send path (no provider symbols; promoted contacts Not Enrolled)");
}

// ---- 6. dedup by EIN / domain / name -------------------------------------
function testDedup() {
  const cands = [
    { organization_name: "Acme Legal Aid Inc", ein: "11-1111111", website: "acme.org" },
    { organization_name: "Acme Legal Aid LLC", ein: "22-2222222", website: "different.org" }, // name collision
    { organization_name: "Beta Defender", ein: "11-1111111", website: "beta.org" },           // EIN collision w/ #1
    { organization_name: "Gamma Services", ein: "33-3333333", website: "acme.org" },            // domain collision w/ #1
    { organization_name: "Unique Org", ein: "44-4444444", website: "unique.org" }              // distinct
  ];
  const out = dedupCandidates(cands);
  assert.equal(out[0].is_duplicate, false, "first occurrence not a duplicate");
  assert.equal(out[1].is_duplicate, true, "name collision flagged");
  assert.equal(out[2].is_duplicate, true, "EIN collision flagged");
  assert.equal(out[3].is_duplicate, true, "domain collision flagged");
  assert.equal(out[4].is_duplicate, false, "distinct org not flagged");

  // keys + deterministic id
  assert.deepEqual(prospectKeys({ organization_name: "Acme Legal Aid Inc", ein: "11-1111111", website: "acme.org" }),
    ["ein:111111111", "domain:acme.org", "name:acme legal aid"], "keys derived from EIN/domain/name (suffix noise stripped)");
  const a = prospectCandidateId({ ein: "11-1111111", organization_name: "Acme" });
  const b = prospectCandidateId({ ein: "111111111", organization_name: "Totally Different" });
  assert.equal(a, b, "candidate id is deterministic on the primary (EIN) key");
  ok("dedup by EIN / domain / name + deterministic id");
}

// ---- 7. plan() is side-effect-free (never calls the discovery dep) --------
function testPlanIsPure() {
  let called = false;
  const ctx = { now: DAILY_TICK, env: {}, runProspectDiscovery: async () => { called = true; return { rows: SAMPLE_ROWS.irs_bmf }; } };
  const state = {
    prospectCandidates: [{ id: "prospect-cand-aaa", review_state: "pending_review", organization_name: "Greater Boston Legal Aid", website: "gbla.org" }],
    outreachOrganizations: []
  };
  const res = planProspects(state, ctx);
  assert.equal(called, false, "plan() never invokes the discovery dep (no network)");
  assert.equal(res.proposals.length, 1, "plan surfaces the pending candidate");
  assert.equal(res.state.prospectCandidates[0].classification, "legal_aid", "plan classifies from text deterministically");
  assert.ok(typeof res.state.prospectCandidates[0].score === "number", "plan scores the candidate");
  ok("plan() is side-effect-free (no network; classify/dedup/score only)");
}

// ---- 8. autopilot OFF => no discovery, no promotion ----------------------
async function testAutopilotOffInert() {
  const dep = fixtureDiscovery(SAMPLE_ROWS);
  const state = {
    prospectConfig: {}, prospectCandidates: [], prospectDiscoveryRuns: [],
    outreachOrganizations: [], outreachContacts: []
  };
  const store = makeStore(state);
  const registry = [buildProspectEngine({ runProspectDiscovery: dep })];
  const res = await runHeartbeat({ store, registry, env: {}, now: DAILY_TICK });
  const engineRun = res.engines.find((e) => e.engineId === PROSPECT_ENGINE_ID);
  assert.equal(engineRun.autopilot, false, "autopilot OFF by default");
  assert.equal(engineRun.acted, false, "act() did NOT run");
  assert.equal(dep.calls(), 0, "discovery dep NEVER called with autopilot OFF");
  const after = store.snapshot();
  assert.equal((after.prospectCandidates || []).length, 0, "nothing discovered");
  assert.equal((after.prospectDiscoveryRuns || []).length, 0, "no discovery run recorded");

  // Flip autopilot ON => discovery now runs.
  const store2 = makeStore({ ...state, autopilotSettings: { [PROSPECT_ENGINE_ID]: { enabled: true } } });
  const dep2 = fixtureDiscovery(SAMPLE_ROWS);
  const res2 = await runHeartbeat({ store: store2, registry: [buildProspectEngine({ runProspectDiscovery: dep2 })], env: {}, now: DAILY_TICK });
  const run2 = res2.engines.find((e) => e.engineId === PROSPECT_ENGINE_ID);
  assert.equal(run2.acted, true, "act() runs with autopilot ON");
  assert.ok(dep2.calls() >= 1, "discovery dep called with autopilot ON");
  assert.ok((store2.snapshot().prospectCandidates || []).length >= 2, "candidates staged with autopilot ON");
  ok("autopilot OFF => no discovery/promotion; ON => discovery runs");
}

// ---- 9. discovery throttled to once per ET day ---------------------------
async function testDiscoveryThrottle() {
  const dep = fixtureDiscovery(SAMPLE_ROWS);
  let state = { prospectConfig: {}, prospectCandidates: [], prospectDiscoveryRuns: [], outreachOrganizations: [], outreachContacts: [] };
  const a1 = await actProspects(state, { now: DAILY_TICK, env: {}, runProspectDiscovery: dep });
  state = a1.state;
  const callsAfterFirst = dep.calls();
  assert.ok(callsAfterFirst >= 1, "first act() runs discovery");
  const a2 = await actProspects(state, { now: DAILY_TICK, env: {}, runProspectDiscovery: dep });
  assert.equal(dep.calls(), callsAfterFirst, "second act() same ET day does NOT fetch again (throttled)");
  assert.ok(a2.results.some((r) => r.type === "discovery_skipped"), "throttle recorded as discovery_skipped");
  ok("discovery throttled to once per ET day");
}

// ---- 10. inert dep (Phase-0 posture): no dep => stages nothing ------------
async function testInertWithoutDep() {
  const res = await actProspects(
    { prospectConfig: {}, prospectCandidates: [], prospectDiscoveryRuns: [], outreachOrganizations: [], outreachContacts: [] },
    { now: DAILY_TICK, env: {} } // NO runProspectDiscovery dep
  );
  assert.equal((res.state.prospectCandidates || []).length, 0, "no dep => no candidates staged");
  const run = res.state.prospectDiscoveryRuns[0];
  assert.equal(run.live, false, "run records live:false (inert)");
  assert.equal(run.staged, 0, "nothing staged");
  ok("Phase-0 inert: no discovery dep => stages nothing");
}

async function main() {
  console.log("\nB5 — Prospect Discovery tests\n");
  testCollectionsPersist();
  testClassificationVocab();
  testEngineCannotSetApproved();
  await testNoApprovedFromEngine();
  await testActIgnoresPendingPromotesApproved();
  testNoSendPath();
  testDedup();
  testPlanIsPure();
  await testAutopilotOffInert();
  await testDiscoveryThrottle();
  await testInertWithoutDep();
  console.log(`\n${passed} checks passed.\n`);
}

main().catch((error) => { console.error("\nPROSPECT TEST FAILED:\n", error); process.exit(1); });
