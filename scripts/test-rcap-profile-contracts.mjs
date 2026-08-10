// Wave 2, Packet 5 — the source, claim and profile persistence contracts.
//
// These records are the first the RCAP CRM owns outright, so the tests are mostly about what the
// contracts REFUSE: a claim that cites nothing, a fact borrowed from another account, a
// correction applied without a decision, an invalidation that goes wider than the change that
// caused it, and a regeneration that would quietly discard something a person wrote.

import assert from "node:assert/strict";

import {
  RCAP_APPEND_ONLY_PROFILE_COLLECTIONS,
  RCAP_CLAIM_STATES,
  RCAP_PROFILE_COLLECTIONS,
  RCAP_RUN_STATUSES,
  RCAP_SOURCE_ACCESS_STATES,
  RcapContractError,
  buildRcapClaim,
  buildRcapProfileDependency,
  buildRcapProfileRun,
  buildRcapProfileSection,
  buildRcapProfileSnapshot,
  buildRcapProfileUnknown,
  buildRcapProfileVersion,
  buildRcapProposedCorrection,
  buildRcapSource,
  rcapCompareProfileSnapshots,
  rcapContentHash,
  rcapRegenerationPlan,
  rcapRunIsRetryable,
  rcapSectionsInvalidatedBy,
  rcapSourceIsStale
} from "./rcap-profile-contracts.mjs";
import { RCAP_PROFILE_SECTIONS } from "./rcap-prospect-registries.mjs";
import { appendOnlyCollections, coreStateCollections } from "./storage.mjs";

const checks = [];
function check(name, run) { run(); checks.push(name); }

const ACCOUNT = "acct-riverside";
const OTHER = "acct-prairie";
const AT = "2026-08-10T12:00:00.000Z";

function readSource(overrides = {}) {
  return buildRcapSource({
    accountId: ACCOUNT,
    kind: "google_doc",
    ref: "https://docs.google.com/document/d/synthetic-riverside-profile",
    title: "Riverside research profile",
    accessState: "available",
    retrievedAt: AT,
    revisionId: "rev-1",
    contentChecksum: "sum-1",
    ...overrides
  });
}

function throws(run, fragment) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof RcapContractError, `Expected a contract error, got ${error?.name}.`);
    assert.ok(String(error.message).includes(fragment), `Expected "${fragment}" in: ${error.message}`);
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Registration — the B1 trap
// ---------------------------------------------------------------------------------------------

check("every profile collection is registered with the store", () => {
  for (const collection of RCAP_PROFILE_COLLECTIONS) {
    assert.ok(
      coreStateCollections.includes(collection),
      `${collection} is written but not registered in coreStateCollections, so every write is silently dropped on Supabase.`
    );
  }
  assert.equal(new Set(RCAP_PROFILE_COLLECTIONS).size, RCAP_PROFILE_COLLECTIONS.length, "No collection may be listed twice.");
});

check("snapshots are append-only in the store, not just by convention", () => {
  for (const collection of RCAP_APPEND_ONLY_PROFILE_COLLECTIONS) {
    assert.ok(appendOnlyCollections.has(collection), `${collection} must be append-only: a comparison basis that can be rewritten proves nothing.`);
  }
});

// ---------------------------------------------------------------------------------------------
// Hashing and identity
// ---------------------------------------------------------------------------------------------

check("hashes are stable across key order and sensitive to content", () => {
  assert.equal(rcapContentHash({ a: 1, b: [2, 3] }), rcapContentHash({ b: [2, 3], a: 1 }));
  assert.notEqual(rcapContentHash({ a: 1, b: [2, 3] }), rcapContentHash({ a: 1, b: [3, 2] }));
  assert.notEqual(rcapContentHash({ a: 1 }), rcapContentHash({ a: 2 }));
});

check("the same inputs build the same record id twice", () => {
  assert.equal(readSource().id, readSource().id);
  assert.notEqual(readSource().id, readSource({ ref: "https://example.test/other" }).id);
});

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

