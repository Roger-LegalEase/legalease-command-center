// RCAP Prospect CRM — Wave 2, Packet 5: source, claim, and profile persistence contracts.
//
// Wave 1 shipped read models over records that already existed. This is the first RCAP CRM code
// that defines records of its own, so it is also the first place the cross-account rule has real
// teeth: rule 9 says no account fact, contact, source, strategy, or message may cross into
// another account, and every builder below refuses to construct a record that would.
//
// Three properties are load-bearing and are the reason this module is pure:
//
//   1. DETERMINISM. Nothing here reads the clock, the filesystem, the network, or a random
//      source. Ids and hashes are derived from content. Two runs over the same inputs produce
//      byte-identical records, which is what makes version comparison and targeted invalidation
//      meaningful rather than approximate.
//   2. PROVENANCE. A claim that asserts something about the world must name the sources it came
//      from (rule 23). The builder enforces it by fact class, so a Le-E recommendation and a
//      source-backed fact can never be stored in a way that renders them identically.
//   3. NO SILENT MUTATION. A proposed correction to a CRM field is a RECORD, not a write. Rule 5
//      forbids a silent commercial-stage change, and the same reasoning covers every other field
//      the research engine thinks it knows better: the engine proposes, a person decides.
//
// No migration ships with this. The Wave 0 audit established that leos_core_records is a generic
// (collection, item_id, payload jsonb) table, so a new collection needs registration in
// storage.mjs and nothing else -- see docs/rcap-prospect-crm/01_WAVE_2_PERSISTENCE_DESIGN.md for
// the allowlist, index, RLS and rollback story that goes with these names.

import crypto from "node:crypto";

import {
  RCAP_FACT_CLASSES,
  RCAP_PROFILE_SECTIONS,
  RCAP_PROFILE_SECTION_STATES,
  RCAP_PROFILE_STATUSES
} from "./rcap-prospect-registries.mjs";

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const lower = (value = "") => clean(value).toLowerCase();

// ---------------------------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------------------------
//
// MUST stay in sync with coreStateCollections in scripts/storage.mjs. An unregistered collection
// writes fine against the local JSON store and is silently dropped on Supabase -- the B1 trap the
// audit found had already destroyed reactivationContacts once. test-rcap-profile-contracts.mjs
// asserts membership for every name below.

export const RCAP_PROFILE_COLLECTIONS = Object.freeze([
  "rcapProspectSources",
  "rcapProspectClaims",
  "rcapProfileRuns",
  "rcapProfileVersions",
  "rcapProfileSections",
  "rcapProfileUnknowns",
  "rcapProfileCorrections",
  "rcapProfileDependencies",
  "rcapProfileSnapshots"
]);

// A snapshot is the immutable basis for version comparison. It is never edited and never
// deleted, so it is append-only: that is both the honest semantics and the thing that stops a
// stale scoped patch from erasing the history a comparison depends on.
export const RCAP_APPEND_ONLY_PROFILE_COLLECTIONS = Object.freeze(["rcapProfileSnapshots"]);

// ---------------------------------------------------------------------------------------------
// Hashing and identity
// ---------------------------------------------------------------------------------------------

// Canonical JSON: object keys sorted, arrays left in order (their order is meaningful), undefined
// dropped. Without the sort, two records with the same content but a different key insertion
// order hash differently, and every comparison reports a change that did not happen.
function canonical(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const entry = canonical(value[key]);
      if (entry !== undefined) out[key] = entry;
    }
    return out;
  }
  return value;
}

export function rcapCanonicalJson(value) {
  return JSON.stringify(canonical(value));
}

// 16 hex characters, matching googleSourceRefHash so the two provenance systems read alike.
export function rcapContentHash(value) {
  return crypto.createHash("sha256").update(rcapCanonicalJson(value)).digest("hex").slice(0, 16);
}

// Deterministic record ids. Derived from the account and the record's identifying content, so
// re-running an import or a profile pass over unchanged inputs upserts the same row instead of
// growing a duplicate every time.
export function rcapRecordId(prefix, ...parts) {
  const key = parts.map((part) => clean(part)).join("|");
  return `${clean(prefix) || "rcap"}_${rcapContentHash(key)}`;
}

