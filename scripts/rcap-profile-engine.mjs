// RCAP Prospect CRM — Wave 2, Packet 6: the profile engine.
//
// Turns read documents into the fifteen-section profile: extraction, source-to-claim mapping,
// section validation, quality gates, and the durable run that ties them together.
//
// The engine is deterministic and pure. No clock, no network, no randomness -- the caller passes
// `now`, the documents arrive already read (see rcap-drive-adapter.mjs), and the same inputs
// always produce the same records. That is what makes "did this run change anything?" a question
// with an answer.
//
// Two judgement calls are worth stating outright, because both could reasonably have gone the
// other way and both are about not over-claiming:
//
//   1. A statement in a research document defaults to `supported_inference`, NOT `verified_fact`.
//      One document asserting something is support for a belief, not verification of it. A claim
//      is only promoted to verified when the document explicitly marks it verified AND names a
//      corroborating reference. Rule 23 exists so a reader can tell these apart; defaulting to
//      the stronger label would quietly erase the distinction the rule protects.
//
//   2. An open question only becomes an `rcapProfileUnknowns` record when the document states why
//      it matters and how to resolve it. Otherwise it stays an `open_question` claim and the
//      gates report that the source gave no resolution path. The alternative -- padding the
//      record with boilerplate so it satisfies the contract -- would make a real unknown and a
//      shrug indistinguishable, which is the same failure as a fake zero.

import {
  buildRcapClaim,
  buildRcapProfileDependency,
  buildRcapProfileRun,
  buildRcapProfileSection,
  buildRcapProfileSnapshot,
  buildRcapProfileUnknown,
  buildRcapProfileVersion,
  buildRcapProposedCorrection,
  rcapContentHash
} from "./rcap-profile-contracts.mjs";
import { RCAP_PROFILE_SECTIONS } from "./rcap-prospect-registries.mjs";

export const RCAP_PROFILE_ENGINE_VERSION = "rcap-profile-engine/1";

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const lower = (value = "") => clean(value).toLowerCase();
const normalize = (value = "") => lower(value).replace(/[^a-z0-9]+/g, " ").trim();

// ---------------------------------------------------------------------------------------------
// Heading recognition
// ---------------------------------------------------------------------------------------------
//
// Research documents are written by people and by Le-E, so headings arrive with numbering,
// dashes, colons and casing that vary. Matching is on the normalized label, plus a short alias
// list for the wordings that actually occur. An unrecognised heading is NOT guessed into the
// nearest section: its content is collected as unassigned and reported, because putting a
// paragraph under the wrong section is worse than leaving it out.

const SECTION_ALIASES = new Map([
  ["verdict", "strategic_verdict"],
  ["strategic verdict and fit", "strategic_verdict"],
  ["corrections", "crm_corrections"],
  ["crm corrections and data quality", "crm_corrections"],
  ["best contact", "best_contact_strategy"],
  ["who to contact", "best_contact_strategy"],
  ["sales angle", "strongest_sales_angle"],
  ["strongest angle", "strongest_sales_angle"],
  ["subject line", "best_subject_line"],
  ["initial email", "send_ready_initial_email"],
  ["send ready email", "send_ready_initial_email"],
  ["why it works", "why_the_message_works"],
  ["attachments", "what_to_send"],
  ["follow up email", "first_follow_up_email"],
  ["follow up", "first_follow_up_email"],
  ["follow up attachment", "follow_up_attachment"],
  ["objections", "likely_objections"],
  ["discovery call", "discovery_call_objective"],
  ["pilot", "recommended_pilot"],
  ["initial offer", "recommended_pilot"],
  ["deal path", "deal_path"],
  ["sequence", "outreach_sequence"],
  ["outreach plan", "outreach_sequence"]
]);