check("a source that was never read carries no revision, checksum or read time", () => {
  const source = buildRcapSource({
    accountId: ACCOUNT,
    kind: "google_doc",
    ref: "https://docs.google.com/document/d/synthetic-unread",
    accessState: "not_authorized",
    unreadableReason: "Drive read access has not been granted.",
    revisionId: "rev-9",
    contentChecksum: "sum-9",
    retrievedAt: AT
  });
  assert.equal(source.revisionId, "", "An unread document cannot report a revision.");
  assert.equal(source.contentChecksum, "", "An unread document cannot report a checksum.");
  assert.equal(source.retrievedAt, "", "An unread document was never retrieved.");
  assert.equal(source.unreadableReason, "Drive read access has not been granted.");
});

check("an unreadable source must say why", () => {
  throws(() => buildRcapSource({ accountId: ACCOUNT, kind: "google_doc", ref: "x", accessState: "error" }), "must say why");
});

check("a read source must record when it was read", () => {
  throws(() => buildRcapSource({ accountId: ACCOUNT, kind: "google_doc", ref: "x", accessState: "available" }), "when it was read");
});

check("not-authorized, missing and error are distinct blocking states", () => {
  const blocking = RCAP_SOURCE_ACCESS_STATES.filter((entry) => entry.blocking).map((entry) => entry.key);
  assert.deepEqual(blocking, ["not_authorized", "missing", "error"]);
  const readable = RCAP_SOURCE_ACCESS_STATES.filter((entry) => entry.readable).map((entry) => entry.key);
  assert.deepEqual(readable, ["available"], "Only a document we actually read is readable.");
});

check("staleness is unknown, not false, when either side has no revision", () => {
  assert.equal(rcapSourceIsStale(readSource(), { revisionId: "rev-2" }), true);
  assert.equal(rcapSourceIsStale(readSource(), { revisionId: "rev-1" }), false);
  assert.equal(rcapSourceIsStale(readSource({ revisionId: "" , contentChecksum: ""}), { revisionId: "rev-2" }), false,
    "With nothing to compare, the honest answer is not-stale rather than an invented change.");
});

// ---------------------------------------------------------------------------------------------
// Claims — rule 23 and rule 9
// ---------------------------------------------------------------------------------------------

check("a verified fact must cite a source; a recommendation must not need one", () => {
  const source = readSource();
  const owners = new Map([[source.id, ACCOUNT]]);
  const fact = buildRcapClaim({
    accountId: ACCOUNT,
    sectionKey: "strategic_verdict",
    factClass: "verified_fact",
    text: "The clinic runs monthly record-clearing events.",
    sourceIds: [source.id]
  }, { sourceOwners: owners });
  assert.equal(fact.factLabel, "Verified");
  assert.deepEqual([...fact.sourceIds], [source.id]);

  throws(() => buildRcapClaim({
    accountId: ACCOUNT,
    sectionKey: "strategic_verdict",
    factClass: "verified_fact",
    text: "The clinic runs monthly record-clearing events."
  }), "must cite at least one source");

  const recommendation = buildRcapClaim({
    accountId: ACCOUNT,
    sectionKey: "strongest_sales_angle",
    factClass: "recommendation",
    text: "Lead with assisted-use rather than volume."
  });
  assert.equal(recommendation.sourceIds.length, 0);
  assert.equal(recommendation.factLabel, "Le-E recommendation");
});

check("a claim cannot cite another account's source", () => {
  const mine = readSource();
  const theirs = buildRcapSource({ accountId: OTHER, kind: "website", ref: "https://prairie-legal.test", accessState: "available", retrievedAt: AT });
  const owners = new Map([[mine.id, ACCOUNT], [theirs.id, OTHER]]);
  throws(() => buildRcapClaim({
    accountId: ACCOUNT,
    sectionKey: "strategic_verdict",
    factClass: "verified_fact",
    text: "Borrowed from the wrong organization.",
    sourceIds: [theirs.id]
  }, { sourceOwners: owners }), `belongs to account ${OTHER}`);
});

check("a claim must name a real section and carry text", () => {
  throws(() => buildRcapClaim({ accountId: ACCOUNT, sectionKey: "invented_section", factClass: "human_note", text: "x" }), "unknown profile section");
  throws(() => buildRcapClaim({ accountId: ACCOUNT, sectionKey: "strategic_verdict", factClass: "human_note", text: "  " }), "asserts nothing");
});