// ---------------------------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------------------------

export const RCAP_SOURCE_KINDS = Object.freeze([
  Object.freeze({ key: "google_doc", label: "Google Doc", external: true, requiresRef: true }),
  Object.freeze({ key: "website", label: "Website", external: true, requiresRef: true }),
  Object.freeze({ key: "workbook_row", label: "Directory workbook", external: false, requiresRef: true }),
  Object.freeze({ key: "email_thread", label: "Email thread", external: true, requiresRef: true }),
  Object.freeze({ key: "human_note", label: "Human note", external: false, requiresRef: false })
]);

// Access is a fact about the source, not about the account. A document we are not authorized to
// read is a DIFFERENT state from one that does not exist, and both differ from one we simply
// have not fetched yet. Collapsing them is how a surface ends up claiming an organization has no
// research when the truth is that a scope was never granted.
export const RCAP_SOURCE_ACCESS_STATES = Object.freeze([
  Object.freeze({ key: "not_fetched", label: "Not read yet", readable: false, blocking: false }),
  Object.freeze({ key: "available", label: "Read", readable: true, blocking: false }),
  Object.freeze({ key: "not_authorized", label: "Not authorized", readable: false, blocking: true }),
  Object.freeze({ key: "missing", label: "Not found", readable: false, blocking: true }),
  Object.freeze({ key: "error", label: "Could not be read", readable: false, blocking: true })
]);

export const RCAP_CLAIM_STATES = Object.freeze([
  "proposed", "accepted", "rejected", "superseded"
]);

export const RCAP_RUN_STATUSES = Object.freeze([
  "queued", "running", "succeeded", "failed", "blocked", "cancelled"
]);

export const RCAP_TERMINAL_RUN_STATUSES = Object.freeze(["succeeded", "failed", "blocked", "cancelled"]);

export const RCAP_RUN_TRIGGERS = Object.freeze([
  "human_request", "import", "regenerate_section", "scheduled_refresh", "invalidation"
]);

export const RCAP_UNKNOWN_STATES = Object.freeze(["open", "answered", "dismissed"]);

export const RCAP_CORRECTION_STATES = Object.freeze(["proposed", "accepted", "rejected"]);

// What a section can depend on. Targeted invalidation is the point: when one source changes,
// only the sections that actually used it go stale, rather than the whole profile.
export const RCAP_DEPENDENCY_KINDS = Object.freeze(["source", "claim", "account_field", "section"]);

const SOURCE_KIND_KEYS = new Set(RCAP_SOURCE_KINDS.map((entry) => entry.key));
const SOURCE_ACCESS_KEYS = new Set(RCAP_SOURCE_ACCESS_STATES.map((entry) => entry.key));
const FACT_CLASS_BY_KEY = new Map(RCAP_FACT_CLASSES.map((entry) => [entry.key, entry]));
const SECTION_BY_KEY = new Map(RCAP_PROFILE_SECTIONS.map((entry) => [entry.key, entry]));
const SECTION_STATES = new Set(RCAP_PROFILE_SECTION_STATES);
const PROFILE_STATUS_KEYS = new Set(RCAP_PROFILE_STATUSES.map((entry) => entry.key));

export function rcapSourceKind(key = "") {
  return RCAP_SOURCE_KINDS.find((entry) => entry.key === lower(key)) || null;
}

export function rcapSourceAccessState(key = "") {
  return RCAP_SOURCE_ACCESS_STATES.find((entry) => entry.key === lower(key)) || null;
}

export function rcapSourceIsReadable(key = "") {
  return Boolean(rcapSourceAccessState(key)?.readable);
}

export function isRcapProfileSectionKey(key = "") {
  return SECTION_BY_KEY.has(lower(key));
}

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

// A contract violation is a programming error, not a user error, and it must be loud. Silently
// coercing a bad record into a plausible one is how a fact ends up on the wrong account.
export class RcapContractError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RcapContractError";
    this.details = Object.freeze({ ...details });
  }
}