const SECTION_BY_NORMALIZED = new Map();
for (const section of RCAP_PROFILE_SECTIONS) {
  SECTION_BY_NORMALIZED.set(normalize(section.label), section.key);
  SECTION_BY_NORMALIZED.set(normalize(section.key), section.key);
}
for (const [alias, key] of SECTION_ALIASES) SECTION_BY_NORMALIZED.set(normalize(alias), key);

const SECTION_BY_KEY = new Map(RCAP_PROFILE_SECTIONS.map((section) => [section.key, section]));
const SECTION_NUMBERS = new Map(RCAP_PROFILE_SECTIONS.map((section) => [section.number, section.key]));

export function rcapSectionKeyFromHeading(line = "") {
  const raw = clean(line);
  if (!raw || raw.length > 90) return "";

  // Strip list/heading decoration and a leading "Section 6" / "6." / "6)" ordinal.
  let text = raw.replace(/^[#>*•\-\s]+/, "").replace(/[:.—–\-\s]+$/, "");
  const ordinal = /^(?:section\s+)?(\d{1,2})\s*[.)—–:-]\s*(.*)$/i.exec(text);
  let numbered = "";
  if (ordinal) {
    numbered = SECTION_NUMBERS.get(Number(ordinal[1])) || "";
    text = clean(ordinal[2]);
  }

  const direct = SECTION_BY_NORMALIZED.get(normalize(text));
  if (direct) return direct;
  // "6." with a heading we do not recognise still identifies the section by its number, which is
  // the numbering the master plan fixed. A number with unrecognised words is still that section.
  if (numbered && text) return numbered;
  if (numbered && !text) return numbered;
  return "";
}

// ---------------------------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------------------------

const MARKERS = [
  { pattern: /^verified\s*:\s*/i, factClass: "verified_fact" },
  { pattern: /^confirmed\s*:\s*/i, factClass: "verified_fact" },
  { pattern: /^inferred\s*:\s*/i, factClass: "supported_inference" },
  { pattern: /^likely\s*:\s*/i, factClass: "supported_inference" },
  { pattern: /^(?:open\s+)?question\s*:\s*/i, factClass: "open_question" },
  { pattern: /^unknown\s*:\s*/i, factClass: "open_question" },
  { pattern: /^recommendation\s*:\s*/i, factClass: "recommendation" },
  { pattern: /^recommended\s*:\s*/i, factClass: "recommendation" },
  { pattern: /^(?:pilot\s+)?hypothesis\s*:\s*/i, factClass: "pilot_hypothesis" },
  { pattern: /^note\s*:\s*/i, factClass: "human_note" }
];

// A corroborating reference: a URL, or an explicit "per <something>" / "source: <something>".
const CORROBORATION = /(https?:\/\/\S+)|(\bper\s+[a-z0-9])|(\bsource\s*:\s*\S)/i;

function classifyParagraph(text = "") {
  for (const marker of MARKERS) {
    if (marker.pattern.test(text)) {
      const body = clean(text.replace(marker.pattern, ""));
      // Promotion to verified requires BOTH the marker and something to corroborate against.
      // A document that says "Verified:" and cites nothing has asserted, not verified.
      if (marker.factClass === "verified_fact" && !CORROBORATION.test(body)) {
        return { factClass: "supported_inference", text: body, demoted: true };
      }
      return { factClass: marker.factClass, text: body, demoted: false };
    }
  }
  return { factClass: "supported_inference", text: clean(text), demoted: false };
}

// A short leading "Label: " prefix is structure, not prose. Bounded to 40 characters so a
// sentence that happens to contain a colon partway through is not mistaken for one.
const LABEL_LINE = /^[A-Za-z][A-Za-z0-9 _/-]{0,39}:\s/;

// Splits a document into per-section blocks of paragraphs. Blank lines separate paragraphs;
// bullets are paragraphs. Anything before the first recognised heading is unassigned.
export function extractRcapDocumentSections(text = "") {
  const lines = String(text ?? "").split(/\r?\n/);
  const sections = new Map();
  const unassigned = [];

  let current = "";
  let buffer = [];

  const flush = () => {
    const paragraph = clean(buffer.join(" "));
    buffer = [];
    if (!paragraph) return;
    if (!current) { unassigned.push(paragraph); return; }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current).push(paragraph);
  };

  for (const line of lines) {
    const raw = clean(line);
    if (!raw) { flush(); continue; }
    const heading = rcapSectionKeyFromHeading(raw);
    if (heading) {
      flush();
      current = heading;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    // A bullet starts a new paragraph even without a blank line between items -- and so does a
    // labelled line. Research documents run "Verified: ...\nInferred: ..." and
    // "Website: old -> new\nRegion: old -> new" without blank lines between them, and joining
    // those into one paragraph would fuse two separate statements into a single claim.
    if (buffer.length && (/^[•*\-]\s+/.test(raw) || LABEL_LINE.test(raw))) flush();
    buffer.push(raw.replace(/^[•*\-]\s+/, ""));
  }
  flush();

  return Object.freeze({
    sections: Object.freeze(Object.fromEntries([...sections].map(([key, value]) => [key, Object.freeze(value)]))),
    unassigned: Object.freeze(unassigned),
    recognizedSectionCount: sections.size
  });
}

// ---------------------------------------------------------------------------------------------
// Proposed corrections
// ---------------------------------------------------------------------------------------------

// Section 2 carries lines of the form "Website: https://old -> https://new". Anything that does
// not parse as a field with both sides is left as a claim rather than being forced into a
// correction, because a correction that guesses the current value would propose overwriting
// something it never read.
const CORRECTION_LINE = /^([A-Za-z][A-Za-z0-9 _/-]{1,40}?)\s*:\s*(.+?)\s*(?:->|→|=>)\s*(.+)$/;

export function parseRcapCorrectionLine(paragraph = "") {
  const match = CORRECTION_LINE.exec(clean(paragraph));
  if (!match) return null;
  const field = clean(match[1]).toLowerCase().replace(/\s+/g, "_");
  const currentValue = clean(match[2]);
  const proposedValue = clean(match[3]);
  if (!field || !currentValue || !proposedValue || currentValue === proposedValue) return null;
  return { field, currentValue, proposedValue };
}

// ---------------------------------------------------------------------------------------------
// Unknowns
// ---------------------------------------------------------------------------------------------

// "Question: X — why it matters: Y — how to resolve: Z". Both trailing parts are required; see
// the header comment for why boilerplate is not substituted when they are absent.
const WHY_MARKER = /(?:why(?:\s+it)?\s+matters)\s*:\s*/i;
const HOW_MARKER = /(?:how(?:\s+to)?\s+resolve|resolve\s+by|to\s+find\s+out)\s*:\s*/i;

export function parseRcapUnknown(text = "") {
  const raw = clean(text);
  if (!raw) return null;
  const whyIndex = raw.search(WHY_MARKER);
  const howIndex = raw.search(HOW_MARKER);
  if (whyIndex < 0 || howIndex < 0 || howIndex < whyIndex) return null;

  const question = clean(raw.slice(0, whyIndex).replace(/[\s—–.,;-]+$/, ""));
  const whyPart = raw.slice(whyIndex, howIndex);
  const howPart = raw.slice(howIndex);
  const whyItMatters = clean(whyPart.replace(WHY_MARKER, "").replace(/[\s—–.,;-]+$/, ""));
  const howToResolve = clean(howPart.replace(HOW_MARKER, ""));
  if (!question || !whyItMatters || !howToResolve) return null;
  return { question, whyItMatters, howToResolve };
}

// ---------------------------------------------------------------------------------------------
// Distinctive phrases — the machinery behind the name-swap gate
// ---------------------------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "for", "with", "at", "by",
  "from", "as", "is", "are", "was", "were", "be", "been", "being", "that", "this", "these",
  "those", "it", "its", "we", "you", "your", "our", "their", "they", "he", "she", "them", "his",
  "her", "will", "would", "can", "could", "should", "may", "might", "must", "have", "has", "had",
  "do", "does", "did", "not", "no", "so", "than", "then", "there", "here", "up", "out", "about",
  "into", "over", "after", "before", "more", "most", "some", "any", "all", "each", "who", "what",
  "when", "where", "how", "why", "which", "while", "also", "just", "like", "one", "two", "very"
]);

