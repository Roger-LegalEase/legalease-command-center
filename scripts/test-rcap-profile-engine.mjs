// Wave 2, Packet 6 — the Drive/Docs adapter and the profile engine.
//
// The adapter's job is to be honest about authority it does not have; the engine's job is to be
// honest about what a document did and did not say. Most of what follows tests the difference
// between "nothing here" and "we could not look", and between a message written for one
// organization and a message that merely has one organization's name in it.

import assert from "node:assert/strict";

import {
  RCAP_DRIVE_BLOCKER,
  RCAP_DRIVE_SCOPES,
  parseGoogleDocRef,
  rcapDriveGrantState,
  readRcapDocuments
} from "./rcap-drive-adapter.mjs";
import {
  RCAP_PROFILE_ENGINE_VERSION,
  extractRcapDocumentSections,
  parseRcapCorrectionLine,
  parseRcapUnknown,
  rcapProfileQualityGates,
  rcapSectionKeyFromHeading,
  rcapSpecificityScore,
  rcapValidateFifteenSections,
  runRcapProfilePass
} from "./rcap-profile-engine.mjs";
import { RCAP_FIXTURE_DOCUMENTS, rcapFixtureDocument, rcapFixtureDocumentReader } from "./fixtures/rcap-research-documents.mjs";
import { googleReadOnlyScopes } from "./google-workspace.mjs";

const checks = [];
function check(name, run) { run(); checks.push(name); }
const asyncChecks = [];
function checkAsync(name, run) { asyncChecks.push([name, run]); }

const AT = "2026-08-10T12:00:00.000Z";
const GRANTED = { account: { scopes: [...RCAP_DRIVE_SCOPES] }, env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" } };
const NOT_GRANTED = { account: { scopes: ["https://www.googleapis.com/auth/gmail.readonly"] }, env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" } };

// ---------------------------------------------------------------------------------------------
// Blocker B2 — the scopes really are absent
// ---------------------------------------------------------------------------------------------

check("the application's current grant does not include Drive or Docs", () => {
  for (const scope of RCAP_DRIVE_SCOPES) {
    assert.ok(
      !googleReadOnlyScopes.includes(scope),
      `${scope} is now in googleReadOnlyScopes. Blocker B2 has moved: revisit the adapter's blocked path and this test.`
    );
  }
});

check("grant state separates never-configured from never-granted", () => {
  assert.equal(rcapDriveGrantState({ account: {}, env: {} }).state, "not_configured");
  assert.equal(rcapDriveGrantState(NOT_GRANTED).state, "not_authorized");
  assert.deepEqual([...rcapDriveGrantState(NOT_GRANTED).missingScopes], [...RCAP_DRIVE_SCOPES]);
  assert.equal(rcapDriveGrantState(GRANTED).canRead, true);
});

check("the blocker states its whole anatomy", () => {
  for (const field of ["whatIsBlocked", "whyBlocked", "whatCanContinue", "owner", "requiredDecision"]) {
    assert.ok(RCAP_DRIVE_BLOCKER[field], `The Drive blocker must state ${field}.`);
  }
});

// ---------------------------------------------------------------------------------------------
// Reference parsing
// ---------------------------------------------------------------------------------------------

check("document references parse, and an unrecognised one is never guessed", () => {
  assert.equal(parseGoogleDocRef("https://docs.google.com/document/d/abc123def456/edit?usp=sharing").docId, "abc123def456");
  assert.equal(parseGoogleDocRef("https://drive.google.com/file/d/abc123def456/view").docId, "abc123def456");
  assert.equal(parseGoogleDocRef("https://drive.google.com/open?id=abc123def456").docId, "abc123def456");
  assert.equal(parseGoogleDocRef("see the shared folder").ok, false);
  assert.equal(parseGoogleDocRef("see the shared folder").reason, "unrecognized_reference");
  assert.equal(parseGoogleDocRef("").ok, false);
});

// ---------------------------------------------------------------------------------------------
// Reading — the adapter never reaches for authority it lacks
// ---------------------------------------------------------------------------------------------

checkAsync("without the scopes, the reader is never called and every document says why", async () => {
  let called = 0;
  const result = await readRcapDocuments(
    ["https://docs.google.com/document/d/synthetic-riverside-profile"],
    { accountId: "acct-riverside", now: AT, ...NOT_GRANTED, reader: async () => { called += 1; return { title: "x" }; } }
  );
  assert.equal(called, 0, "A missing scope must stop the fetch, not fail it after the fact.");
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].accessState, "not_authorized");
  assert.ok(result.sources[0].unreadableReason.includes("Drive and Docs"), "The source must carry the reason a reader can act on.");
  assert.equal(result.blocker.key, "drive_scope_missing");
  assert.equal(result.readCount, 0);
});

