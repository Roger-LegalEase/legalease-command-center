// B2 go-live staging tests — proves the per-classification routing, the approved sequences,
// the compliant Delaware identity, and the fail-closed send gate BEFORE any live key is set:
//   1.  assembleCompliantMessage no longer throws with the Delaware config (baked defaults).
//   2-7 classification -> sequence mapping (verified-reporting / clinic-extension).
//   8.  CSI => do-not-enroll; no message assembled, no send.
//   9.  unknown / unmapped => not sent; NEVER defaults to a sequence.
//   10. OUTREACH_LIVE_SEND off => decision is dry_run with verifiable metadata.
//   11. live off => the live ("network") branch is never selected.
//   12. calendar link is a real HTML hyperlink in the assembled HTML body.
//   13. plaintext body contains the usable calendar URL.
//   14. unsubscribe + footer + Delaware postal address are present.

import assert from "node:assert";
import {
  OUTREACH_SEQUENCES, OUTREACH_SEQUENCE_IDS, CLASSIFICATION_SEQUENCE_MAP,
  DO_NOT_ENROLL_CLASSIFICATIONS, CALENDAR_URL, resolveSequenceForClassification,
  getSequenceTouch, renderTouchText, renderTouchHtml
} from "./outreach-sequences.mjs";
import {
  outreachConfigOf, OUTREACH_IDENTITY_DEFAULTS, assembleCompliantMessage, validateCompliance,
  resolveOutreachSendDecision, planOutreach, splitPostalAddress, OUTREACH_CLASSIFICATIONS
} from "./outreach-os.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const DELAWARE_ADDRESS = "8 The Green, Suite D, Dover, DE 19901";
const IN_WINDOW = new Date("2026-07-01T15:00:00Z"); // Wed 11:00 ET — inside the sending window

function contactFor(classification, overrides = {}) {
  return {
    contact_id: "c-1", contact_name: "Jane Roe", email: "jane@example.com",
    linked_account_id: "org-1", campaign_id: "camp-1", sequence_status: "Enrolled",
    classification, ...overrides
  };
}
function stepFor(seqId) {
  const t = getSequenceTouch(seqId, 1);
  return { campaign_id: "camp-1", step_number: t.step_number, subject: t.subject, body: t.body };
}
function assembleFor(classification, seqId, { config, env = {} } = {}) {
  return assembleCompliantMessage({
    contact: contactFor(classification),
    org: { account_id: "org-1", organization_name: "Acme Nonprofit" },
    step: { ...stepFor(seqId), classification },
    config: config || outreachConfigOf({}),
    env
  });
}

// ---- 1. Delaware config => assembleCompliantMessage stops throwing -------------
function testDelawareConfigNoThrow() {
  const cfg = outreachConfigOf({}); // no stored config => baked Delaware identity defaults
  assert.equal(cfg.postalAddress, DELAWARE_ADDRESS, "Delaware postal address is the default");
  assert.equal(cfg.fromEmail, "roger@example.com", "from email default");
  assert.equal(cfg.fromName, "Roger Roman", "from name default");
  assert.equal(cfg.sendingDomain, "legalease.com", "sending domain default");
  assert.doesNotThrow(() => assembleFor("nonprofit", "verified-reporting", { config: cfg }),
    "assembleCompliantMessage does not throw with the Delaware compliance config");
  ok("Delaware config set; assembleCompliantMessage no longer throws for missing compliance config");
}