function require$(condition, message, details) {
  if (!condition) throw new RcapContractError(message, details);
}

function requireAccount(accountId) {
  const id = clean(accountId);
  require$(id, "Every RCAP profile record must name the account it belongs to.");
  return id;
}

// Rule 9, enforced rather than documented. Every id a record points at must have been resolved
// against the same account; the caller passes the account-scoped index it read them from.
function requireSameAccount(accountId, ids, index, label) {
  if (!index) return list(ids).map(clean).filter(Boolean);
  const out = [];
  for (const raw of list(ids)) {
    const id = clean(raw);
    if (!id) continue;
    const owner = clean(index.get ? index.get(id) : index[id]);
    require$(owner, `${label} ${id} is not a known record for this account.`, { accountId, id });
    require$(owner === accountId, `${label} ${id} belongs to account ${owner}, not ${accountId}.`, { accountId, id, owner });
    out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Source records
// ---------------------------------------------------------------------------------------------
//
// A source is a thing that was (or could not be) read. It carries what is needed to fetch it
// again, to know whether the copy we reasoned from is still current, and to tell a reader why a
// document is not contributing.

export function buildRcapSource(input = {}) {
  const accountId = requireAccount(input.accountId);
  const kind = lower(input.kind);
  require$(SOURCE_KIND_KEYS.has(kind), `Unknown RCAP source kind "${input.kind}".`, { accountId });

  const definition = rcapSourceKind(kind);
  const ref = clean(input.ref);
  require$(!definition.requiresRef || ref, `A ${definition.label} source must carry a reference.`, { accountId, kind });

  const accessState = lower(input.accessState) || "not_fetched";
  require$(SOURCE_ACCESS_KEYS.has(accessState), `Unknown source access state "${input.accessState}".`, { accountId, kind });

  // A source that has not been read cannot claim a revision or a checksum: those are properties
  // of a retrieved copy. Storing them anyway would let a stale-check pass against content nobody
  // ever fetched.
  const readable = rcapSourceIsReadable(accessState);
  const revisionId = readable ? clean(input.revisionId) : "";
  const contentChecksum = readable ? clean(input.contentChecksum) : "";
  const retrievedAt = readable ? clean(input.retrievedAt) : "";
  require$(!readable || retrievedAt, "A source that was read must record when it was read.", { accountId, kind, ref });

  const unreadableReason = readable ? "" : clean(input.unreadableReason);
  require$(
    readable || accessState === "not_fetched" || unreadableReason,
    "A source that could not be read must say why, or the surface has nothing honest to show.",
    { accountId, kind, ref, accessState }
  );

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("rsrc", accountId, kind, ref || clean(input.title)),
    accountId,
    kind,
    ref,
    refHash: ref ? rcapContentHash(ref) : "",
    title: clean(input.title),
    accessState,
    unreadableReason,
    retrievedAt,
    revisionId,
    contentChecksum,
    addedBy: clean(input.addedBy),
    addedAt: clean(input.addedAt),
    // Set by the caller when a human says a source is not relevant to this account. Kept rather
    // than deleted so the same document is not re-proposed on the next run.
    dismissed: input.dismissed === true,
    dismissedReason: input.dismissed === true ? clean(input.dismissedReason) : ""
  });
}

