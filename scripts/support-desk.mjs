// Support desk (Phase 18D) — triage, honest internal drafts, no sending.
//
// Classifies support messages (urgency + legal-advice sensitivity), normalizes support
// issues into one canonical shape, prepares INTERNAL draft replies for review, and tracks
// status changes with a history trail. There is NO send path in this module and none may
// be added: a reply leaves the app only when Roger copies it out himself.
//
// UPL rule: a message that looks like it asks for legal advice never gets a machine draft.
// It is flagged for Roger personally, and the queue projection marks it high risk.

import { stableMemoryId } from "./company-memory.mjs";

const clean = (v = "") => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);
const nowIso = () => new Date().toISOString();

export const SUPPORT_STATUSES = ["open", "drafted", "waiting", "resolved", "closed"];
export const SUPPORT_URGENCY = ["urgent", "normal", "low"];

const SUPPORT_TRANSITIONS = {
  open: ["drafted", "waiting", "resolved", "closed"],
  drafted: ["open", "waiting", "resolved", "closed"],
  waiting: ["open", "drafted", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: []
};

// Legal-advice (UPL) sensitivity patterns, each with a plain reason Roger can read.
const UPL_PATTERNS = [
  [/\b(legal advice|is (this|it|that) legal|against the law)\b/i, "asks whether something is legal"],
  [/\bwhat are my rights\b/i, "asks about their rights"],
  [/\bmy (case|charge|charges|conviction|record|hearing|court date|probation|sentence)\b/i, "describes their own case"],
  [/\bshould i (plead|file|sue|appeal|testify|sign|admit)\b/i, "asks what they should do legally"],
  [/\b(lawyer|attorney|public defender|legal aid)\b/i, "mentions needing a lawyer"],
  [/\b(do i qualify|am i eligible)\b.*\b(expunge|expungement|sealing|relief)\b/i, "asks about their eligibility"],
  [/\b(evict(ed|ion)?|garnish(ed|ment)?|warrant|deport(ed|ation)?|custody|restraining order)\b/i, "raises a high-stakes legal situation"]
];

const URGENT_PATTERN = /\b(urgent|asap|immediately|right away|emergency|charged twice|double charged|can'?t (log|sign) in|locked out|lost (my )?(packet|document)|refund|deadline|by tomorrow)\b/i;
const LOW_PATTERN = /\b(no rush|whenever|just curious|feedback|suggestion|idea for)\b/i;

export function classifySupportText(rawText = "") {
  const text = clean(rawText);
  const uplReasons = UPL_PATTERNS.filter(([re]) => re.test(text)).map(([, reason]) => reason);
  const urgency = URGENT_PATTERN.test(text) ? "urgent" : LOW_PATTERN.test(text) ? "low" : "normal";
  return { urgency, uplSensitive: uplReasons.length > 0, uplReasons };
}

// One canonical support-issue shape. Accepts the legacy growth-inbox conversion records
// (severity/riskLevel/legalSensitivity survive in place) and re-classifies from the text
// so urgency and UPL sensitivity are always present and current.
export function normalizeSupportIssue(input = {}, { now = nowIso } = {}) {
  const at = typeof now === "function" ? now() : clean(now) || nowIso();
  const summary = clean(input.summary || input.rawText || input.description);
  const title = clean(input.title) || summary.slice(0, 80);
  if (!title) throw new Error("A support issue needs a plain-English title.");
  const classified = classifySupportText(`${title}\n${summary}`);
  return {
    ...input,
    id: clean(input.id) || stableMemoryId("support", [title, summary, input.source]),
    source: clean(input.source) || "manual",
    contact_email: clean(input.contact_email || input.email),
    title,
    summary,
    category: clean(input.category) || (classified.uplSensitive ? "legal advice risk" : "customer question"),
    urgency: SUPPORT_URGENCY.includes(input.urgency) ? input.urgency : classified.urgency,
    upl_sensitive: input.upl_sensitive === undefined ? classified.uplSensitive : Boolean(input.upl_sensitive),
    upl_reasons: list(input.upl_reasons).length ? list(input.upl_reasons).map(clean) : classified.uplReasons,
    status: SUPPORT_STATUSES.includes(input.status) ? input.status : "open",
    draft_reply: clean(input.draft_reply),
    draft_prepared_at: clean(input.draft_prepared_at),
    resolved_at: clean(input.resolved_at),
    resolved_by: clean(input.resolved_by),
    created_at: clean(input.created_at) || at,
    updated_at: at,
    history: list(input.history).slice(0, 30)
  };
}

// Internal draft reply. Plain skeleton the operator edits; bracketed slots make the
// unfinished parts impossible to miss. Refused outright for UPL-sensitive messages.
export function prepareSupportDraftReply(issue = {}, { now = nowIso } = {}) {
  const at = typeof now === "function" ? now() : clean(now) || nowIso();
  if (issue.upl_sensitive) {
    return {
      ok: false,
      error: "This message may ask for legal advice, so no draft is prepared. Read it and reply personally."
    };
  }
  const name = clean(issue.contact_email).split("@")[0] || "there";
  const opener = issue.urgency === "urgent"
    ? "Thanks for flagging this, and sorry for the trouble. I looked into it right away."
    : "Thanks for reaching out.";
  const draft = [
    `Hi ${name},`,
    "",
    opener,
    "",
    "[Add the specific answer here.]",
    "",
    "If anything is unclear, just reply and I will pick it up.",
    "",
    "Roger",
    "LegalEase"
  ].join("\n");
  return {
    ok: true,
    issue: {
      ...issue,
      status: issue.status === "open" ? "drafted" : issue.status,
      draft_reply: draft,
      draft_prepared_at: at,
      updated_at: at,
      history: [{ action: "draft_prepared", at, note: "Internal draft prepared for review. Nothing was sent." }, ...list(issue.history)].slice(0, 30)
    }
  };
}

export function transitionSupportIssue(issues = [], { id = "", status = "", actor = "owner", note = "", now = nowIso } = {}) {
  const at = typeof now === "function" ? now() : clean(now) || nowIso();
  const all = list(issues);
  const issue = all.find((i) => i.id === id);
  if (!issue) return { ok: false, error: "Support issue not found.", issues: all };
  if (!SUPPORT_STATUSES.includes(status)) return { ok: false, error: `Unknown status "${status}".`, issues: all };
  const current = SUPPORT_STATUSES.includes(issue.status) ? issue.status : "open";
  if (!(SUPPORT_TRANSITIONS[current] || []).includes(status)) {
    return { ok: false, error: `Cannot move this issue from "${current}" to "${status}".`, issues: all };
  }
  const updated = {
    ...issue,
    status,
    resolved_at: ["resolved", "closed"].includes(status) ? at : issue.resolved_at || "",
    resolved_by: ["resolved", "closed"].includes(status) ? clean(actor) || "owner" : issue.resolved_by || "",
    updated_at: at,
    history: [{ action: `status_${status}`, at, by: clean(actor) || "owner", note: clean(note) }, ...list(issue.history)].slice(0, 30)
  };
  return { ok: true, issues: all.map((i) => (i.id === id ? updated : i)), issue: updated };
}

export function upsertSupportIssues(existing = [], incoming = [], { now = nowIso } = {}) {
  const byId = new Map(list(existing).map((i) => [i.id, i]));
  for (const raw of list(incoming)) {
    const issue = raw && raw.id && raw.created_at ? raw : normalizeSupportIssue(raw, { now });
    byId.set(issue.id, issue);
  }
  return [...byId.values()].slice(0, 500);
}
