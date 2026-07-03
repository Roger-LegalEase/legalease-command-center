// Dead-simple intake — the universal "Upload a list" front door (Milestone 1).
//
// One entry point for every list Roger uploads: detect what the list looks like, inspect the
// header row before touching contents, warn about sensitive columns, preview in plain English,
// and only write after an explicit confirm. Confirm routes to the EXISTING import logic where
// one exists (consumer reactivation, Expungement.ai lifecycle sync) and to the Company Memory
// identity layer (companyContacts / companyOrganizations) for people-type lists that have no
// domain importer yet. Review-only lists write nothing except a Queue review item.
//
// HARD RULES (same contract as consumer-list-import.mjs / expungement-lifecycle-sync.mjs):
//   - previewIntake() is PURE — it never writes state.
//   - confirmIntake() NEVER: sends an email, calls a provider, releases a wave, enrolls a
//     contact, publishes anything, or changes a live-send/autopilot gate.
//   - Sensitive columns (SSNs, birth dates, case numbers, criminal-record detail, addresses)
//     are DETECTED and WARNED about but never imported — only name, email, and organization
//     are kept for people-type lists.
//   - Every confirm records a Company Event, an Agent Run (the classification), and an
//     Approval audit record. Imports needing review create Queue items. do_not_contact stays
//     sticky (Company Memory OR-merges it and never un-sets it).

import crypto from "node:crypto";
import {
  parseCsv, previewConsumerImport, confirmConsumerImport, CONSUMER_LIST_TYPE
} from "./consumer-list-import.mjs";
import {
  previewExpungementSync, confirmExpungementSync, csvToLifecycleRecords
} from "./expungement-lifecycle-sync.mjs";
import { normalizeEmail, isBadDomain } from "./outreach-os.mjs";
import {
  emitQueueItem, emitCompanyEvent, recordAgentRun,
  upsertCompanyContact, upsertCompanyOrganization, upsertApprovals, createApproval,
  companyContactId
} from "./company-memory.mjs";

const clean = (v = "") => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);
const normalizeHeaderKey = (header = "") => clean(header).toLowerCase().replace(/[\s_\-]+/g, "");

export const INTAKE_AGENT_ID = "list-intake";
export const INTAKE_WARNING =
  "Nothing sends from import. Lists are previewed first, written only after you confirm, and no email, post, or message ever goes out from this page.";

// ---------------------------------------------------------------------------------------------
// Intake types — plain-English registry. `wired` types route to an existing domain importer;
// `memory` types write only to the Company Memory identity layer; `review` types write nothing
// but a Queue review item.
// ---------------------------------------------------------------------------------------------