// A source is stale when the copy we reasoned from is not the copy that exists now. Unknown on
// either side is NOT stale -- it is unknown, and saying otherwise invents a fact.
export function rcapSourceIsStale(source = {}, observed = {}) {
  const storedRevision = clean(source.revisionId);
  const observedRevision = clean(observed.revisionId);
  if (storedRevision && observedRevision) return storedRevision !== observedRevision;
  const storedChecksum = clean(source.contentChecksum);
  const observedChecksum = clean(observed.contentChecksum);
  if (storedChecksum && observedChecksum) return storedChecksum !== observedChecksum;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Claim records
// ---------------------------------------------------------------------------------------------
//
// A claim is one assertion, attributed. It is the unit the Profile workspace shows a source panel
// for, and the unit a person approves or rejects.

export function buildRcapClaim(input = {}, options = {}) {
  const accountId = requireAccount(input.accountId);
  const factClass = lower(input.factClass);
  const definition = FACT_CLASS_BY_KEY.get(factClass);
  require$(definition, `Unknown RCAP fact class "${input.factClass}".`, { accountId });

  const sectionKey = lower(input.sectionKey);
  require$(SECTION_BY_KEY.has(sectionKey), `Claim references unknown profile section "${input.sectionKey}".`, { accountId });

  const text = clean(input.text);
  require$(text, "A claim with no text asserts nothing and must not be stored.", { accountId, sectionKey });

  const sourceIds = requireSameAccount(accountId, input.sourceIds, options.sourceOwners, "Source");

  // Rule 23. A verified fact and a supported inference are claims ABOUT THE WORLD and must name
  // where they came from. A recommendation, an open question, a pilot hypothesis and a human note
  // are not, and must not borrow the authority of a citation they do not have.
  require$(
    !definition.requiresSource || sourceIds.length > 0,
    `A ${definition.label.toLowerCase()} claim must cite at least one source.`,
    { accountId, sectionKey, factClass }
  );

  const state = lower(input.state) || "proposed";
  require$(RCAP_CLAIM_STATES.includes(state), `Unknown claim state "${input.state}".`, { accountId, sectionKey });

  const contentHash = rcapContentHash({ accountId, sectionKey, factClass, text, sourceIds });

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("rclm", accountId, sectionKey, contentHash),
    accountId,
    sectionKey,
    sectionNumber: SECTION_BY_KEY.get(sectionKey).number,
    factClass,
    factLabel: definition.label,
    text,
    sourceIds: Object.freeze(sourceIds),
    // A quote lifted verbatim from a source, so the workspace can show the reader the line the
    // claim rests on instead of asking them to trust a paraphrase.
    evidence: clean(input.evidence),
    confidence: normalizeConfidence(input.confidence),
    state,
    runId: clean(input.runId),
    supersedesClaimId: clean(input.supersedesClaimId),
    contentHash,
    createdAt: clean(input.createdAt),
    decidedBy: state === "proposed" ? "" : clean(input.decidedBy),
    decidedAt: state === "proposed" ? "" : clean(input.decidedAt)
  });
}

// Confidence is a number or it is absent. A default of 0.5 would be a fabricated measurement,
// and rule 15 forbids fake data as firmly as it forbids a fake zero.
function normalizeConfidence(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(1, Math.max(0, numeric));
}

// ---------------------------------------------------------------------------------------------
// Profile runs
// ---------------------------------------------------------------------------------------------
//
// A run is the durable job record. It exists so that a profile pass that dies mid-flight leaves
// evidence instead of a silently missing profile, and so a retry can be told apart from a first
// attempt.

export function buildRcapProfileRun(input = {}) {
  const accountId = requireAccount(input.accountId);
  const status = lower(input.status) || "queued";
  require$(RCAP_RUN_STATUSES.includes(status), `Unknown profile run status "${input.status}".`, { accountId });

  const trigger = lower(input.trigger);
  require$(RCAP_RUN_TRIGGERS.includes(trigger), `Unknown profile run trigger "${input.trigger}".`, { accountId });

  const sourceIds = list(input.sourceIds).map(clean).filter(Boolean);
  const sectionKeys = list(input.sectionKeys).map(lower).filter((key) => SECTION_BY_KEY.has(key));

  // The input hash is what makes a rerun detectable: same account, same sources, same requested
  // sections, same engine version means the same work.
  const inputHash = rcapContentHash({
    accountId,
    sourceIds: [...sourceIds].sort(),
    sectionKeys: [...sectionKeys].sort(),
    engineVersion: clean(input.engineVersion)
  });

  const terminal = RCAP_TERMINAL_RUN_STATUSES.includes(status);
  const failure = status === "failed" || status === "blocked";
  require$(
    !failure || clean(input.reason),
    "A failed or blocked run must record why, or the workspace can only say something went wrong.",
    { accountId, status }
  );
  require$(!terminal || clean(input.finishedAt), "A finished run must record when it finished.", { accountId, status });

  const attempt = Number.isFinite(Number(input.attempt)) ? Math.max(1, Math.trunc(Number(input.attempt))) : 1;

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("rrun", accountId, inputHash, String(attempt)),
    accountId,
    status,
    trigger,
    attempt,
    requestedBy: clean(input.requestedBy),
    startedAt: clean(input.startedAt),
    finishedAt: terminal ? clean(input.finishedAt) : "",
    sourceIds: Object.freeze(sourceIds),
    sectionKeys: Object.freeze(sectionKeys),
    engineVersion: clean(input.engineVersion),
    inputHash,
    reason: clean(input.reason),
    // Set when the run stopped because of something outside the engine -- a scope that was never
    // granted, a document nobody can read. Distinct from a failure, which is ours.
    blockerKey: status === "blocked" ? clean(input.blockerKey) : "",
    versionId: clean(input.versionId)
  });
}

