// RCAP Prospect Profile endpoint (Wave 2, Packet 7).
//
// GET  /api/ui/rcap-profile?account=ID   -> the profile workspace
// POST /api/ui/rcap-profile              -> one guarded action against one section or correction
//
// This is a separate module from rcap-prospects-api.mjs on purpose. That endpoint is read-only
// and says so at the top of the file; the Overview's writes go through the existing relationship
// action contract because those records already had an owner. The profile records did not exist
// before Wave 2, so they need a write path of their own, and giving it its own module keeps the
// read-only promise on the other one true rather than merely historical.
//
// What every write here has in common:
//
//   - a capability check on the server, by action, before anything is read for writing;
//   - a requestId, so a retried request is not a second action;
//   - an expectedVersion, so a decision made against a profile that has since been regenerated
//     conflicts instead of silently landing on different text;
//   - no provider call, no message, no schedule, no send. The strongest thing here edits a
//     research record.
//
// Accepting a proposed correction is deliberately NOT a write to the account. It records the
// decision and says, in words, that applying it to the account record is a separate step that
// has not happened. Rule 5 forbids a silent stage change; quietly widening "I agree with this
// research" into "change the CRM" would be the same failure wearing a different hat.

import {
  RCAP_CAPABILITIES,
  RCAP_PROFILE_SECTIONS
} from "./rcap-prospect-registries.mjs";
import {
  buildRcapProfileDependency,
  buildRcapProfileRun,
  buildRcapProfileSection,
  rcapRegenerationPlan
} from "./rcap-profile-contracts.mjs";
import { RCAP_PROFILE_READ_COLLECTIONS, buildRcapProspectProfile } from "./ui/view-models/rcap-prospect-profile.mjs";
import { RELATIONSHIP_DETAIL_READ_COLLECTIONS } from "./relationship-service.mjs";
import { roleHasCapability } from "./roles.mjs";

const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();
const list = (value) => (Array.isArray(value) ? value : []);

export const RCAP_PROFILE_API_PATH = "/api/ui/rcap-profile";

// A section edit is prose, not a document. 20k matches the composer's bound and is far more than
// any of the fifteen sections needs.
export const RCAP_PROFILE_BODY_LIMIT = 20_000;

export const RCAP_PROFILE_API_READ_COLLECTIONS = Object.freeze([
  ...new Set([...RELATIONSHIP_DETAIL_READ_COLLECTIONS, ...RCAP_PROFILE_READ_COLLECTIONS])
]);

const SECTION_KEYS = new Set(RCAP_PROFILE_SECTIONS.map((section) => section.key));

// Every action, and the capability it needs. An action missing from this table cannot be
// performed: the default is refusal, not permission.
export const RCAP_PROFILE_ACTIONS = Object.freeze({
  approve_section: RCAP_CAPABILITIES.approve,
  reject_section: RCAP_CAPABILITIES.approve,
  edit_section: RCAP_CAPABILITIES.manage,
  keep_human_edit: RCAP_CAPABILITIES.manage,
  request_research: RCAP_CAPABILITIES.manage,
  regenerate_section: RCAP_CAPABILITIES.manage,
  accept_correction: RCAP_CAPABILITIES.approve,
  reject_correction: RCAP_CAPABILITIES.approve
});

export function isRcapProfileApiPath(pathname = "") {
  return clean(pathname) === RCAP_PROFILE_API_PATH;
}

function safeAccountId(value = "") {
  const decoded = clean(value);
  if (!decoded || decoded.length > 320) return "";
  // Control characters and markup delimiters only. The relationship ids this endpoint receives
  // are shaped like "organization:co-24cd56ae80bcfd50", so colons and hyphens are ordinary
  // content here and must not be filtered out.
  if (/[\u0000-\u001f<>"'`\\]/u.test(decoded)) return "";
  if (/^(?:javascript|data|vbscript)\s*:/i.test(decoded)) return "";
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded)) return "";
  return decoded;
}

const fail = (status, error, extra = {}) => ({ status, body: { ok: false, error, ...extra } });

// A request id is an idempotency key, so it has to be present and bounded. Replay protection
// itself is the append-only claim ledger's job in a later packet; here it makes a retried request
// identifiable rather than anonymous.
function safeRequestId(value = "") {
  const id = clean(value);
  return id && id.length <= 120 && /^[A-Za-z0-9_:.-]+$/.test(id) ? id : "";
}

function replaceById(rows, updated) {
  const id = clean(updated.id);
  const out = list(rows).filter((row) => clean(row?.id) !== id);
  out.push(updated);
  return out;
}