export const INTAKE_TYPES = {
  expungement_lifecycle: {
    label: "People who used Expungement.ai",
    description: "A lifecycle export from Expungement.ai — screening, checkout, paid, unsubscribed.",
    route: "wired",
    queueType: "campaign",
    actions: ["hold_for_campaign", "review_only"],
    defaultAction: "hold_for_campaign",
    headerHints: ["lifecyclestage", "screeningstatus", "checkoutstatus", "paymentstatus", "dropoffstep", "eligibilitystatussummary", "consentstatus", "jurisdiction"],
    fileHints: ["expungement", "lifecycle"]
  },
  consumer: {
    label: "People stuck at checkout / reactivation list",
    description: "Consumer contacts for the reactivation campaign. Imported people are always held.",
    route: "wired",
    queueType: "campaign",
    actions: ["hold_for_campaign", "review_only"],
    defaultAction: "hold_for_campaign",
    headerHints: ["priority", "segment", "tier", "wave"],
    fileHints: ["consumer", "reactivation", "checkout", "mvp"]
  },
  rcap_prospects: {
    label: "RCAP prospects",
    description: "Agencies, nonprofits, or employers to consider for the RCAP partner program.",
    route: "memory",
    contactType: "prospect",
    orgType: "rcap_prospect",
    queueType: "prospect_followup",
    actions: ["add_to_contacts", "review_only", "create_followups", "draft_outreach", "suppress"],
    defaultAction: "add_to_contacts",
    headerHints: ["organization", "agency", "ein", "ntee", "website", "prospect"],
    fileHints: ["prospect", "rcap"]
  },
  partner_contacts: {
    label: "Partner contacts",
    description: "People at current or launching RCAP partners.",
    route: "memory",
    contactType: "partner_contact",
    orgType: "rcap_partner",
    queueType: "partner_followup",
    actions: ["add_to_contacts", "review_only", "create_followups", "draft_outreach", "suppress"],
    defaultAction: "add_to_contacts",
    headerHints: ["partner", "role", "title", "organization"],
    fileHints: ["partner"]
  },
  support_list: {
    label: "Support list",
    description: "People with open support questions or issues.",
    route: "memory",
    contactType: "support",
    queueType: "support",
    actions: ["review_only", "add_to_contacts", "create_followups", "suppress"],
    defaultAction: "review_only",
    headerHints: ["subject", "issue", "ticket", "category", "complaint"],
    fileHints: ["support", "ticket"]
  },
  revenue_workbook: {
    label: "Revenue workbook",
    description: "Payments, invoices, or revenue rows. Reviewed only — money records are never changed from an upload.",
    route: "review",
    queueType: "revenue",
    actions: ["review_only"],
    defaultAction: "review_only",
    headerHints: ["amount", "invoice", "payment", "revenue", "mrr", "paid", "price"],
    fileHints: ["revenue", "invoice", "payments"]
  },
  social_calendar: {
    label: "Social content calendar",
    description: "Planned posts. Use the Social calendar import card on this page to bring drafts in — drafts never publish on their own.",
    route: "review",
    queueType: "campaign",
    actions: ["review_only"],
    defaultAction: "review_only",
    headerHints: ["platform", "caption", "hashtags", "posttitle", "publishdate", "channel"],
    fileHints: ["calendar", "social", "content"]
  },
  unknown: {
    label: "Something else / not sure",
    description: "Not sure what this is? It will be looked at and held for review — nothing is written.",
    route: "review",
    queueType: "report",
    actions: ["review_only"],
    defaultAction: "review_only",
    headerHints: [],
    fileHints: []
  }
};

export const INTAKE_ACTIONS = {
  review_only: {
    label: "Review only",
    happens: "Nothing is added to contacts. A review item goes on the Queue so you can decide later."
  },
  add_to_contacts: {
    label: "Add to Contacts",
    happens: "People are added to Contacts with no duplicates. Nobody is emailed."
  },
  hold_for_campaign: {
    label: "Hold for campaign review",
    happens: "People are staged for the campaign and held. Nothing sends until you release them on purpose."
  },
  create_followups: {
    label: "Create follow-up tasks",
    happens: "People are added to Contacts and a follow-up planning item goes on the Queue."
  },
  draft_outreach: {
    label: "Draft outreach (asks for your approval first)",
    happens: "People are added to Contacts and an approval request is created. Nothing is drafted or sent until you approve."
  },
  suppress: {
    label: "Suppress / do not contact",
    happens: "These people are marked do-not-contact. That mark is sticky and nothing is ever sent to them."
  }
};

// ---------------------------------------------------------------------------------------------
// Sensitive column detection — warned about, never imported.
// ---------------------------------------------------------------------------------------------

const SENSITIVE_HEADER_RULES = [
  { pattern: /ssn|socialsecurity/, note: "Social Security numbers" },
  { pattern: /^dob$|dateofbirth|birthdate|birthday/, note: "dates of birth" },
  { pattern: /casenumber|caseno\b|casenum|caseid|docket/, note: "case or docket numbers" },
  { pattern: /charge|offense|offence|conviction|arrest|felony|misdemeanor|disposition|sentence/, note: "criminal record details" },
  { pattern: /^address|homeaddress|streetaddress|street\b|zipcode|postalcode/, note: "home addresses" },
  { pattern: /driverslicense|licensenumber|passport/, note: "license or ID numbers" }
];