check("confidence is a number or absent, never a default", () => {
  const base = { accountId: ACCOUNT, sectionKey: "strategic_verdict", factClass: "human_note", text: "note" };
  assert.equal(buildRcapClaim(base).confidence, null, "An unmeasured confidence must not become 0.5.");
  assert.equal(buildRcapClaim({ ...base, confidence: 0.8 }).confidence, 0.8);
  assert.equal(buildRcapClaim({ ...base, confidence: 4 }).confidence, 1);
  assert.equal(buildRcapClaim({ ...base, confidence: "not a number" }).confidence, null);
});

check("an undecided claim carries no decision maker", () => {
  const claim = buildRcapClaim({ accountId: ACCOUNT, sectionKey: "strategic_verdict", factClass: "human_note", text: "note", decidedBy: "roger" });
  assert.equal(claim.state, "proposed");
  assert.equal(claim.decidedBy, "", "A proposed claim has not been decided by anyone.");
  assert.ok(RCAP_CLAIM_STATES.includes(claim.state));
});

// ---------------------------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------------------------

check("a failed or blocked run must record why, and a finished run when", () => {
  throws(() => buildRcapProfileRun({ accountId: ACCOUNT, trigger: "human_request", status: "failed", finishedAt: AT }), "must record why");
  throws(() => buildRcapProfileRun({ accountId: ACCOUNT, trigger: "human_request", status: "succeeded" }), "when it finished");
  const blocked = buildRcapProfileRun({
    accountId: ACCOUNT, trigger: "human_request", status: "blocked", finishedAt: AT,
    reason: "Drive read access has not been granted.", blockerKey: "drive_scope_missing"
  });
  assert.equal(blocked.blockerKey, "drive_scope_missing");
  assert.ok(RCAP_RUN_STATUSES.includes(blocked.status));
});

check("the input hash ignores ordering so a rerun is detectable", () => {
  const base = { accountId: ACCOUNT, trigger: "import", engineVersion: "v1" };
  const a = buildRcapProfileRun({ ...base, sourceIds: ["s1", "s2"], sectionKeys: ["strategic_verdict", "deal_path"] });
  const b = buildRcapProfileRun({ ...base, sourceIds: ["s2", "s1"], sectionKeys: ["deal_path", "strategic_verdict"] });
  assert.equal(a.inputHash, b.inputHash);
  const c = buildRcapProfileRun({ ...base, sourceIds: ["s1"], sectionKeys: ["deal_path"] });
  assert.notEqual(a.inputHash, c.inputHash);
});

check("a blocked run is never retried automatically", () => {
  const blocked = { status: "blocked", attempt: 1 };
  const failed = { status: "failed", attempt: 1 };
  assert.equal(rcapRunIsRetryable(blocked), false, "Retrying a missing OAuth scope only hides the blocker.");
  assert.equal(rcapRunIsRetryable(failed), true);
  assert.equal(rcapRunIsRetryable({ status: "failed", attempt: 3 }), false);
});

// ---------------------------------------------------------------------------------------------
// Versions, sections and comparison
// ---------------------------------------------------------------------------------------------

check("an approved version records its approver; a disqualification carries its reasoning", () => {
  throws(() => buildRcapProfileVersion({ accountId: ACCOUNT, status: "approved" }), "who approved it");
  const disqualified = buildRcapProfileVersion({
    accountId: ACCOUNT, status: "disqualified", disqualificationReason: "Serves a different population entirely."
  });
  assert.equal(disqualified.disqualificationReason, "Serves a different population entirely.");
});

check("an empty section must say why it is empty", () => {
  throws(() => buildRcapProfileSection({ accountId: ACCOUNT, sectionKey: "deal_path" }), "why it is empty");
  const empty = buildRcapProfileSection({ accountId: ACCOUNT, sectionKey: "deal_path", emptyReason: "No pricing conversation has happened yet." });
  assert.equal(empty.body, "");
  assert.equal(empty.emptyReason, "No pricing conversation has happened yet.");
});

check("a human edit records who made it and freezes its own hash", () => {
  throws(() => buildRcapProfileSection({ accountId: ACCOUNT, sectionKey: "deal_path", body: "text", humanEdited: true }), "who edited it");
  const edited = buildRcapProfileSection({
    accountId: ACCOUNT, sectionKey: "deal_path", body: "Roger's wording.", humanEdited: true, editedBy: "roger", editedAt: AT
  });
  assert.ok(edited.humanEditHash, "The edit must be fingerprinted so regeneration can detect it.");
  const machine = buildRcapProfileSection({ accountId: ACCOUNT, sectionKey: "deal_path", body: "Roger's wording." });
  assert.equal(machine.humanEditHash, "");
});