// A distinctive phrase is three consecutive content words. Three is the shortest run that is
// reliably about a particular organization rather than about legal aid in general: "monthly
// record clearing" survives, "we would like" does not.
export function rcapDistinctivePhrases(text = "", options = {}) {
  const words = normalize(text).split(" ").filter(Boolean);
  const exclude = new Set(normalize(options.exclude || "").split(" ").filter(Boolean));
  const phrases = new Set();
  const content = words.filter((word) => !STOPWORDS.has(word) && !exclude.has(word) && word.length > 2);
  for (let index = 0; index + 2 < content.length; index += 1) {
    phrases.add(content.slice(index, index + 3).join(" "));
  }
  return phrases;
}

// How many of the account's own specifics survive in a body of text once the organization's name
// is removed. This is the name-swap test made concrete: a message whose only account-specific
// content is the name scores zero.
export function rcapSpecificityScore(text = "", claims = [], options = {}) {
  const organizationName = clean(options.organizationName);
  const haystack = normalize(String(text ?? "").replaceAll(new RegExp(escapeRegex(organizationName), "gi"), " "));
  if (!haystack) return Object.freeze({ score: 0, matched: Object.freeze([]) });

  const matched = new Set();
  for (const claim of list(claims)) {
    if (!["verified_fact", "supported_inference"].includes(lower(claim.factClass))) continue;
    for (const phrase of rcapDistinctivePhrases(claim.text, { exclude: organizationName })) {
      if (haystack.includes(phrase)) matched.add(phrase);
    }
  }
  return Object.freeze({ score: matched.size, matched: Object.freeze([...matched].sort()) });
}