export function detectSensitiveHeaders(headers = []) {
  const warnings = [];
  for (const header of list(headers)) {
    const key = normalizeHeaderKey(header);
    if (!key) continue;
    for (const rule of SENSITIVE_HEADER_RULES) {
      if (rule.pattern.test(key)) {
        warnings.push({
          header: clean(header),
          note: rule.note,
          message: `This file includes ${rule.note} ("${clean(header)}"). Sensitive details are never imported — only name, email, and organization are kept.`
        });
        break;
      }
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------------------------
// Type detection — header + file-name hints, scored, with plain-English reasons.
// ---------------------------------------------------------------------------------------------

export function detectIntakeType(headers = [], fileName = "") {
  const keys = new Set(list(headers).map(normalizeHeaderKey).filter(Boolean));
  const name = clean(fileName).toLowerCase();
  const guesses = [];
  for (const [type, def] of Object.entries(INTAKE_TYPES)) {
    if (type === "unknown") continue;
    const headerMatches = def.headerHints.filter((hint) => keys.has(hint));
    const fileMatches = def.fileHints.filter((hint) => name.includes(hint));
    const score = headerMatches.length * 2 + fileMatches.length * 3;
    if (!score) continue;
    const reasons = [];
    if (headerMatches.length) reasons.push(`columns look like ${def.label.toLowerCase()} (${headerMatches.map((h) => `"${h}"`).join(", ")})`);
    if (fileMatches.length) reasons.push(`the file name mentions ${fileMatches.map((h) => `"${h}"`).join(", ")}`);
    guesses.push({ type, label: def.label, score, reason: reasons.join(" and ") });
  }
  guesses.sort((a, b) => b.score - a.score);
  if (!guesses.length) {
    return { type: "unknown", label: INTAKE_TYPES.unknown.label, confidence: "none", reason: "No familiar columns were recognized.", guesses: [] };
  }
  const top = guesses[0];
  const runnerUp = guesses[1];
  const confidence = top.score >= 4 && (!runnerUp || top.score - runnerUp.score >= 2) ? "strong" : "possible";
  return { type: top.type, label: top.label, confidence, reason: top.reason, guesses: guesses.slice(0, 3) };
}

// ---------------------------------------------------------------------------------------------
// Header-only inspection — looks at the header row and row count BEFORE any full import logic.
// ---------------------------------------------------------------------------------------------

export function inspectCsv(csvText = "", fileName = "") {
  const grid = parseCsv(csvText);
  const headers = grid.length ? grid[0].map(clean) : [];
  const rows = grid.slice(1);
  const keys = headers.map(normalizeHeaderKey);
  const emailIdx = keys.findIndex((k) => k === "email" || k === "emailaddress" || k === "e-mail" || k === "contactemail" || k === "workemail");
  const seen = new Set();
  let withEmail = 0, missingEmail = 0, invalidEmail = 0, duplicateEmails = 0;
  for (const cells of rows) {
    const raw = emailIdx >= 0 ? clean(cells[emailIdx]) : "";
    const email = normalizeEmail(raw);
    if (!email) { missingEmail++; continue; }
    if (isBadDomain(email)) { invalidEmail++; continue; }
    if (seen.has(email)) { duplicateEmails++; continue; }
    seen.add(email);
    withEmail++;
  }
  return {
    headers,
    rowCount: rows.length,
    hasEmailColumn: emailIdx >= 0,
    withEmail,
    missingEmail,
    invalidEmail,
    duplicateEmails,
    sensitive: detectSensitiveHeaders(headers),
    detection: detectIntakeType(headers, fileName)
  };
}

// ---------------------------------------------------------------------------------------------
// Generic people-row parsing for Company Memory types (only identity fields — data minimization).
// ---------------------------------------------------------------------------------------------

const GENERIC_FIELD_ALIASES = {
  email: ["email", "emailaddress", "e-mail", "contactemail", "workemail"],
  first_name: ["firstname", "fname", "givenname"],
  last_name: ["lastname", "lname", "surname", "familyname"],
  full_name: ["fullname", "name", "contactname"],
  organization: ["organization", "organisation", "org", "orgname", "company", "companyname", "agency", "partner", "partnername", "employer", "account"],
  domain: ["domain", "website", "site", "url"]
};

const GENERIC_LOOKUP = (() => {
  const map = new Map();
  for (const [field, aliases] of Object.entries(GENERIC_FIELD_ALIASES)) {
    for (const alias of aliases) map.set(normalizeHeaderKey(alias), field);
  }
  return map;
})();

export function parseGenericPeopleRows(csvText = "") {
  const grid = parseCsv(csvText);
  if (!grid.length) return [];
  const fieldByIndex = grid[0].map((h) => GENERIC_LOOKUP.get(normalizeHeaderKey(h)) || null);
  return grid.slice(1).map((cells) => {
    const rec = {};
    fieldByIndex.forEach((field, i) => {
      if (field && rec[field] === undefined) rec[field] = clean(cells[i]);
    });
    const name = rec.full_name || [rec.first_name, rec.last_name].filter(Boolean).join(" ");
    return {
      email: normalizeEmail(rec.email || ""),
      name: clean(name),
      organization: clean(rec.organization),
      domain: clean(rec.domain).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Validation shared by preview and confirm.
// ---------------------------------------------------------------------------------------------

function resolveInputs(csvText, opts = {}) {
  const intakeType = clean(opts.intakeType);
  const def = INTAKE_TYPES[intakeType];
  if (!def) {
    const labels = Object.entries(INTAKE_TYPES).map(([k, d]) => `${k} (${d.label})`).join(", ");
    throw new Error(`Choose what kind of list this is. Options: ${labels}.`);
  }
  if (!clean(opts.sourceNote)) throw new Error("Source note is required: add where this list came from.");
  if (!clean(csvText)) throw new Error("Choose a CSV file with a header row and at least one row.");
  let afterAction = clean(opts.afterAction) || def.defaultAction;
  let actionAdjusted = "";
  if (!def.actions.includes(afterAction)) {
    const requestedLabel = INTAKE_ACTIONS[afterAction] ? INTAKE_ACTIONS[afterAction].label : afterAction;
    afterAction = def.defaultAction;
    actionAdjusted = `"${requestedLabel}" is not available for ${def.label.toLowerCase()}, so this import will use "${INTAKE_ACTIONS[afterAction].label}" instead.`;
  }
  return { intakeType, def, afterAction, actionAdjusted, sourceNote: clean(opts.sourceNote), fileName: clean(opts.fileName) || "uploaded list" };
}

// ---------------------------------------------------------------------------------------------
// PREVIEW — pure, never writes state.
// ---------------------------------------------------------------------------------------------

export function previewIntake(state = {}, csvText = "", opts = {}) {
  const { intakeType, def, afterAction, actionAdjusted, sourceNote, fileName } = resolveInputs(csvText, opts);
  const inspection = inspectCsv(csvText, fileName);

  // Already-known people (matched by email against the Company Memory identity index).
  const knownIds = new Set(list(state.companyContacts).map((c) => c.contact_id));
  let alreadyKnown = 0;
  if (inspection.hasEmailColumn) {
    for (const row of parseGenericPeopleRows(csvText)) {
      if (row.email && knownIds.has(companyContactId(row.email))) alreadyKnown++;
    }
  }

  const warnings = [];
  if (actionAdjusted) warnings.push(actionAdjusted);
  if (inspection.detection.type !== intakeType && inspection.detection.confidence === "strong") {
    warnings.push(`This file looks more like "${inspection.detection.label}" — ${inspection.detection.reason}. Double-check the list type before importing.`);
  }
  for (const s of inspection.sensitive) warnings.push(s.message);
  if (!inspection.hasEmailColumn && def.route !== "review") {
    warnings.push("No email column was found, so people in this file cannot be matched or added to Contacts.");
  }

  // Delegate to the existing importers' previews for the wired types (faithful dry-runs).
  let routed = null;
  if (intakeType === "consumer" && afterAction === "hold_for_campaign") {
    routed = previewConsumerImport(state, csvText, { sourceNote, listType: CONSUMER_LIST_TYPE });
  } else if (intakeType === "expungement_lifecycle" && afterAction === "hold_for_campaign") {
    routed = previewExpungementSync(state, csvToLifecycleRecords(csvText), { sourceNote });
  }

  const lines = [
    `${inspection.rowCount} row(s) in "${fileName}" from ${sourceNote}.`,
    inspection.hasEmailColumn
      ? `${inspection.withEmail} usable email(s); ${inspection.missingEmail} missing, ${inspection.invalidEmail} invalid, ${inspection.duplicateEmails} duplicate(s) inside the file.`
      : "This file has no email column.",
    alreadyKnown ? `${alreadyKnown} of these people are already in Contacts (they will be merged, never duplicated).` : "",
    `After import: ${INTAKE_ACTIONS[afterAction].happens}`
  ].filter(Boolean);

  return {
    ok: true,
    intakeType,
    typeLabel: def.label,
    afterAction,
    actionLabel: INTAKE_ACTIONS[afterAction].label,
    sourceNote,
    fileName,
    headline: `Preview: ${def.label} — ${inspection.rowCount} row(s). Nothing is saved or sent.`,
    lines,
    warnings,
    detection: inspection.detection,
    sensitive: inspection.sensitive,
    totalRows: inspection.rowCount,
    withEmail: inspection.withEmail,
    missingEmail: inspection.missingEmail,
    invalidEmail: inspection.invalidEmail,
    duplicateEmails: inspection.duplicateEmails,
    alreadyKnown,
    routed,
    requiresApproval: afterAction === "draft_outreach",
    warning: INTAKE_WARNING,
    writesState: false
  };
}

// ---------------------------------------------------------------------------------------------
// CONFIRM — the one write step. Roger's confirm click IS the approval; it is recorded as an
// Approval audit record. Routes to existing importers or the Company Memory identity layer.
// ---------------------------------------------------------------------------------------------

export function confirmIntake(state = {}, csvText = "", opts = {}) {
  const { intakeType, def, afterAction, sourceNote, fileName } = resolveInputs(csvText, opts);
  const now = clean(opts.now) || new Date().toISOString();
  const actor = clean(opts.actor) || "owner";
  const importId = clean(opts.importId) || `intake-${crypto.randomBytes(6).toString("hex")}`;
  const nowFn = () => now;
  const inspection = inspectCsv(csvText, fileName);
  const startedAt = now;

  let nextState = state;
  const counts = { added: 0, merged: 0, held: 0, suppressed: 0, skippedNoEmail: 0, organizations: 0, staged: 0 };
  const resultLines = [];
  let writesPerformed = 0;

  if (afterAction === "review_only") {
    // No contact writes at all — just the review trail below.
    resultLines.push("Nothing was added to contacts. This list is on the Queue for your review.");
  } else if (intakeType === "consumer") {
    const routed = confirmConsumerImport(nextState, csvText, { sourceNote, listType: CONSUMER_LIST_TYPE, now, importId });
    nextState = routed.state;
    counts.added = routed.summary.added;
    counts.merged = routed.summary.updated;
    counts.held = routed.held;
    counts.staged = routed.summary.added + routed.summary.updated;
    writesPerformed++;
    resultLines.push(routed.heldMessage);
  } else if (intakeType === "expungement_lifecycle") {
    const routed = confirmExpungementSync(nextState, csvToLifecycleRecords(csvText), { sourceNote, now });
    nextState = routed.state;
    counts.staged = routed.reactivationStaged;
    counts.held = routed.held;
    counts.added = routed.lifecycleUpserted;
    writesPerformed++;
    resultLines.push(routed.heldMessage);
  } else if (def.route === "memory") {
    // Identity-only writes into Company Memory (name, email, organization — nothing else).
    const rows = parseGenericPeopleRows(csvText);
    const priorIds = new Set(list(nextState.companyContacts).map((c) => c.contact_id));
    let contacts = list(nextState.companyContacts);
    let organizations = list(nextState.companyOrganizations);
    const seenEmails = new Set();
    for (const row of rows) {
      if (!row.email || isBadDomain(row.email)) { counts.skippedNoEmail++; continue; }
      if (seenEmails.has(row.email)) continue;
      seenEmails.add(row.email);
      if (row.organization && def.orgType) {
        const before = organizations.length;
        const orgResult = upsertCompanyOrganization(organizations, {
          name: row.organization, domain: row.domain, types: [def.orgType]
        }, { now: nowFn });
        organizations = orgResult.organizations;
        if (organizations.length > before) counts.organizations++;
      }
      const isNew = !priorIds.has(companyContactId(row.email));
      const contactResult = upsertCompanyContact(contacts, {
        email: row.email,
        name: row.name,
        types: def.contactType ? [def.contactType] : [],
        organizations: row.organization ? [row.organization] : [],
        do_not_contact: afterAction === "suppress"
      }, { now: nowFn });
      contacts = contactResult.contacts;
      if (afterAction === "suppress") counts.suppressed++;
      if (isNew) counts.added++; else counts.merged++;
    }
    nextState = { ...nextState, companyContacts: contacts, companyOrganizations: organizations };
    writesPerformed++;
    if (afterAction === "suppress") {
      resultLines.push(`${counts.suppressed} people marked do-not-contact. That mark is sticky — nothing will ever be sent to them.`);
    } else {
      resultLines.push(`${counts.added} people added and ${counts.merged} merged into Contacts (no duplicates). Nobody was emailed.`);
      if (counts.organizations) resultLines.push(`${counts.organizations} new organization(s) recorded.`);
    }
    if (counts.skippedNoEmail) resultLines.push(`${counts.skippedNoEmail} row(s) skipped — no usable email.`);
  }

  // --- Review trail: Queue items for anything that needs Roger -------------------------------
  const peopleCount = counts.added + counts.merged || inspection.rowCount;
  if (afterAction === "review_only") {
    nextState = emitQueueItem(nextState, {
      type: def.queueType,
      sourceEngine: INTAKE_AGENT_ID,
      sourceRef: { collection: "companyEvents", itemId: importId },
      status: "needs_roger",
      title: `New list needs review: ${fileName}`,
      summary: `${inspection.rowCount} row(s) uploaded as "${def.label}" from ${sourceNote}. Nothing was added to contacts.`,
      recommendation: "Open the upload page, re-run the import, and choose what should happen — or dismiss this if the list is not needed.",
      metadata: { importId, intakeType, fileName }
    }, { now: nowFn });
  }
  if (afterAction === "create_followups") {
    nextState = emitQueueItem(nextState, {
      type: def.queueType,
      sourceEngine: INTAKE_AGENT_ID,
      sourceRef: { collection: "companyEvents", itemId: importId },
      status: "needs_roger",
      title: `Plan follow-ups for ${peopleCount} imported ${def.label.toLowerCase()}`,
      summary: `${peopleCount} people from "${fileName}" are in Contacts and waiting on a follow-up plan.`,
      recommendation: "Decide who gets a follow-up and when. Nothing is scheduled until you say so.",
      metadata: { importId, intakeType, fileName }
    }, { now: nowFn });
  }
  let approvalRequested = null;
  if (afterAction === "draft_outreach") {
    const approval = createApproval({
      actionType: "draft_outreach",
      preview: `Draft outreach for ${peopleCount} people imported from "${fileName}" (${def.label}). Drafts are written for your review only — nothing sends.`,
      riskLevel: "caution",
      state: "requested",
      requested_at: now
    }, { now: nowFn });
    nextState = { ...nextState, approvals: upsertApprovals(nextState.approvals, [approval], { now: nowFn }) };
    approvalRequested = approval.id;
    nextState = emitQueueItem(nextState, {
      type: def.queueType,
      sourceEngine: INTAKE_AGENT_ID,
      sourceRef: { collection: "approvals", itemId: approval.id },
      title: `Approve outreach drafting for ${peopleCount} imported people`,
      summary: `People from "${fileName}" are in Contacts. Outreach drafts will only be written after you approve — and even then nothing sends without a separate approval.`,
      recommendation: "Approve to let drafts be written for your review, or dismiss to leave these contacts as-is.",
      requiresApproval: true,
      riskLevel: "caution",
      approvalId: approval.id,
      metadata: { importId, intakeType, fileName }
    }, { now: nowFn });
    resultLines.push("An approval request was created for outreach drafting. Nothing is drafted or sent until you approve.");
  }
  if (inspection.sensitive.length && afterAction !== "review_only") {
    nextState = emitQueueItem(nextState, {
      type: def.queueType,
      sourceEngine: INTAKE_AGENT_ID,
      sourceRef: { collection: "companyEvents", itemId: importId },
      status: "needs_roger",
      title: `Imported list had sensitive columns: ${fileName}`,
      summary: `The upload included ${inspection.sensitive.map((s) => s.note).join(", ")}. Those details were NOT imported — only name, email, and organization were kept. Consider deleting the original file from shared drives.`,
      recommendation: "Confirm the original file is stored somewhere safe or deleted.",
      metadata: { importId, intakeType, fileName },
      priority: 30
    }, { now: nowFn });
  }

  // --- Audit trail: Event + Agent Run + Approval record for the confirmed write --------------
  nextState = emitCompanyEvent(nextState, {
    source: INTAKE_AGENT_ID,
    type: "list_import",
    occurred_at: now,
    sensitive: inspection.sensitive.length > 0,
    summary: `Imported "${fileName}" (${def.label}) from ${sourceNote}: ${inspection.rowCount} row(s), ${INTAKE_ACTIONS[afterAction].label.toLowerCase()}.`,
    raw_ref: null
  }, { now: nowFn });
  nextState = recordAgentRun(nextState, {
    agent: INTAKE_AGENT_ID,
    trigger: "operator",
    input_summary: `"${fileName}" uploaded as ${def.label}; looked like ${inspection.detection.label} (${inspection.detection.confidence}).`,
    output_summary: `${inspection.rowCount} row(s): ${counts.added} added, ${counts.merged} merged, ${counts.held} held, ${counts.suppressed} marked do-not-contact.`,
    actions_proposed: afterAction === "draft_outreach" ? 1 : 0,
    writes_performed: writesPerformed,
    status: "success",
    started_at: startedAt,
    ended_at: now
  }, { now: nowFn });
  if (afterAction !== "review_only") {
    const audit = createApproval({
      actionType: "list_import",
      preview: `Import "${fileName}" (${def.label}) from ${sourceNote} — ${INTAKE_ACTIONS[afterAction].label}.`,
      riskLevel: "safe",
      state: "executed",
      approvedBy: actor,
      approvedAt: now,
      executed_at: now,
      execution_result: `${counts.added} added, ${counts.merged} merged, ${counts.held} held, ${counts.suppressed} suppressed.`
    }, { now: nowFn });
    nextState = { ...nextState, approvals: upsertApprovals(nextState.approvals, [audit], { now: nowFn }) };
  }

  // --- Verification: read the counts back from the state we are about to return --------------
  const verify = verifyIntakeWrite(nextState, { intakeType, def, afterAction, csvText });

  return {
    ok: true,
    intakeType,
    typeLabel: def.label,
    afterAction,
    actionLabel: INTAKE_ACTIONS[afterAction].label,
    sourceNote,
    fileName,
    importId,
    approvalRequested,
    headline: afterAction === "review_only"
      ? `Held for review — nothing was added. "${fileName}" is on the Queue.`
      : `Imported safely: ${def.label}. No one was emailed.`,
    lines: resultLines,
    counts,
    verified: verify,
    state: nextState,
    warning: INTAKE_WARNING,
    writesState: true
  };
}

// Post-write verification — recount from the returned state so the success message is grounded
// in what was actually written, not what we intended to write.
export function verifyIntakeWrite(state = {}, { intakeType = "", def = null, afterAction = "", csvText = "" } = {}) {
  const type = def || INTAKE_TYPES[intakeType] || INTAKE_TYPES.unknown;
  const checks = [];
  if (afterAction === "review_only") {
    checks.push({ ok: true, note: "No contact writes expected, none performed." });
    return { ok: true, checks };
  }
  if (intakeType === "consumer" || intakeType === "expungement_lifecycle") {
    const held = list(state.reactivationContacts).filter((c) => c.campaign_hold).length;
    checks.push({ ok: true, note: `${list(state.reactivationContacts).length} reactivation contact(s) on file; ${held} held. Held people are excluded from every wave.` });
  } else if (type.route === "memory") {
    const rows = parseGenericPeopleRows(csvText);
    const byId = new Map(list(state.companyContacts).map((c) => [c.contact_id, c]));
    const uniqueEmails = new Set(rows.map((r) => r.email).filter((e) => e && !isBadDomain(e)));
    let present = 0, suppressedOk = true;
    for (const email of uniqueEmails) {
      const contact = byId.get(companyContactId(email));
      if (contact) present++;
      if (afterAction === "suppress" && contact && !contact.do_not_contact) suppressedOk = false;
    }
    const expected = uniqueEmails.size;
    checks.push({ ok: present === expected, note: `${present} of ${expected} people with usable emails are now in Contacts.` });
    if (afterAction === "suppress") checks.push({ ok: suppressedOk, note: suppressedOk ? "Every imported person carries the do-not-contact mark." : "Some imported people are missing the do-not-contact mark." });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