// ---- 2-7. classification -> sequence mapping ----------------------------------
function testClassificationMapping() {
  const expected = {
    "verified-reporting": ["nonprofit", "funders_intermediaries"],
    "government-accountability": ["government", "county_reentry"],
    "clinic-extension": ["legal_aid", "public_defender", "clinic"],
    "employer-pathway": ["second_chance_employer"]
  };
  for (const [seqId, classes] of Object.entries(expected)) {
    for (const c of classes) {
      const r = resolveSequenceForClassification(c);
      assert.equal(r.ok, true, `${c} maps`);
      assert.equal(r.sequenceId, seqId, `${c} -> ${seqId}`);
    }
  }
  // government MOVED from verified-reporting to government-accountability
  assert.equal(resolveSequenceForClassification("government").sequenceId, "government-accountability", "government moved to government-accountability");
  // case-insensitive
  assert.equal(resolveSequenceForClassification("Nonprofit").sequenceId, "verified-reporting", "case-insensitive");
  // all four sequences exist and carry the [1,4,9,16,30] cadence with 5 touches
  assert.deepEqual([...OUTREACH_SEQUENCE_IDS].sort(),
    ["clinic-extension", "employer-pathway", "government-accountability", "verified-reporting"], "four sequences loaded");
  for (const id of OUTREACH_SEQUENCE_IDS) {
    assert.deepEqual(OUTREACH_SEQUENCES[id].cadence, [1, 4, 9, 16, 30], `${id} cadence`);
    assert.equal(OUTREACH_SEQUENCES[id].touches.length, 5, `${id} has 5 touches`);
  }
  ok("classifications map to the correct sequences (nonprofit/funders->verified; gov/county_reentry->government-accountability; legal_aid/PD/clinic->clinic; second_chance_employer->employer-pathway)");
}

// ---- 8. CSI => do-not-enroll; nothing assembled or queued ---------------------
function testCsiDoNotEnroll() {
  assert.ok(DO_NOT_ENROLL_CLASSIFICATIONS.has("csi"), "csi is a do-not-enroll classification");
  const r = resolveSequenceForClassification("csi");
  assert.equal(r.ok, false, "csi does not resolve to a sequence");
  assert.equal(r.reason, "do_not_enroll", "csi reason is do_not_enroll");
  assert.equal(r.sequenceId, "", "csi has no sequence");

  // planOutreach must not queue a CSI contact (no message assembled).
  const state = {
    outreachConfig: { ...OUTREACH_IDENTITY_DEFAULTS },
    outreachOrganizations: [{ account_id: "org-1", organization_name: "CSI Corp" }],
    outreachContacts: [contactFor("csi")],
    outreachCampaigns: [{ campaign_id: "camp-1", status: "active" }],
    outreachSequenceSteps: [{ campaign_id: "camp-1", step_number: 1, subject: "x", body: "y" }],
    outreachAttempts: [], approvalQueue: [], partners: [], pilots: []
  };
  const { proposals, observations } = planOutreach(state, { now: IN_WINDOW, env: {} });
  assert.equal(proposals.length, 0, "no proposal queued for CSI");
  assert.ok(observations.some((o) => o.type === "skip_do_not_enroll"), "CSI skipped as do_not_enroll");

  // and the send gate fails closed too
  const decision = resolveOutreachSendDecision({ classification: "csi", to: "x@example.com", subject: "s", text: "t" }, { env: {} });
  assert.equal(decision.status, "not_sent", "CSI send decision is not_sent");
  assert.equal(decision.reason, "do_not_enroll", "CSI send reason is do_not_enroll");
  ok("CSI returns do-not-enroll; no message assembled and no send");
}

// ---- 9. unknown / unmapped => not sent, never defaults ------------------------
function testUnmappedFailsClosed() {
  for (const c of ["unknown", "", "random", "charity", "vendor"]) {
    const r = resolveSequenceForClassification(c);
    assert.equal(r.ok, false, `${c || "(empty)"} does not map`);
    assert.equal(r.sequenceId, "", `${c || "(empty)"} gets NO default sequence`);
    assert.equal(r.reason, "unmapped_classification", `${c || "(empty)"} reason is unmapped_classification`);
  }
  const decision = resolveOutreachSendDecision({ classification: "unknown", to: "x@example.com", subject: "s", text: "t" }, { env: {} });
  assert.equal(decision.status, "not_sent", "unmapped => not_sent");
  assert.equal(decision.reason, "unmapped_classification", "unmapped reason preserved");
  assert.equal(decision.classification, "unknown", "original classification reported");
  ok("unknown/unmapped classification fails closed (not_sent, never defaults)");
}