// A run is retryable when it failed on our side. A blocked run is not: retrying it changes
// nothing until a person clears the blocker, and an automatic retry loop against a missing OAuth
// scope is just a way to hide the blocker.
export function rcapRunIsRetryable(run = {}, options = {}) {
  const maxAttempts = Number.isFinite(Number(options.maxAttempts)) ? Number(options.maxAttempts) : 3;
  if (lower(run.status) !== "failed") return false;
  return (Number(run.attempt) || 1) < maxAttempts;
}

// ---------------------------------------------------------------------------------------------
// Profile versions, sections and snapshots
// ---------------------------------------------------------------------------------------------

export function buildRcapProfileVersion(input = {}) {
  const accountId = requireAccount(input.accountId);
  const versionNumber = Math.max(1, Math.trunc(Number(input.versionNumber) || 1));
  const status = lower(input.status) || "needs_review";
  require$(PROFILE_STATUS_KEYS.has(status), `Unknown profile status "${input.status}".`, { accountId });

  const sectionHashes = list(input.sectionHashes).map(clean).filter(Boolean);
  const contentHash = rcapContentHash({ accountId, versionNumber, sectionHashes: [...sectionHashes].sort() });

  const approved = status === "approved";
  require$(!approved || clean(input.approvedBy), "An approved profile version must record who approved it.", { accountId });

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("rver", accountId, String(versionNumber), contentHash),
    accountId,
    versionNumber,
    runId: clean(input.runId),
    status,
    contentHash,
    sectionHashes: Object.freeze(sectionHashes),
    supersedesVersionId: clean(input.supersedesVersionId),
    createdAt: clean(input.createdAt),
    approvedBy: approved ? clean(input.approvedBy) : "",
    approvedAt: approved ? clean(input.approvedAt) : "",
    // A disqualification is a successful outcome (rule 24), so it carries its reasoning rather
    // than being treated as an error with a stack trace.
    disqualificationReason: status === "disqualified" ? clean(input.disqualificationReason) : ""
  });
}