export async function handleRcapProfileApiRequest({
  enabled = false,
  method = "GET",
  pathname = "",
  searchParams = null,
  body = null,
  store = null,
  actor = null,
  now = ""
} = {}) {
  if (!isRcapProfileApiPath(pathname)) return fail(404, "Not found.");

  const verb = String(method || "GET").toUpperCase();
  if (!["GET", "HEAD", "POST"].includes(verb)) return fail(405, "Method not allowed.");

  if (enabled !== true) {
    return {
      status: 200,
      body: { ok: true, kind: "profile", profile: { available: false, availability: { state: "feature_off", reason: "The RCAP prospect workspace is not enabled." } } }
    };
  }

  const role = clean(actor?.role) || "viewer";
  if (!actor?.authenticated || !roleHasCapability(role, RCAP_CAPABILITIES.read)) {
    return fail(403, "You do not have access to RCAP prospect intelligence.");
  }
  if (typeof store?.readCollections !== "function") return fail(503, "RCAP prospect research is temporarily unavailable.");

  if (verb === "POST") return handleAction({ store, actor, role, body, now });

  const accountId = safeAccountId(searchParams?.get?.("account") || "");
  if (!accountId) return fail(400, "An account is required.");

  let state;
  try { state = await store.readCollections(RCAP_PROFILE_API_READ_COLLECTIONS); }
  catch { return fail(503, "RCAP prospect research is temporarily unavailable."); }

  const profile = buildRcapProspectProfile(state, actor, accountId, now, { rcapCrmEnabled: true });
  if (!profile.available) {
    return {
      status: profile.availability?.state === "not_found_or_unauthorized" ? 404 : 200,
      body: { ok: true, kind: "profile", profile }
    };
  }
  return { status: 200, body: { ok: true, kind: "profile", profile } };
}