check("a section cannot claim another account's claims", () => {
  const owners = new Map([["claim-theirs", OTHER]]);
  throws(() => buildRcapProfileSection({
    accountId: ACCOUNT, sectionKey: "deal_path", body: "text", claimIds: ["claim-theirs"]
  }, { claimOwners: owners }), `belongs to account ${OTHER}`);
});

check("version comparison names every section and reports unchanged honestly", () => {
  const before = buildRcapProfileSnapshot({
    accountId: ACCOUNT, versionId: "v1", capturedAt: AT,
    sections: [
      { sectionKey: "strategic_verdict", state: "approved", body: "Worth pursuing.", contentHash: "h1" },
      { sectionKey: "deal_path", state: "draft", body: "Unclear.", contentHash: "h2" }
    ]
  });
  const after = buildRcapProfileSnapshot({
    accountId: ACCOUNT, versionId: "v2", capturedAt: AT,
    sections: [
      { sectionKey: "strategic_verdict", state: "approved", body: "Worth pursuing.", contentHash: "h1" },
      { sectionKey: "deal_path", state: "draft", body: "Pilot first.", contentHash: "h3" },
      { sectionKey: "likely_objections", state: "draft", body: "Cost.", contentHash: "h4" }
    ]
  });
  const diff = rcapCompareProfileSnapshots(before, after);
  assert.equal(diff.identical, false);
  assert.equal(diff.changedCount, 2);
  const byKey = new Map(diff.sections.map((entry) => [entry.sectionKey, entry.change]));
  assert.equal(byKey.get("strategic_verdict"), "unchanged");
  assert.equal(byKey.get("deal_path"), "changed");
  assert.equal(byKey.get("likely_objections"), "added");
  assert.deepEqual(
    diff.sections.map((entry) => entry.sectionNumber),
    [...diff.sections.map((entry) => entry.sectionNumber)].sort((a, b) => a - b),
    "Sections must compare in their declared order."
  );
  assert.equal(rcapCompareProfileSnapshots(before, before).identical, true);
});

// ---------------------------------------------------------------------------------------------
// Unknowns and corrections
// ---------------------------------------------------------------------------------------------

check("an unknown must carry a resolution path, not just a gap", () => {
  throws(() => buildRcapProfileUnknown({ accountId: ACCOUNT, sectionKey: "best_contact_strategy", question: "Who runs the clinic?" }),
    "why it matters and how to resolve it");
  const unknown = buildRcapProfileUnknown({
    accountId: ACCOUNT,
    sectionKey: "best_contact_strategy",
    question: "Who runs the clinic day to day?",
    whyItMatters: "The first message has to reach the person who schedules events.",
    howToResolve: "Check the clinic page and the last event flyer."
  });
  assert.equal(unknown.state, "open");
  throws(() => buildRcapProfileUnknown({ ...unknown, state: "answered", answer: "" }), "must carry the answer");
});

check("a correction is a record, never an applied write", () => {
  const source = readSource();
  const owners = new Map([[source.id, ACCOUNT]]);
  const correction = buildRcapProposedCorrection({
    accountId: ACCOUNT,
    field: "website",
    currentValue: "https://old.riverside-justice.test",
    proposedValue: "https://riverside-justice.test",
    rationale: "The old host redirects to the new one.",
    sourceIds: [source.id]
  }, { sourceOwners: owners });
  assert.equal(correction.state, "proposed");
  assert.equal(correction.applied, false, "Proposing must never mark a field as changed.");
  assert.equal(correction.decidedBy, "");

  throws(() => buildRcapProposedCorrection({
    accountId: ACCOUNT, field: "website", currentValue: "same", proposedValue: "same", sourceIds: [source.id]
  }, { sourceOwners: owners }), "changes nothing");

  throws(() => buildRcapProposedCorrection({
    accountId: ACCOUNT, field: "website", currentValue: "a", proposedValue: "b"
  }), "must cite the sources");

  throws(() => buildRcapProposedCorrection({
    accountId: ACCOUNT, field: "website", currentValue: "a", proposedValue: "b", sourceIds: [source.id], state: "accepted"
  }, { sourceOwners: owners }), "who decided");
});