export function buildRcapProfileSection(input = {}, options = {}) {
  const accountId = requireAccount(input.accountId);
  const sectionKey = lower(input.sectionKey);
  const section = SECTION_BY_KEY.get(sectionKey);
  require$(section, `Unknown profile section "${input.sectionKey}".`, { accountId });

  const state = lower(input.state) || "draft";
  require$(SECTION_STATES.has(state), `Unknown section state "${input.state}".`, { accountId, sectionKey });

  const claimIds = requireSameAccount(accountId, input.claimIds, options.claimOwners, "Claim");
  const body = clean(input.body);

  // A section that is blocked or has no body must say why. An empty approved section would read
  // as "we looked and there is nothing", which is a claim in itself.
  require$(
    body || clean(input.emptyReason),
    "A section with no body must record why it is empty.",
    { accountId, sectionKey, state }
  );

  const humanEdited = input.humanEdited === true;
  require$(!humanEdited || clean(input.editedBy), "A human-edited section must record who edited it.", { accountId, sectionKey });

  // The human-edit guard. Regeneration must never quietly overwrite what a person wrote, so the
  // hash of the text at the moment of the edit travels with the record; the engine compares
  // against it before replacing anything.
  const humanEditHash = humanEdited ? rcapContentHash({ accountId, sectionKey, body }) : "";
  const contentHash = rcapContentHash({ accountId, sectionKey, body, claimIds: [...claimIds].sort() });

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("rsec", accountId, sectionKey, clean(input.versionId)),
    accountId,
    versionId: clean(input.versionId),
    sectionKey,
    sectionNumber: section.number,
    sectionLabel: section.label,
    group: section.group,
    state,
    body,
    emptyReason: body ? "" : clean(input.emptyReason),
    claimIds: Object.freeze(claimIds),
    unknownIds: Object.freeze(list(input.unknownIds).map(clean).filter(Boolean)),
    humanEdited,
    humanEditHash,
    editedBy: humanEdited ? clean(input.editedBy) : "",
    editedAt: humanEdited ? clean(input.editedAt) : "",
    staleReason: state === "stale" ? clean(input.staleReason) : "",
    blockedReason: state === "blocked" ? clean(input.blockedReason) : "",
    contentHash
  });
}

// A snapshot freezes a version's sections so a later comparison has something real to compare
// against. Append-only: once written it is never edited.
export function buildRcapProfileSnapshot(input = {}) {
  const accountId = requireAccount(input.accountId);
  const versionId = clean(input.versionId);
  require$(versionId, "A snapshot must name the version it froze.", { accountId });

  const sections = list(input.sections).map((section) => Object.freeze({
    sectionKey: lower(section.sectionKey),
    state: lower(section.state),
    body: clean(section.body),
    contentHash: clean(section.contentHash)
  }));

  const contentHash = rcapContentHash({ accountId, versionId, sections });

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("rsnp", accountId, versionId, contentHash),
    accountId,
    versionId,
    capturedAt: clean(input.capturedAt),
    sections: Object.freeze(sections),
    contentHash
  });
}

// Version comparison. Returns one entry per section that differs, saying which way it moved --
// the workspace renders this directly, so "unchanged" has to be a real answer and not an absence.
export function rcapCompareProfileSnapshots(before = {}, after = {}) {
  const beforeSections = new Map(list(before.sections).map((section) => [lower(section.sectionKey), section]));
  const afterSections = new Map(list(after.sections).map((section) => [lower(section.sectionKey), section]));
  const keys = [...new Set([...beforeSections.keys(), ...afterSections.keys()])]
    .filter((key) => SECTION_BY_KEY.has(key))
    .sort((a, b) => SECTION_BY_KEY.get(a).number - SECTION_BY_KEY.get(b).number);

  const changes = keys.map((key) => {
    const left = beforeSections.get(key) || null;
    const right = afterSections.get(key) || null;
    let change = "unchanged";
    if (!left && right) change = "added";
    else if (left && !right) change = "removed";
    else if (clean(left.contentHash) !== clean(right.contentHash)) change = "changed";
    return Object.freeze({
      sectionKey: key,
      sectionNumber: SECTION_BY_KEY.get(key).number,
      sectionLabel: SECTION_BY_KEY.get(key).label,
      change,
      before: left ? clean(left.body) : "",
      after: right ? clean(right.body) : ""
    });
  });

  return Object.freeze({
    identical: changes.every((entry) => entry.change === "unchanged"),
    changedCount: changes.filter((entry) => entry.change !== "unchanged").length,
    sections: Object.freeze(changes)
  });
}

// ---------------------------------------------------------------------------------------------
// Unknowns and proposed corrections
// ---------------------------------------------------------------------------------------------
//
// An unknown is a first-class product object, not a gap. The master plan treats "we do not know
// X, and here is how to find out" as a research OUTPUT, so it gets a record with a resolution
// path rather than being rendered as an empty field.