// ---- coverage: every real prospect classification maps EXCEPT csi (do-not-enroll) ---
function testEveryRealClassificationMaps() {
  for (const c of OUTREACH_CLASSIFICATIONS) {
    const r = resolveSequenceForClassification(c);
    assert.equal(r.ok, true, `vocab classification ${c} now routes to a sequence`);
    assert.ok(OUTREACH_SEQUENCE_IDS.includes(r.sequenceId), `${c} -> a real sequence`);
  }
  // csi is the only recognized-but-not-sent classification
  assert.equal(resolveSequenceForClassification("csi").reason, "do_not_enroll", "csi remains do-not-enroll");
  ok("every real prospect classification maps to a sequence except csi (do-not-enroll)");
}

// ---- 10 + 11. OUTREACH_LIVE_SEND off => dry_run, network branch never selected -
function testLiveSendGateOff() {
  const msg = assembleFor("nonprofit", "verified-reporting");
  // gate fully off (no flag, no key)
  let d = resolveOutreachSendDecision(msg, { env: {} });
  assert.equal(d.status, "dry_run", "no flag/key => dry_run");
  assert.equal(d.liveSend, false, "liveSend false");
  assert.equal(d.sequence, "verified-reporting", "dry_run carries sequence");
  assert.equal(d.touch, 1, "dry_run carries touch");
  assert.equal(d.classification, "nonprofit", "dry_run carries classification");
  assert.equal(d.to, msg.to, "dry_run carries recipient");
  assert.equal(d.subject, msg.subject, "dry_run carries subject");

  // flag on but NO key => still dry_run (never live)
  d = resolveOutreachSendDecision(msg, { env: { OUTREACH_LIVE_SEND: "true" } });
  assert.equal(d.status, "dry_run", "flag on but no key => dry_run");

  // key present but flag off => still dry_run
  d = resolveOutreachSendDecision(msg, { env: { SENDGRID_API_KEY: "SG.fake" } });
  assert.equal(d.status, "dry_run", "key present but flag off => dry_run");

  // ONLY both => live decision (which alone authorizes the network call)
  d = resolveOutreachSendDecision(msg, { env: { OUTREACH_LIVE_SEND: "true", SENDGRID_API_KEY: "SG.fake" } });
  assert.equal(d.status, "live", "both flag+key => live decision");
  assert.equal(d.liveSend, true, "liveSend true only when both set");
  ok("OUTREACH_LIVE_SEND off (or no key) => dry_run; live branch only with flag AND key");
}

// ---- 12 + 13. calendar link: HTML hyperlink + plaintext raw URL ---------------
function testCalendarLinkRendering() {
  const msg = assembleFor("legal_aid", "clinic-extension");
  assert.ok(msg.html.includes(`<a href="${CALENDAR_URL}">`), "HTML body has a calendar anchor");
  assert.ok(!msg.html.includes("[CALENDAR_LINK"), "no unrendered token left in HTML");
  assert.ok(msg.text.includes(CALENDAR_URL), "plaintext body has the raw calendar URL");
  assert.ok(!msg.text.includes("[CALENDAR_LINK"), "no unrendered token left in plaintext");
  // The raw calendar URL must NEVER appear as VISIBLE anchor text — only inside the href.
  assert.ok(!msg.html.includes(`>${CALENDAR_URL}<`), "raw calendar URL is never visible body text");

  // Labeled token: visible anchor text is the SHORT LABEL, URL only in href.
  const labeled = renderTouchHtml("You can [CALENDAR_LINK:grab a time here]");
  assert.ok(labeled.includes(`<a href="${CALENDAR_URL}">grab a time here</a>`), "anchor visible text is the label");
  assert.ok(!labeled.includes(`>${CALENDAR_URL}<`), "label render hides the raw URL");
  // Plaintext keeps the label + usable URL ("label: URL").
  assert.equal(renderTouchText("You can [CALENDAR_LINK:grab a time here]"),
    `You can grab a time here: ${CALENDAR_URL}`, "plaintext renders 'label: URL'");
  // Bare token (no label) falls back to a default label, still no raw URL as visible text.
  const bare = renderTouchHtml("book here: [CALENDAR_LINK]");
  assert.ok(bare.includes(`<a href="${CALENDAR_URL}">grab a time here</a>`), "bare token uses default label");
  assert.ok(renderTouchText("book here: [CALENDAR_LINK]").includes(CALENDAR_URL), "renderTouchText uses raw URL");

  // Every approved touch across all four sequences renders cleanly (no bare URL as text).
  for (const id of OUTREACH_SEQUENCE_IDS) {
    for (const t of OUTREACH_SEQUENCES[id].touches) {
      const html = renderTouchHtml(t.body);
      assert.ok(!html.includes(`>${CALENDAR_URL}<`), `${id} touch ${t.step_number}: no visible raw URL`);
      assert.ok(html.includes(`<a href="${CALENDAR_URL}">`), `${id} touch ${t.step_number}: has calendar anchor`);
    }
  }
  ok("calendar link renders as a labeled HTML hyperlink (short label visible, URL only in href) and a usable plaintext URL");
}