checkAsync("with the scopes, documents are read and fingerprinted", async () => {
  const result = await readRcapDocuments(
    ["https://docs.google.com/document/d/synthetic-riverside-profile"],
    { accountId: "acct-riverside", now: AT, ...GRANTED, reader: rcapFixtureDocumentReader() }
  );
  assert.equal(result.readCount, 1);
  const [source] = result.sources;
  assert.equal(source.accessState, "available");
  assert.equal(source.revisionId, "rev-riverside-1");
  assert.equal(source.retrievedAt, AT);
  assert.ok(source.refHash, "A read source must be fingerprinted so a later change is detectable.");
  assert.equal(result.blocker, null);
});

checkAsync("a missing document, a failing reader and a bad link stay three different answers", async () => {
  const result = await readRcapDocuments(
    [
      "https://docs.google.com/document/d/synthetic-does-not-exist",
      "https://docs.google.com/document/d/synthetic-explodes",
      "ask Roger for the link"
    ],
    {
      accountId: "acct-riverside", now: AT, ...GRANTED,
      reader: async (docId) => {
        if (docId === "synthetic-explodes") throw new Error("Upstream returned 500.");
        return null;
      }
    }
  );
  const states = result.sources.map((source) => source.accessState);
  assert.deepEqual(states, ["missing", "error", "missing"]);
  assert.ok(result.sources[1].unreadableReason.includes("500"), "A reader failure keeps its message.");
  assert.ok(result.sources[2].unreadableReason.includes("not a Google Doc reference"));
});