export function buildRcapProfileUnknown(input = {}) {
  const accountId = requireAccount(input.accountId);
  const sectionKey = lower(input.sectionKey);
  require$(SECTION_BY_KEY.has(sectionKey), `Unknown references unknown profile section "${input.sectionKey}".`, { accountId });

  const question = clean(input.question);
  require$(question, "An unknown must state the question.", { accountId, sectionKey });

  const whyItMatters = clean(input.whyItMatters);
  const howToResolve = clean(input.howToResolve);
  require$(whyItMatters && howToResolve, "An unknown must say why it matters and how to resolve it.", { accountId, sectionKey });

  const state = lower(input.state) || "open";
  require$(RCAP_UNKNOWN_STATES.includes(state), `Unknown unknown-state "${input.state}".`, { accountId, sectionKey });
  require$(state !== "answered" || clean(input.answer), "An answered unknown must carry the answer.", { accountId, sectionKey });

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("runk", accountId, sectionKey, question),
    accountId,
    sectionKey,
    question,
    whyItMatters,
    howToResolve,
    state,
    answer: state === "answered" ? clean(input.answer) : "",
    answeredBy: state === "answered" ? clean(input.answeredBy) : "",
    answeredAt: state === "answered" ? clean(input.answeredAt) : "",
    dismissedReason: state === "dismissed" ? clean(input.dismissedReason) : "",
    createdAt: clean(input.createdAt)
  });
}

// A proposed correction is the engine saying "the CRM says X, the sources say Y". Storing it as a
// record rather than applying it is the whole point: rule 5 forbids a silent stage change, and
// there is no field where a research pass gets to overwrite a person without being asked.
export function buildRcapProposedCorrection(input = {}, options = {}) {
  const accountId = requireAccount(input.accountId);
  const field = clean(input.field);
  require$(field, "A proposed correction must name the field it would change.", { accountId });

  const proposedValue = clean(input.proposedValue);
  require$(proposedValue, "A proposed correction must carry the proposed value.", { accountId, field });

  const currentValue = clean(input.currentValue);
  require$(currentValue !== proposedValue, "A correction that changes nothing must not be proposed.", { accountId, field });

  const sourceIds = requireSameAccount(accountId, input.sourceIds, options.sourceOwners, "Source");
  require$(sourceIds.length > 0, "A proposed correction must cite the sources it rests on.", { accountId, field });

  const state = lower(input.state) || "proposed";
  require$(RCAP_CORRECTION_STATES.includes(state), `Unknown correction state "${input.state}".`, { accountId, field });
  require$(state === "proposed" || clean(input.decidedBy), "An accepted or rejected correction must record who decided.", { accountId, field });

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("rcor", accountId, field, proposedValue),
    accountId,
    field,
    currentValue,
    proposedValue,
    rationale: clean(input.rationale),
    sourceIds: Object.freeze(sourceIds),
    state,
    decidedBy: state === "proposed" ? "" : clean(input.decidedBy),
    decidedAt: state === "proposed" ? "" : clean(input.decidedAt),
    createdAt: clean(input.createdAt),
    // Accepting a correction is a write to the account record, performed by the caller through
    // the existing relationship action contract. The flag records that it happened; it does not
    // perform it, because this module writes nothing.
    applied: state === "accepted" && input.applied === true
  });
}

// ---------------------------------------------------------------------------------------------
// Dependencies and targeted invalidation
// ---------------------------------------------------------------------------------------------

export function buildRcapProfileDependency(input = {}) {
  const accountId = requireAccount(input.accountId);
  const sectionKey = lower(input.sectionKey);
  require$(SECTION_BY_KEY.has(sectionKey), `Dependency references unknown section "${input.sectionKey}".`, { accountId });

  const dependsOnKind = lower(input.dependsOnKind);
  require$(RCAP_DEPENDENCY_KINDS.includes(dependsOnKind), `Unknown dependency kind "${input.dependsOnKind}".`, { accountId, sectionKey });

  const dependsOnId = clean(input.dependsOnId);
  require$(dependsOnId, "A dependency must name what it depends on.", { accountId, sectionKey, dependsOnKind });
  require$(
    dependsOnKind !== "section" || dependsOnId !== sectionKey,
    "A section cannot depend on itself.",
    { accountId, sectionKey }
  );

  return Object.freeze({
    id: clean(input.id) || rcapRecordId("rdep", accountId, sectionKey, dependsOnKind, dependsOnId),
    accountId,
    sectionKey,
    dependsOnKind,
    dependsOnId,
    createdAt: clean(input.createdAt)
  });
}