// ---- signature block present between body and compliance footer ---------------
function testSignatureBlock() {
  const msg = assembleFor("nonprofit", "verified-reporting");
  for (const line of ["Roger Roman", "COO, LegalEase", "(202) 555-0100", "legaleasepartner.com",
    "LegalEase is not a law firm and does not provide legal advice."]) {
    assert.ok(msg.text.includes(line), `plaintext signature contains: ${line}`);
    assert.ok(msg.html.includes(line.replace(/&/g, "&amp;")), `HTML signature contains: ${line}`);
  }
  // Signature sits BETWEEN the body sign-off ("Roger") and the compliance footer divider.
  const sigAt = msg.text.indexOf("Roger Roman");
  const footerAt = msg.text.indexOf("\n—\n");
  assert.ok(sigAt > 0 && footerAt > sigAt, "signature appears before the compliance footer");
  // No image / logo embedded — text only.
  assert.ok(!/<img/i.test(msg.html), "signature embeds no image");
  ok("text signature block renders between body and compliance footer (no image)");
}

// ---- 14. unsubscribe + footer + Delaware postal address present ---------------
function testFooterCompliance() {
  const msg = assembleFor("nonprofit", "verified-reporting");
  // three-line footer block per spec: LegalEase / street / city-state-zip
  assert.ok(msg.text.includes("LegalEase"), "footer brand present");
  assert.ok(msg.text.includes("8 The Green, Suite D"), "footer street line present");
  assert.ok(msg.text.includes("Dover, DE 19901"), "footer city/state/zip line present");
  assert.ok(msg.text.includes("Unsubscribe:"), "plaintext unsubscribe present");
  assert.ok(/List-Unsubscribe/i.test(JSON.stringify(msg.headers)), "List-Unsubscribe header present");
  assert.match(msg.headers["List-Unsubscribe-Post"], /one-click/i, "one-click header present");
  // HTML unsubscribe renders as just the word "Unsubscribe" (clickable); the token URL is href-only.
  assert.match(msg.html, /<a href="[^"]*\/api\/outreach\/unsubscribe[^"]*">Unsubscribe<\/a>/, "HTML unsubscribe is a clickable 'Unsubscribe' word");
  assert.ok(!msg.html.includes(`>${msg.unsubscribeUrl}<`), "raw unsubscribe URL is never visible body text");
  // compliance validator accepts the split-line address
  assert.equal(validateCompliance(msg).ok, true, "assembled message is fully compliant");
  // address splitter
  assert.deepEqual(splitPostalAddress(DELAWARE_ADDRESS), { line1: "8 The Green, Suite D", line2: "Dover, DE 19901" }, "address splits to street / locality");
  ok("unsubscribe + footer + Delaware postal address present and compliant");
}

function main() {
  console.log("\nB2 go-live staging — sequences, routing, send gate tests\n");
  testDelawareConfigNoThrow();
  testClassificationMapping();
  testCsiDoNotEnroll();
  testUnmappedFailsClosed();
  testEveryRealClassificationMaps();
  testLiveSendGateOff();
  testCalendarLinkRendering();
  testSignatureBlock();
  testFooterCompliance();
  console.log(`\n${passed} checks passed.\n`);
}

main();