checkAsync("the same document linked twice is one source", async () => {
  const link = "https://docs.google.com/document/d/synthetic-riverside-profile";
  const result = await readRcapDocuments([link, `${link}/edit`], {
    accountId: "acct-riverside", now: AT, ...GRANTED, reader: rcapFixtureDocumentReader()
  });
  assert.equal(result.sources.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------------------------

check("headings are recognised by number, by label and by alias", () => {
  assert.equal(rcapSectionKeyFromHeading("6. Send-Ready Initial Email"), "send_ready_initial_email");
  assert.equal(rcapSectionKeyFromHeading("Send-Ready Initial Email"), "send_ready_initial_email");
  assert.equal(rcapSectionKeyFromHeading("Section 6 — Initial Email"), "send_ready_initial_email");
  assert.equal(rcapSectionKeyFromHeading("BEST SUBJECT LINE"), "best_subject_line");
  assert.equal(rcapSectionKeyFromHeading("Budget And Staffing Notes"), "", "An unknown heading must not be guessed into a section.");
  assert.equal(rcapSectionKeyFromHeading("This is a full sentence of body copy that happens to be long."), "");
});

check("content before the first heading, and under an unknown one, is reported not misfiled", () => {
  const extracted = extractRcapDocumentSections(rcapFixtureDocument("northgate").text);
  assert.ok(extracted.unassigned.some((paragraph) => paragraph.includes("typed before any heading")));
  assert.ok(extracted.unassigned.some((paragraph) => paragraph.includes("must not be filed under a neighbour")));
  assert.deepEqual(Object.keys(extracted.sections), ["strategic_verdict"]);
});

checkAsync("a Verified marker with no corroboration is demoted, not trusted", async () => {
  const classesFor = async (text) => {
    const read = await readRcapDocuments(["https://docs.google.com/document/d/synthetic-riverside-profile"], {
      accountId: "acct-riverside", now: AT, ...GRANTED,
      reader: async () => ({ title: "t", revisionId: "r", text })
    });
    const pass = runRcapProfilePass({
      accountId: "acct-riverside", organizationName: "Synthetic Riverside Justice Center", now: AT,
      trigger: "human_request", sources: read.sources, documents: [{ ref: read.sources[0].ref, text }]
    });
    return pass.claims.map((claim) => claim.factClass);
  };
  assert.deepEqual(
    await classesFor("1. Strategic Verdict\nVerified: They run clinics. Source: https://example.test/x"),
    ["verified_fact"]
  );
  assert.deepEqual(
    await classesFor("1. Strategic Verdict\nVerified: They run clinics."),
    ["supported_inference"],
    "A document that says Verified and cites nothing has asserted, not verified."
  );
});

check("a correction line parses only when both sides are present", () => {
  assert.deepEqual(parseRcapCorrectionLine("Website: https://old.test -> https://new.test"), {
    field: "website", currentValue: "https://old.test", proposedValue: "https://new.test"
  });
  assert.equal(parseRcapCorrectionLine("Website: https://new.test"), null);
  assert.equal(parseRcapCorrectionLine("Website: same -> same"), null);
});

check("an open question becomes an unknown only when it carries a resolution path", () => {
  assert.deepEqual(
    parseRcapUnknown("Who coordinates the clinics? Why it matters: the first message must reach them. How to resolve: check the clinic page."),
    {
      question: "Who coordinates the clinics?",
      whyItMatters: "the first message must reach them",
      howToResolve: "check the clinic page."
    }
  );
  assert.equal(parseRcapUnknown("Who coordinates the clinics?"), null);
});

// ---------------------------------------------------------------------------------------------
// The name-swap gate
// ---------------------------------------------------------------------------------------------

check("specificity is measured with the organization's name removed", () => {
  const claims = [
    { factClass: "verified_fact", text: "They run monthly record clearing clinics across three counties." },
    { factClass: "supported_inference", text: "Attorney review time caps clinic throughput." }
  ];
  const specific = rcapSpecificityScore(
    "Your monthly record clearing clinics across three counties are capped by attorney review time.",
    claims, { organizationName: "Synthetic Riverside Justice Center" }
  );
  assert.ok(specific.score >= 2, `Expected the specific message to score, got ${specific.score}.`);

  const generic = rcapSpecificityScore(
    "We would love to partner with Synthetic Riverside Justice Center to help more people.",
    claims, { organizationName: "Synthetic Riverside Justice Center" }
  );
  assert.equal(generic.score, 0, "A message whose only specific content is the name must score zero.");
});

// ---------------------------------------------------------------------------------------------
// End-to-end passes over the five fixture documents
// ---------------------------------------------------------------------------------------------

async function passFor(key, overrides = {}) {
  const fixture = rcapFixtureDocument(key);
  const read = await readRcapDocuments([`https://docs.google.com/document/d/${fixture.docId}`], {
    accountId: fixture.accountId, now: AT, ...GRANTED, reader: rcapFixtureDocumentReader()
  });
  return runRcapProfilePass({
    accountId: fixture.accountId,
    organizationName: fixture.organizationName,
    now: AT,
    trigger: "human_request",
    sources: read.sources,
    documents: [{ ref: read.sources[0].ref, text: fixture.text }],
    disqualified: fixture.disqualified === true,
    disqualificationReason: fixture.disqualificationReason || "",
    ...overrides
  });
}

checkAsync("the well-formed document produces a reviewable profile that passes every gate", async () => {
  const result = await passFor("riverside");
  assert.equal(result.blocked, false);
  assert.equal(result.gates.passed, true, `Blocking findings: ${result.gates.blocking.map((f) => f.message).join(" | ")}`);
  assert.equal(result.version.status, "needs_review");
  assert.equal(result.run.status, "succeeded");
  assert.equal(result.run.engineVersion, RCAP_PROFILE_ENGINE_VERSION);

  const verdict = result.sections.find((section) => section.sectionKey === "strategic_verdict");
  assert.ok(verdict.body.includes("monthly record clearing clinics"));
  assert.ok(verdict.claimIds.length >= 2);

  const verified = result.claims.filter((claim) => claim.factClass === "verified_fact");
  assert.equal(verified.length, 1, "Only the corroborated statement may be verified.");
  assert.ok(verified[0].sourceIds.length === 1);

  const demoted = result.claims.find((claim) => claim.text.includes("Clinic volume is limited"));
  assert.equal(demoted.factClass, "supported_inference");

  assert.equal(result.corrections.length, 2);
  assert.ok(result.corrections.every((correction) => correction.state === "proposed" && correction.applied === false));
  assert.deepEqual(result.corrections.map((correction) => correction.field).sort(), ["region", "website"]);

  assert.equal(result.unknowns.length, 1);
  assert.ok(result.unknowns[0].howToResolve.includes("clinic page"));

  assert.ok(result.dependencies.length > 0, "Every section built from a source must record the edge.");
  assert.ok(result.snapshot.sections.length === 15, "The snapshot freezes all fifteen sections, present or not.");
});

checkAsync("an unmarked document yields supported inferences, never verified facts", async () => {
  const result = await passFor("buckeye");
  assert.ok(result.claims.length >= 3);
  assert.equal(result.claims.filter((claim) => claim.factClass === "verified_fact").length, 0,
    "A document with no markers has verified nothing.");
  assert.ok(result.claims.every((claim) => claim.sourceIds.length === 1));
});

checkAsync("a clean disqualification is a successful outcome, not a gate failure", async () => {
  const result = await passFor("prairie");
  assert.equal(result.version.status, "disqualified");
  assert.equal(result.version.disqualificationReason, "Serves a different population and does not handle record clearing.");
  assert.equal(result.gates.blocking.length, 0, "A disqualified account is not required to have a send-ready email.");
  assert.equal(result.run.status, "succeeded");
});

checkAsync("the weak document fails every blocking gate, by name", async () => {
  const result = await passFor("lakeshore");
  assert.equal(result.gates.passed, false);
  const keys = result.gates.blocking.map((finding) => finding.key).sort();
  assert.deepEqual(keys, ["empty_follow_up", "generic_attachment", "guessed_email", "name_swap"].sort(),
    `Unexpected blocking set: ${keys.join(", ")}`);
  assert.equal(result.version.status, "blocked", "A profile that fails a blocking gate is blocked, not merely weak.");

  const nameSwap = result.gates.blocking.find((finding) => finding.key === "name_swap");
  assert.ok(nameSwap.message.includes("would read the same for any organization"));
  assert.equal(nameSwap.sectionLabel, "Send-Ready Initial Email");
});

checkAsync("a follow-up that only follows up is caught when it adds nothing", async () => {
  const gates = rcapProfileQualityGates({
    organizationName: "Synthetic Lakeshore Community Law",
    sections: [
      { sectionKey: "send_ready_initial_email", body: "Your monthly record clearing clinics are capped by attorney review time." },
      { sectionKey: "first_follow_up_email", body: "Just following up on my last note. Any thoughts?" }
    ],
    claims: [{ factClass: "verified_fact", text: "They run monthly record clearing clinics.", sourceIds: ["s1"] }]
  });
  assert.ok(gates.blocking.some((finding) => finding.key === "empty_follow_up"));

  const better = rcapProfileQualityGates({
    organizationName: "Synthetic Lakeshore Community Law",
    sections: [
      { sectionKey: "send_ready_initial_email", body: "Your monthly record clearing clinics are capped by attorney review time." },
      { sectionKey: "first_follow_up_email", body: "Just following up with one thing: a similar three county clinic cut review time per case." }
    ],
    claims: [{ factClass: "verified_fact", text: "They run monthly record clearing clinics.", sourceIds: ["s1"] }]
  });
  assert.ok(!better.blocking.some((finding) => finding.key === "empty_follow_up"),
    "A follow-up that adds a new specific is allowed to use the phrase.");
});

checkAsync("nothing readable plus something blocked is a blocked run, not an empty profile", async () => {
  const read = await readRcapDocuments(["https://docs.google.com/document/d/synthetic-riverside-profile"], {
    accountId: "acct-riverside", now: AT, ...NOT_GRANTED
  });
  const result = runRcapProfilePass({
    accountId: "acct-riverside",
    organizationName: "Synthetic Riverside Justice Center",
    now: AT,
    trigger: "human_request",
    sources: read.sources,
    documents: []
  });
  assert.equal(result.blocked, true);
  assert.equal(result.run.status, "blocked");
  assert.equal(result.run.blockerKey, "drive_scope_missing");
  assert.ok(result.run.reason.includes("Drive and Docs"));
  assert.equal(result.version, null, "A blocked run produces no version to review.");
  assert.equal(result.validation.present, 0);
});

checkAsync("one account's document never contributes to another account's profile", async () => {
  const riverside = rcapFixtureDocument("riverside");
  const buckeye = rcapFixtureDocument("buckeye");
  const read = await readRcapDocuments([`https://docs.google.com/document/d/${riverside.docId}`], {
    accountId: riverside.accountId, now: AT, ...GRANTED, reader: rcapFixtureDocumentReader()
  });
  // The document belongs to Riverside; the pass is for Buckeye. The source is not in Buckeye's
  // source set, so it contributes nothing rather than leaking across.
  const result = runRcapProfilePass({
    accountId: buckeye.accountId,
    organizationName: buckeye.organizationName,
    now: AT,
    trigger: "human_request",
    sources: [],
    documents: [{ ref: read.sources[0].ref, text: riverside.text }]
  });
  assert.equal(result.claims.length, 0, "A document with no matching source for this account must contribute nothing.");
  assert.equal(result.validation.present, 0);
});

// ---------------------------------------------------------------------------------------------
// Fifteen-section validation
// ---------------------------------------------------------------------------------------------

checkAsync("validation names what is missing rather than reporting a bare count", async () => {
  const result = await passFor("northgate");
  assert.equal(result.validation.total, 15);
  assert.equal(result.validation.present, 1);
  assert.equal(result.validation.complete, false);
  assert.equal(result.validation.sections.length, 15);
  const advisory = result.gates.advisory.find((finding) => finding.key === "missing_sections");
  assert.ok(advisory.message.includes("Best Subject Line"), "The advisory must name the sections, not just count them.");
});

check("validation distinguishes a section with nothing to say from one nothing addressed", () => {
  const validation = rcapValidateFifteenSections([
    { sectionKey: "strategic_verdict", state: "needs_review", body: "Worth pursuing." },
    { sectionKey: "deal_path", state: "draft", body: "", emptyReason: "No read document addressed this section." }
  ]);
  const byKey = new Map(validation.sections.map((row) => [row.sectionKey, row]));
  assert.equal(byKey.get("strategic_verdict").state, "needs_review");
  assert.equal(byKey.get("deal_path").state, "empty");
  assert.equal(byKey.get("deal_path").reason, "No read document addressed this section.");
  assert.equal(byKey.get("best_subject_line").state, "missing");
  assert.equal(validation.present, 1);
});

// ---------------------------------------------------------------------------------------------
// Determinism and fixture hygiene
// ---------------------------------------------------------------------------------------------

checkAsync("the same inputs produce byte-identical records", async () => {
  const first = await passFor("riverside");
  const second = await passFor("riverside");
  assert.equal(first.version.contentHash, second.version.contentHash);
  assert.equal(first.snapshot.contentHash, second.snapshot.contentHash);
  assert.deepEqual(first.claims.map((claim) => claim.id), second.claims.map((claim) => claim.id));
});

check("every fixture is synthetic", () => {
  assert.equal(RCAP_FIXTURE_DOCUMENTS.length, 5, "The pilot is a five-document extraction.");
  for (const document of RCAP_FIXTURE_DOCUMENTS) {
    assert.ok(/^Synthetic /.test(document.organizationName), `${document.key} must name a synthetic organization.`);
    const hosts = document.text.match(/https?:\/\/([a-z0-9.-]+)/gi) || [];
    for (const host of hosts) {
      assert.ok(
        /\.test(\/|$)/.test(host) || /example\.(com|org|net)(\/|$)/.test(host),
        `${document.key} references ${host}; fixtures may only use .test or example.com/org/net.`
      );
    }
    const emails = document.text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    for (const email of emails) {
      assert.ok(/\.test$/.test(email) || /@example\.(com|org|net)$/.test(email), `${document.key} references ${email}.`);
    }
  }
});

// ---------------------------------------------------------------------------------------------

for (const [name, run] of asyncChecks) {
  await run();
  checks.push(name);
}

console.log(`RCAP Wave 2 Packet 6 engine verified: ${checks.length} checks`);
for (const name of checks) console.log(`  - ${name}`);