// Given the things that changed, return the sections that are now stale -- and only those.
//
// Section-to-section edges are followed transitively, so a change to the sources behind the
// Strategic Verdict also invalidates the Outreach Sequence that was written on top of it. The
// walk is bounded by the number of sections, so a dependency cycle terminates instead of hanging.
export function rcapSectionsInvalidatedBy(changes = {}, dependencies = []) {
  const changedSources = new Set(list(changes.sourceIds).map(clean).filter(Boolean));
  const changedClaims = new Set(list(changes.claimIds).map(clean).filter(Boolean));
  const changedFields = new Set(list(changes.accountFields).map(clean).filter(Boolean));

  const edges = list(dependencies).filter((entry) => SECTION_BY_KEY.has(lower(entry.sectionKey)));
  const stale = new Map();

  const noteStale = (sectionKey, reason) => {
    const key = lower(sectionKey);
    if (!SECTION_BY_KEY.has(key) || stale.has(key)) return;
    stale.set(key, reason);
  };

  for (const edge of edges) {
    const dependsOnId = clean(edge.dependsOnId);
    if (edge.dependsOnKind === "source" && changedSources.has(dependsOnId)) noteStale(edge.sectionKey, "A source it cites changed.");
    else if (edge.dependsOnKind === "claim" && changedClaims.has(dependsOnId)) noteStale(edge.sectionKey, "A claim it rests on changed.");
    else if (edge.dependsOnKind === "account_field" && changedFields.has(dependsOnId)) noteStale(edge.sectionKey, `The account's ${dependsOnId} changed.`);
  }

  // Propagate along section edges until nothing new goes stale. RCAP_PROFILE_SECTIONS.length
  // passes is enough to reach every section from any starting point, and caps a cycle.
  for (let pass = 0; pass < RCAP_PROFILE_SECTIONS.length; pass += 1) {
    const before = stale.size;
    for (const edge of edges) {
      if (edge.dependsOnKind !== "section") continue;
      if (stale.has(lower(edge.dependsOnId))) {
        noteStale(edge.sectionKey, `${SECTION_BY_KEY.get(lower(edge.dependsOnId)).label} changed.`);
      }
    }
    if (stale.size === before) break;
  }

  return Object.freeze([...stale.entries()]
    .map(([sectionKey, reason]) => Object.freeze({
      sectionKey,
      sectionNumber: SECTION_BY_KEY.get(sectionKey).number,
      sectionLabel: SECTION_BY_KEY.get(sectionKey).label,
      reason
    }))
    .sort((a, b) => a.sectionNumber - b.sectionNumber));
}

// Regeneration guard. A human edit is never silently discarded: the caller must either be
// preserving it or have been told explicitly to replace it.
export function rcapRegenerationPlan(sections = [], targetKeys = [], options = {}) {
  const wanted = new Set(list(targetKeys).map(lower).filter((key) => SECTION_BY_KEY.has(key)));
  const replaceHumanEdits = options.replaceHumanEdits === true;

  const plan = list(sections)
    .filter((section) => wanted.size === 0 || wanted.has(lower(section.sectionKey)))
    .map((section) => {
      const humanEdited = section.humanEdited === true;
      const preserve = humanEdited && !replaceHumanEdits;
      return Object.freeze({
        sectionKey: lower(section.sectionKey),
        action: preserve ? "preserve" : "regenerate",
        reason: preserve
          ? `Edited by ${clean(section.editedBy) || "a person"}; regeneration would discard it.`
          : ""
      });
    });

  return Object.freeze({
    regenerate: Object.freeze(plan.filter((entry) => entry.action === "regenerate").map((entry) => entry.sectionKey)),
    preserved: Object.freeze(plan.filter((entry) => entry.action === "preserve"))
  });
}