function escapeRegex(value = "") {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") || "\\u0000";
}

// ---------------------------------------------------------------------------------------------
// Quality gates
// ---------------------------------------------------------------------------------------------

const GENERIC_FOLLOW_UP = /\bjust\s+(?:following\s+up|checking\s+in|circling\s+back)\b|\bbumping\s+this\b|\bany\s+thoughts\s*\?\s*$/i;
const GENERIC_FOLLOW_UP_GLOBAL = new RegExp(GENERIC_FOLLOW_UP.source, "gi");
const GENERIC_ATTACHMENT = /\b(?:one[\s-]?pager|overview\s+deck|capabilities\s+deck|standard\s+deck|our\s+brochure|general\s+overview)\b/i;
const NO_ATTACHMENT = /\b(?:no\s+attachment|nothing\s+attached|do\s+not\s+attach|send\s+nothing)\b/i;
const GUESSED_EMAIL = /\b(?:likely|probably|guess(?:ed)?|assumed|pattern)\b[^.]{0,60}?[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// Which sections constitute knowledge ABOUT the organization, as opposed to the message we
// intend to send it. The distinction is load-bearing for the name-swap gate: the engine turns
// every paragraph into a claim, including the paragraphs of the initial email itself, so scoring
// the email against all claims would let it cite itself as evidence of its own specificity and
// pass every time. Only the research sections count as evidence.
export const RCAP_EVIDENCE_SECTIONS = Object.freeze([
  "strategic_verdict",
  "crm_corrections",
  "best_contact_strategy",
  "strongest_sales_angle",
  "likely_objections",
  "discovery_call_objective",
  "recommended_pilot",
  "deal_path"
]);

export const RCAP_QUALITY_GATES = Object.freeze([
  Object.freeze({ key: "name_swap", rule: 10, severity: "blocking", sectionKey: "send_ready_initial_email" }),
  Object.freeze({ key: "empty_follow_up", rule: 11, severity: "blocking", sectionKey: "first_follow_up_email" }),
  Object.freeze({ key: "generic_attachment", rule: 12, severity: "blocking", sectionKey: "what_to_send" }),
  Object.freeze({ key: "guessed_email", rule: 6, severity: "blocking", sectionKey: "best_contact_strategy" }),
  Object.freeze({ key: "uncited_fact", rule: 23, severity: "blocking", sectionKey: "" }),
  Object.freeze({ key: "unknown_without_path", rule: 15, severity: "advisory", sectionKey: "" }),
  Object.freeze({ key: "missing_sections", rule: 15, severity: "advisory", sectionKey: "" })
]);

// Runs every gate and returns findings. A blocking finding means the version cannot go to a
// reviewer as ready -- it is recorded as blocked, with the reason, rather than presented as a
// profile that merely happens to be weak.
export function rcapProfileQualityGates(input = {}) {
  const sections = new Map(list(input.sections).map((section) => [lower(section.sectionKey), section]));
  const claims = list(input.claims);
  // A claim with no section is one a caller handed us directly; it is treated as evidence,
  // because the self-citation problem only arises for claims the engine lifted out of a message.
  const evidence = claims.filter((claim) => !clean(claim.sectionKey) || RCAP_EVIDENCE_SECTIONS.includes(lower(claim.sectionKey)));
  const organizationName = clean(input.organizationName);
  const findings = [];

  const bodyOf = (key) => clean(sections.get(key)?.body);
  const add = (key, sectionKey, message) => {
    const gate = RCAP_QUALITY_GATES.find((entry) => entry.key === key);
    findings.push(Object.freeze({
      key,
      rule: gate.rule,
      severity: gate.severity,
      sectionKey: sectionKey || gate.sectionKey,
      sectionLabel: sectionKey && SECTION_BY_KEY.has(sectionKey) ? SECTION_BY_KEY.get(sectionKey).label : "",
      message
    }));
  };

  // Rule 24: a clean disqualification is a successful outcome. An account we have decided not to
  // pursue is not required to have a send-ready email, and gating it on one would turn a good
  // research result into a failure.
  const disqualified = input.disqualified === true;

  // Rule 10 — the name-swap test.
  const initialEmail = bodyOf("send_ready_initial_email");
  if (!disqualified && initialEmail) {
    const specificity = rcapSpecificityScore(initialEmail, evidence, { organizationName });
    if (specificity.score < 2) {
      add("name_swap", "send_ready_initial_email",
        `The initial email carries ${specificity.score} of this organization's own specifics once its name is removed. It would read the same for any organization.`);
    }
  }

  // Rule 11 — a follow-up must add something.
  const followUp = bodyOf("first_follow_up_email");
  if (!disqualified && followUp) {
    // The test is not "does it use the phrase" -- a follow-up may perfectly well open with
    // "just following up" and then give a real reason to reply. The test is what is LEFT once
    // the boilerplate is removed: if the remainder says nothing the first message did not
    // already say, the follow-up exists only to say it exists, which is rule 11.
    const substantive = followUp.replaceAll(GENERIC_FOLLOW_UP_GLOBAL, " ");
    const newSpecifics = [...rcapDistinctivePhrases(substantive, { exclude: organizationName })]
      .filter((phrase) => !normalize(initialEmail).includes(phrase));
    if (GENERIC_FOLLOW_UP.test(followUp) && newSpecifics.length === 0) {
      add("empty_follow_up", "first_follow_up_email",
        "The follow-up only says it is following up. A follow-up must carry a reason to reply that the first message did not.");
    }
  }

  // Rule 12 — no generic attachment by default.
  for (const key of ["what_to_send", "follow_up_attachment"]) {
    const body = bodyOf(key);
    if (disqualified || !body) continue;
    if (NO_ATTACHMENT.test(body)) continue;
    if (GENERIC_ATTACHMENT.test(body)) {
      const specificity = rcapSpecificityScore(body, evidence, { organizationName });
      if (specificity.score === 0) {
        add("generic_attachment", key,
          "A generic attachment is proposed with nothing tying it to this organization. Name what makes it the right thing to send, or send nothing.");
      }
    }
  }

  // Rule 6 — no guessed private address.
  const contactStrategy = bodyOf("best_contact_strategy");
  if (contactStrategy && GUESSED_EMAIL.test(contactStrategy)) {
    add("guessed_email", "best_contact_strategy",
      "The contact strategy proposes an address it describes as guessed or inferred. A guessed private address is never a send route.");
  }

  // Rule 23 — a claim that asserts something about the world names its sources. Construction
  // already refuses to build one without, so this catches records that arrived from elsewhere.
  const uncited = claims.filter((claim) =>
    ["verified_fact", "supported_inference"].includes(lower(claim.factClass)) && list(claim.sourceIds).length === 0);
  if (uncited.length) {
    add("uncited_fact", "", `${uncited.length} claim${uncited.length === 1 ? "" : "s"} assert something about this organization without citing a source.`);
  }

  // Advisory — an open question the source gave no way to answer.
  const pathless = claims.filter((claim) => lower(claim.factClass) === "open_question" && claim.hasResolutionPath !== true);
  if (pathless.length) {
    add("unknown_without_path", "", `${pathless.length} open question${pathless.length === 1 ? "" : "s"} arrived with no recorded way to resolve ${pathless.length === 1 ? "it" : "them"}.`);
  }

  // Advisory — what the documents did not cover. Named, not counted, so the gap is actionable.
  const missing = RCAP_PROFILE_SECTIONS.filter((section) => !clean(sections.get(section.key)?.body));
  if (missing.length) {
    add("missing_sections", "", `${missing.length} of 15 sections have no content: ${missing.map((section) => section.label).join(", ")}.`);
  }

  const blocking = findings.filter((finding) => finding.severity === "blocking");
  return Object.freeze({
    passed: blocking.length === 0,
    blocking: Object.freeze(blocking),
    advisory: Object.freeze(findings.filter((finding) => finding.severity === "advisory")),
    findings: Object.freeze(findings)
  });
}

// ---------------------------------------------------------------------------------------------
// Fifteen-section validation
// ---------------------------------------------------------------------------------------------

export function rcapValidateFifteenSections(sections = []) {
  const bySection = new Map(list(sections).map((section) => [lower(section.sectionKey), section]));
  const rows = RCAP_PROFILE_SECTIONS.map((section) => {
    const record = bySection.get(section.key) || null;
    let state = "missing";
    if (record && clean(record.body)) state = lower(record.state) || "draft";
    else if (record) state = "empty";
    return Object.freeze({
      sectionKey: section.key,
      sectionNumber: section.number,
      sectionLabel: section.label,
      group: section.group,
      state,
      // A missing section and an empty one differ: empty means the document was read and had
      // nothing to say here, missing means nothing addressed it at all.
      reason: record && !clean(record.body) ? clean(record.emptyReason) : ""
    });
  });

  const withBody = rows.filter((row) => row.state !== "missing" && row.state !== "empty");
  return Object.freeze({
    total: RCAP_PROFILE_SECTIONS.length,
    present: withBody.length,
    complete: withBody.length === RCAP_PROFILE_SECTIONS.length,
    sections: Object.freeze(rows),
    missing: Object.freeze(rows.filter((row) => row.state === "missing").map((row) => row.sectionKey))
  });
}

// ---------------------------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------------------------

// Builds a complete profile generation from documents that have already been read. Returns every
// record the caller should persist, plus the gate result and the run. Persisting is the caller's
// job -- this module writes nothing.
export function runRcapProfilePass(input = {}) {
  const accountId = clean(input.accountId);
  const now = clean(input.now);
  const organizationName = clean(input.organizationName);
  const engineVersion = clean(input.engineVersion) || RCAP_PROFILE_ENGINE_VERSION;
  const documents = list(input.documents);
  const sources = list(input.sources);
  const versionNumber = Math.max(1, Math.trunc(Number(input.versionNumber) || 1));

  const sourceOwners = new Map(sources.map((source) => [source.id, source.accountId]));
  const sourceByRef = new Map(sources.map((source) => [source.ref, source]));
  const readableSources = sources.filter((source) => source.accessState === "available");
  const blockedSources = sources.filter((source) => source.accessState === "not_authorized");

  // Nothing readable and something blocked is not an empty profile -- it is a blocked one, and
  // the difference is the whole reason the adapter records access state.
  if (readableSources.length === 0 && blockedSources.length > 0) {
    const run = buildRcapProfileRun({
      accountId,
      trigger: clean(input.trigger) || "human_request",
      status: "blocked",
      startedAt: now,
      finishedAt: now,
      requestedBy: clean(input.requestedBy),
      sourceIds: sources.map((source) => source.id),
      engineVersion,
      reason: clean(input.blockedReason) || blockedSources[0].unreadableReason,
      blockerKey: clean(input.blockerKey) || "drive_scope_missing"
    });
    return Object.freeze({
      run, version: null, sections: Object.freeze([]), claims: Object.freeze([]),
      unknowns: Object.freeze([]), corrections: Object.freeze([]), dependencies: Object.freeze([]),
      snapshot: null, gates: null, validation: rcapValidateFifteenSections([]), blocked: true
    });
  }

  const claims = [];
  const unknowns = [];
  const corrections = [];
  const dependencies = [];
  const sectionBodies = new Map();
  const sectionSourceIds = new Map();
  const sectionClaimIds = new Map();
  const sectionUnknownIds = new Map();

  for (const document of documents) {
    const source = sourceByRef.get(clean(document.ref)) || sources.find((entry) => entry.id === clean(document.sourceId));
    if (!source || source.accessState !== "available") continue;

    const extracted = extractRcapDocumentSections(document.text);
    for (const [sectionKey, paragraphs] of Object.entries(extracted.sections)) {
      if (!SECTION_BY_KEY.has(sectionKey)) continue;

      const kept = [];
      for (const paragraph of paragraphs) {
        // Section 2 is where the engine proposes CRM changes rather than asserting facts.
        if (sectionKey === "crm_corrections") {
          const parsed = parseRcapCorrectionLine(paragraph);
          if (parsed) {
            corrections.push(buildRcapProposedCorrection({
              accountId,
              field: parsed.field,
              currentValue: parsed.currentValue,
              proposedValue: parsed.proposedValue,
              rationale: `Recorded in ${source.title || "a research document"}.`,
              sourceIds: [source.id],
              createdAt: now
            }, { sourceOwners }));
            kept.push(paragraph);
            continue;
          }
        }

        const classified = classifyParagraph(paragraph);
        if (!classified.text) continue;

        let hasResolutionPath = false;
        if (classified.factClass === "open_question") {
          const parsed = parseRcapUnknown(classified.text);
          if (parsed) {
            hasResolutionPath = true;
            unknowns.push(buildRcapProfileUnknown({
              accountId, sectionKey, createdAt: now,
              question: parsed.question,
              whyItMatters: parsed.whyItMatters,
              howToResolve: parsed.howToResolve
            }));
          }
        }

        const requiresSource = ["verified_fact", "supported_inference"].includes(classified.factClass);
        const claim = buildRcapClaim({
          accountId,
          sectionKey,
          factClass: classified.factClass,
          text: classified.text,
          evidence: paragraph,
          sourceIds: requiresSource ? [source.id] : [],
          runId: "",
          createdAt: now
        }, { sourceOwners });
        // Not part of the stored record: a hint the gates use to tell an open question with a
        // resolution path from one without.
        claims.push(Object.freeze({ ...claim, hasResolutionPath }));
        kept.push(paragraph);
      }

      if (!kept.length) continue;
      const existing = sectionBodies.get(sectionKey) || [];
      sectionBodies.set(sectionKey, existing.concat(kept));
      const seenSources = sectionSourceIds.get(sectionKey) || new Set();
      seenSources.add(source.id);
      sectionSourceIds.set(sectionKey, seenSources);
    }
  }

  for (const claim of claims) {
    const bucket = sectionClaimIds.get(claim.sectionKey) || [];
    bucket.push(claim.id);
    sectionClaimIds.set(claim.sectionKey, bucket);
  }
  for (const unknown of unknowns) {
    const bucket = sectionUnknownIds.get(unknown.sectionKey) || [];
    bucket.push(unknown.id);
    sectionUnknownIds.set(unknown.sectionKey, bucket);
  }

  const claimOwners = new Map(claims.map((claim) => [claim.id, claim.accountId]));
  const versionId = `rver_${rcapContentHash({ accountId, versionNumber, engineVersion })}`;

  const sectionRecords = RCAP_PROFILE_SECTIONS.map((section) => {
    const paragraphs = sectionBodies.get(section.key) || [];
    const body = paragraphs.join("\n\n");
    return buildRcapProfileSection({
      accountId,
      versionId,
      sectionKey: section.key,
      state: body ? "needs_review" : "draft",
      body,
      emptyReason: body ? "" : "No read document addressed this section.",
      claimIds: sectionClaimIds.get(section.key) || [],
      unknownIds: sectionUnknownIds.get(section.key) || []
    }, { claimOwners });
  });

  for (const section of sectionRecords) {
    for (const sourceId of sectionSourceIds.get(section.sectionKey) || []) {
      dependencies.push(buildRcapProfileDependency({
        accountId, sectionKey: section.sectionKey, dependsOnKind: "source", dependsOnId: sourceId, createdAt: now
      }));
    }
  }

  const disqualified = input.disqualified === true;
  const gates = rcapProfileQualityGates({ sections: sectionRecords, claims, organizationName, disqualified });
  const validation = rcapValidateFifteenSections(sectionRecords);

  const status = disqualified ? "disqualified" : gates.passed ? "needs_review" : "blocked";
  const version = buildRcapProfileVersion({
    id: versionId,
    accountId,
    versionNumber,
    status,
    createdAt: now,
    sectionHashes: sectionRecords.map((section) => section.contentHash),
    supersedesVersionId: clean(input.supersedesVersionId),
    disqualificationReason: disqualified ? clean(input.disqualificationReason) : ""
  });

  const snapshot = buildRcapProfileSnapshot({
    accountId,
    versionId: version.id,
    capturedAt: now,
    sections: sectionRecords.map((section) => ({
      sectionKey: section.sectionKey, state: section.state, body: section.body, contentHash: section.contentHash
    }))
  });

  const run = buildRcapProfileRun({
    accountId,
    trigger: clean(input.trigger) || "human_request",
    status: "succeeded",
    startedAt: now,
    finishedAt: now,
    requestedBy: clean(input.requestedBy),
    sourceIds: sources.map((source) => source.id),
    sectionKeys: sectionRecords.filter((section) => section.body).map((section) => section.sectionKey),
    engineVersion,
    versionId: version.id
  });

  return Object.freeze({
    run,
    version,
    sections: Object.freeze(sectionRecords),
    // The gate hint is stripped before the records leave the engine: it is derived, and storing
    // a derived field invites it to go stale against the unknown records it describes.
    claims: Object.freeze(claims.map(({ hasResolutionPath, ...claim }) => Object.freeze(claim))),
    unknowns: Object.freeze(unknowns),
    corrections: Object.freeze(corrections),
    dependencies: Object.freeze(dependencies),
    snapshot,
    gates,
    validation,
    blocked: false
  });
}