async function handleAction({ store, actor, role, body, now }) {
  const action = lower(body?.action);
  const capability = RCAP_PROFILE_ACTIONS[action];
  if (!capability) return fail(400, "Unknown action.");
  if (!roleHasCapability(role, capability)) return fail(403, "Your role cannot take this action.");

  const accountId = safeAccountId(body?.accountId);
  if (!accountId) return fail(400, "An account is required.");

  const requestId = safeRequestId(body?.requestId);
  if (!requestId) return fail(400, "A request id is required.");

  const expectedVersion = clean(body?.expectedVersion);
  if (!expectedVersion) return fail(400, "The version you read is required.");

  if (typeof store?.writeChanges !== "function") return fail(503, "RCAP prospect research is temporarily unavailable.");

  let before;
  try { before = await store.readCollections(RCAP_PROFILE_API_READ_COLLECTIONS); }
  catch { return fail(503, "RCAP prospect research is temporarily unavailable."); }

  const profile = buildRcapProspectProfile(before, actor, accountId, now, { rcapCrmEnabled: true });
  if (!profile.available) return fail(404, "That organization is not available.");
  if (!profile.version) return fail(409, "There is no profile version to act on yet.");
  if (profile.version.contentHash !== expectedVersion) {
    return fail(409, "This profile changed since you read it. Reload and look again before deciding.", {
      currentVersion: profile.version.contentHash
    });
  }

  const versionId = profile.version.id;
  const actorId = clean(actor?.id) || clean(actor?.label) || "unknown";
  const sections = list(before.rcapProfileSections);
  const corrections = list(before.rcapProfileCorrections);
  const after = { ...before };

  // ---- correction decisions -------------------------------------------------------------
  if (action === "accept_correction" || action === "reject_correction") {
    const correctionId = clean(body?.correctionId);
    const record = corrections.find((entry) => clean(entry.id) === correctionId && clean(entry.accountId) === accountId);
    if (!record) return fail(404, "That correction is not on this organization.");
    if (lower(record.state) !== "proposed") return fail(409, "That correction has already been decided.");

    const view = profile.corrections.find((entry) => entry.id === correctionId);
    if (view?.state === "conflict") {
      return fail(409, "The account has changed since this correction was proposed. Re-run the research before deciding.");
    }

    after.rcapProfileCorrections = replaceById(corrections, Object.freeze({
      ...record,
      state: action === "accept_correction" ? "accepted" : "rejected",
      decidedBy: actorId,
      decidedAt: now,
      // Accepting records agreement with the research. It does not touch the account record --
      // that write is a separate, separately authorized step.
      applied: false
    }));
    await store.writeChanges(before, after);
    return {
      status: 200,
      body: {
        ok: true,
        action,
        applied: false,
        note: action === "accept_correction"
          ? "Recorded as accepted. Applying it to the account record is a separate step and has not happened."
          : "Recorded as rejected."
      }
    };
  }

  // ---- section actions ------------------------------------------------------------------
  const sectionKey = lower(body?.sectionKey);
  if (!SECTION_KEYS.has(sectionKey)) return fail(400, "Unknown profile section.");

  const record = sections.find((entry) =>
    clean(entry.accountId) === accountId && clean(entry.versionId) === versionId && lower(entry.sectionKey) === sectionKey);
  const view = profile.sections.find((entry) => entry.key === sectionKey);

  if (action === "request_research" || action === "regenerate_section") {
    // Regenerating a section a person wrote is allowed, but never by accident: the caller has to
    // have been told what it would cost and say so explicitly.
    if (action === "regenerate_section" && record?.humanEdited === true && body?.replaceHumanEdits !== true) {
      const plan = rcapRegenerationPlan([record], [sectionKey]);
      return fail(409, `This section was edited by ${clean(record.editedBy) || "a person"}. Regenerating replaces their text.`, {
        preserved: plan.preserved
      });
    }
    const run = buildRcapProfileRun({
      accountId,
      trigger: action === "regenerate_section" ? "regenerate_section" : "human_request",
      status: "queued",
      startedAt: now,
      requestedBy: actorId,
      sectionKeys: [sectionKey],
      sourceIds: list(before.rcapProspectSources).filter((source) => clean(source.accountId) === accountId).map((source) => clean(source.id)),
      engineVersion: clean(body?.engineVersion)
    });
    after.rcapProfileRuns = [...list(before.rcapProfileRuns), run];
    await store.writeChanges(before, after);
    return { status: 200, body: { ok: true, action, runId: run.id, status: run.status } };
  }

  if (!record) return fail(404, "That section is not part of the current profile version.");

  if (action === "approve_section") {
    if (!clean(record.body)) return fail(409, "There is nothing here to approve yet.");
    after.rcapProfileSections = replaceById(sections, Object.freeze({ ...record, state: "approved", approvedBy: actorId, approvedAt: now }));
  } else if (action === "reject_section") {
    const reason = clean(body?.reason);
    if (!reason) return fail(400, "A rejection must say what is wrong with it.");
    after.rcapProfileSections = replaceById(sections, Object.freeze({ ...record, state: "rejected", rejectedBy: actorId, rejectedAt: now, rejectionReason: reason }));
  } else if (action === "edit_section") {
    const text = clean(body?.body);
    if (!text) return fail(400, "An edit must carry the new text.");
    let edited;
    try {
      edited = buildRcapProfileSection({
        ...record,
        body: text,
        state: "human_edited",
        humanEdited: true,
        editedBy: actorId,
        editedAt: now
      }, { claimOwners: new Map(list(before.rcapProspectClaims).map((claim) => [clean(claim.id), clean(claim.accountId)])) });
    } catch (error) {
      return fail(400, clean(error?.message) || "That edit is not a valid section.");
    }
    // The id is content-derived from (account, section, version), so an edit updates the same row
    // rather than forking a second section for the same slot.
    after.rcapProfileSections = replaceById(sections, Object.freeze({ ...edited, id: record.id }));
  } else if (action === "keep_human_edit") {
    if (!view?.conflict) return fail(409, "That section is not in conflict.");
    // Resolving the conflict in favour of the human text means re-stamping the section's source
    // dependencies against the revisions that exist NOW. The words stay; the record stops
    // claiming to have been built against a revision that has moved on.
    const sourcesById = new Map(list(before.rcapProspectSources)
      .filter((source) => clean(source.accountId) === accountId)
      .map((source) => [clean(source.id), source]));
    after.rcapProfileDependencies = list(before.rcapProfileDependencies).map((edge) => {
      if (clean(edge.accountId) !== accountId || lower(edge.sectionKey) !== sectionKey || lower(edge.dependsOnKind) !== "source") return edge;
      return buildRcapProfileDependency({
        ...edge,
        dependsOnRevision: clean(sourcesById.get(clean(edge.dependsOnId))?.revisionId)
      });
    });
    after.rcapProfileSections = replaceById(sections, Object.freeze({ ...record, reviewedAgainstAt: now, reviewedAgainstBy: actorId }));
  } else {
    return fail(400, "Unknown action.");
  }

  await store.writeChanges(before, after);
  return { status: 200, body: { ok: true, action, sectionKey } };
}