// ---------------------------------------------------------------------------------------------
// Targeted invalidation
// ---------------------------------------------------------------------------------------------

check("only the sections that used a changed source go stale", () => {
  const dependencies = [
    buildRcapProfileDependency({ accountId: ACCOUNT, sectionKey: "strategic_verdict", dependsOnKind: "source", dependsOnId: "s1" }),
    buildRcapProfileDependency({ accountId: ACCOUNT, sectionKey: "likely_objections", dependsOnKind: "source", dependsOnId: "s2" })
  ];
  const stale = rcapSectionsInvalidatedBy({ sourceIds: ["s1"] }, dependencies);
  assert.deepEqual(stale.map((entry) => entry.sectionKey), ["strategic_verdict"]);
  assert.ok(stale[0].reason.includes("source"), "A stale section must say what invalidated it.");
  assert.deepEqual(rcapSectionsInvalidatedBy({ sourceIds: ["s-unused"] }, dependencies), []);
});

check("invalidation follows section-to-section edges and terminates on a cycle", () => {
  const dependencies = [
    buildRcapProfileDependency({ accountId: ACCOUNT, sectionKey: "strategic_verdict", dependsOnKind: "source", dependsOnId: "s1" }),
    buildRcapProfileDependency({ accountId: ACCOUNT, sectionKey: "strongest_sales_angle", dependsOnKind: "section", dependsOnId: "strategic_verdict" }),
    buildRcapProfileDependency({ accountId: ACCOUNT, sectionKey: "outreach_sequence", dependsOnKind: "section", dependsOnId: "strongest_sales_angle" }),
    // A deliberate cycle: the walk must stop rather than spin.
    buildRcapProfileDependency({ accountId: ACCOUNT, sectionKey: "strategic_verdict", dependsOnKind: "section", dependsOnId: "outreach_sequence" })
  ];
  const stale = rcapSectionsInvalidatedBy({ sourceIds: ["s1"] }, dependencies).map((entry) => entry.sectionKey);
  assert.deepEqual(stale.sort(), ["outreach_sequence", "strategic_verdict", "strongest_sales_angle"].sort());
});

check("a section cannot depend on itself", () => {
  throws(() => buildRcapProfileDependency({
    accountId: ACCOUNT, sectionKey: "deal_path", dependsOnKind: "section", dependsOnId: "deal_path"
  }), "cannot depend on itself");
});

// ---------------------------------------------------------------------------------------------
// Regeneration
// ---------------------------------------------------------------------------------------------

check("regeneration preserves a human edit unless told otherwise, and says so", () => {
  const sections = [
    { sectionKey: "strategic_verdict", humanEdited: false },
    { sectionKey: "deal_path", humanEdited: true, editedBy: "roger" }
  ];
  const plan = rcapRegenerationPlan(sections, []);
  assert.deepEqual([...plan.regenerate], ["strategic_verdict"]);
  assert.equal(plan.preserved.length, 1);
  assert.equal(plan.preserved[0].sectionKey, "deal_path");
  assert.ok(plan.preserved[0].reason.includes("roger"), "The reason must name who would be overwritten.");

  const forced = rcapRegenerationPlan(sections, [], { replaceHumanEdits: true });
  assert.deepEqual([...forced.regenerate].sort(), ["deal_path", "strategic_verdict"]);
  assert.equal(forced.preserved.length, 0);

  const targeted = rcapRegenerationPlan(sections, ["deal_path"]);
  assert.deepEqual([...targeted.regenerate], []);
});

// ---------------------------------------------------------------------------------------------
// The section contract itself
// ---------------------------------------------------------------------------------------------

check("all fifteen sections remain addressable by key", () => {
  assert.equal(RCAP_PROFILE_SECTIONS.length, 15);
  for (const section of RCAP_PROFILE_SECTIONS) {
    const built = buildRcapProfileSection({ accountId: ACCOUNT, sectionKey: section.key, body: "text" });
    assert.equal(built.sectionNumber, section.number);
    assert.equal(built.sectionLabel, section.label);
  }
});

console.log(`RCAP Wave 2 Packet 5 contracts verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
