// Prospect Profile workspace (Wave 2, Packet 7).
//
// The research surface for one RCAP account: fifteen sections, the claims each rests on, the
// sources behind those claims, the open questions nobody has answered, and the CRM corrections
// the engine would like a person to decide on.
//
// The organising idea is that a reader must always be able to get from a sentence to its
// evidence in one step. Every claim names its fact class in words and carries its sources, so
// "we verified this", "we inferred this" and "Le-E suggests this" can never be told apart only
// by how confident the prose sounds.
//
// Three absences are treated as first-class content rather than as empty space:
//
//   - a section nothing addressed says so, and says which documents were read;
//   - a document that could not be read says why, and who can fix it (blocker B2);
//   - a section a person edited that has since gone stale is a CONFLICT, not a stale section.
//     Regenerating would discard their words; leaving it alone keeps text whose sources have
//     moved. Neither happens silently, so the workspace shows both options and waits.
//
// Like every other RCAP view model, this reads. It performs no write and holds no authority.

import {
  RCAP_PROFILE_SECTIONS,
  RCAP_PROFILE_SECTION_GROUPS,
  RCAP_PROFILE_STATUSES,
  RCAP_SUCCESSFUL_PROFILE_OUTCOMES,
  RCAP_CAPABILITIES,
  RCAP_FACT_CLASSES
} from "../../rcap-prospect-registries.mjs";
import {
  RCAP_SOURCE_ACCESS_STATES,
  RCAP_SOURCE_KINDS,
  rcapCompareProfileSnapshots,
  rcapSectionsInvalidatedBy
} from "../../rcap-profile-contracts.mjs";
import { RCAP_DRIVE_BLOCKER } from "../../rcap-drive-adapter.mjs";
import { RCAP_PROSPECTS_CANONICAL_ROUTE, RCAP_PROSPECTS_VIEW_KEY } from "../rcap-crm-config.mjs";
import { buildRelationshipDetail } from "../../relationship-service.mjs";
import { roleHasCapability } from "../../roles.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();

export const RCAP_PROFILE_READ_COLLECTIONS = Object.freeze([
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

const SECTION_BY_KEY = new Map(RCAP_PROFILE_SECTIONS.map((section) => [section.key, section]));
const FACT_LABEL = new Map(RCAP_FACT_CLASSES.map((entry) => [entry.key, entry.label]));
const FACT_CLASS_STYLE = new Map([
  ["verified_fact", "is-verified"],
  ["supported_inference", "is-inferred"],
  ["open_question", "is-question"],
  ["recommendation", "is-recommendation"],
  ["pilot_hypothesis", "is-hypothesis"],
  ["human_note", "is-note"]
]);
const SOURCE_KIND_LABEL = new Map(RCAP_SOURCE_KINDS.map((entry) => [entry.key, entry.label]));
const ACCESS_STATE = new Map(RCAP_SOURCE_ACCESS_STATES.map((entry) => [entry.key, entry]));
const PROFILE_STATUS_LABEL = new Map(RCAP_PROFILE_STATUSES.map((entry) => [entry.key, entry.label]));

const SECTION_STATE_LABEL = Object.freeze({
  draft: "Draft",
  needs_review: "Needs review",
  approved: "Approved",
  human_edited: "Edited by a person",
  stale: "Needs refresh",
  blocked: "Blocked",
  rejected: "Rejected"
});

// The six controls the workspace offers per section, and who may use each. Nothing here sends,
// schedules, or contacts anybody: the strongest thing on this page changes a research record.
export const RCAP_PROFILE_SECTION_ACTIONS = Object.freeze([
  Object.freeze({ key: "approve_section", label: "Approve", capability: RCAP_CAPABILITIES.approve }),
  Object.freeze({ key: "edit_section", label: "Edit", capability: RCAP_CAPABILITIES.manage }),
  Object.freeze({ key: "reject_section", label: "Reject", capability: RCAP_CAPABILITIES.approve }),
  Object.freeze({ key: "request_research", label: "Research", capability: RCAP_CAPABILITIES.manage }),
  Object.freeze({ key: "regenerate_section", label: "Regenerate", capability: RCAP_CAPABILITIES.manage })
]);

function href(accountId, view = "profile") {
  const base = `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}&account=${encodeURIComponent(accountId)}`;
  return view === "overview" ? base : `${base}&pane=${view}`;
}

function forAccount(rows, accountId) {
  return list(rows).filter((row) => clean(row?.accountId) === accountId);
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

function sourceView(source) {
  const access = ACCESS_STATE.get(lower(source.accessState)) || ACCESS_STATE.get("not_fetched");
  return Object.freeze({
    id: clean(source.id),
    kind: lower(source.kind),
    kindLabel: SOURCE_KIND_LABEL.get(lower(source.kind)) || "Source",
    title: clean(source.title) || clean(source.ref) || "Untitled source",
    ref: clean(source.ref),
    accessState: access.key,
    accessLabel: access.label,
    readable: access.readable === true,
    blocking: access.blocking === true,
    unreadableReason: clean(source.unreadableReason),
    retrievedAt: clean(source.retrievedAt),
    revisionId: clean(source.revisionId)
  });
}

// ---------------------------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------------------------

function claimView(claim, sourcesById) {
  const factClass = lower(claim.factClass);
  return Object.freeze({
    id: clean(claim.id),
    factClass,
    // The WORD, always. Rule 23 is not satisfied by a colour.
    factLabel: FACT_LABEL.get(factClass) || "Claim",
    factStyle: FACT_CLASS_STYLE.get(factClass) || "is-note",
    text: clean(claim.text),
    evidence: clean(claim.evidence),
    // Absent rather than defaulted: an unmeasured confidence is not a number.
    confidence: typeof claim.confidence === "number" ? claim.confidence : null,
    state: lower(claim.state) || "proposed",
    sources: Object.freeze(list(claim.sourceIds)
      .map((id) => sourcesById.get(clean(id)))
      .filter(Boolean)
      .map(sourceView)),
    // A fact class that requires a source but has none is a defect worth surfacing on the page
    // rather than only in a test, because the records may have arrived from an older run.
    citationMissing: ["verified_fact", "supported_inference"].includes(factClass) && list(claim.sourceIds).length === 0
  });
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

function sectionActions(section, { role, conflicted }) {
  const empty = !clean(section.body);
  return Object.freeze(RCAP_PROFILE_SECTION_ACTIONS.filter((action) =>
    // Approve and Reject do not apply to a section with nothing in it. Rendering them disabled on
    // all twelve empty sections put two dozen dead buttons and two dozen copies of the same
    // sentence on one page; the section's own empty reason already explains the state.
    !(empty && ["approve_section", "reject_section"].includes(action.key))
  ).map((action) => {
    const permitted = roleHasCapability(role, action.capability);
    let available = permitted;
    let reason = permitted ? "" : "Your role cannot take this action.";

    if (available && action.key === "approve_section" && lower(section.state) === "approved") {
      available = false;
      reason = "Already approved.";
    }
    // A conflicted section can still be regenerated -- but the control says what it would cost,
    // so nobody discards a person's words by reflex.
    const destructive = available && action.key === "regenerate_section" && conflicted;
    return Object.freeze({
      key: action.key,
      label: action.label,
      available,
      reason,
      destructive,
      confirm: destructive
        ? `Regenerating replaces the text ${clean(section.editedBy) || "a person"} wrote. The edit is not recoverable from this page.`
        : ""
    });
  }));
}

function sectionView(definition, record, context) {
  const body = clean(record?.body);
  const state = lower(record?.state) || (record ? "draft" : "missing");
  const humanEdited = record?.humanEdited === true;
  const staleReason = clean(context.staleByKey.get(definition.key));
  // The conflict: a section a person wrote whose sources have since moved. Regenerating discards
  // the edit; leaving it keeps text built on a source that changed. A person decides.
  const conflicted = humanEdited && Boolean(staleReason);

  const claims = list(context.claimsBySection.get(definition.key)).map((claim) => claimView(claim, context.sourcesById));
  const unknowns = list(context.unknownsBySection.get(definition.key)).map((unknown) => Object.freeze({
    id: clean(unknown.id),
    question: clean(unknown.question),
    whyItMatters: clean(unknown.whyItMatters),
    howToResolve: clean(unknown.howToResolve),
    state: lower(unknown.state) || "open",
    answer: clean(unknown.answer)
  }));

  let displayState = state;
  if (conflicted) displayState = "conflict";
  else if (staleReason && state !== "blocked") displayState = "stale";

  return Object.freeze({
    key: definition.key,
    number: definition.number,
    label: definition.label,
    group: definition.group,
    href: `${href(context.accountId)}&section=${definition.key}`,
    state: displayState,
    stateLabel: displayState === "conflict" ? "Conflict" : (SECTION_STATE_LABEL[displayState] || "Not started"),
    body,
    // A section with no body says which of the two silences it is.
    emptyReason: body ? "" : (clean(record?.emptyReason) || "No document has addressed this section."),
    present: Boolean(body),
    humanEdited,
    editedBy: clean(record?.editedBy),
    editedAt: clean(record?.editedAt),
    staleReason,
    blockedReason: clean(record?.blockedReason),
    conflict: conflicted
      ? Object.freeze({
        editedBy: clean(record?.editedBy) || "a person",
        editedAt: clean(record?.editedAt),
        reason: staleReason,
        choices: Object.freeze([
          Object.freeze({ key: "keep_human_edit", label: "Keep the edit", consequence: "The text stays as written and is marked reviewed against the new sources." }),
          Object.freeze({ key: "regenerate_section", label: "Regenerate", consequence: "The engine rewrites this section. The edit is lost." })
        ])
      })
      : null,
    claims: Object.freeze(claims),
    unknowns: Object.freeze(unknowns),
    claimCount: claims.length,
    sourceCount: new Set(claims.flatMap((claim) => claim.sources.map((source) => source.id))).size,
    actions: sectionActions({ ...record, body, state }, { role: context.role, conflicted })
  });
}

// ---------------------------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------------------------

export function buildRcapProspectProfile(state = {}, actor = {}, accountId = "", now = "", options = {}) {
  if (options.rcapCrmEnabled !== true) {
    return Object.freeze({
      available: false,
      availability: Object.freeze({ state: "feature_off", reason: "The RCAP prospect workspace is not enabled." })
    });
  }

  const detail = buildRelationshipDetail(state, actor, accountId, now, {});
  if (!detail?.available) {
    return Object.freeze({
      available: false,
      availability: detail?.availability || Object.freeze({ state: "not_found_or_unauthorized", reason: "That organization is not available." })
    });
  }

  const id = clean(accountId);
  const role = clean(actor?.role) || "viewer";
  const organizationName = clean(detail.relationship?.organizationName) || clean(detail.relationship?.name) || "This organization";

  const sources = forAccount(state.rcapProspectSources, id);
  const claims = forAccount(state.rcapProspectClaims, id);
  const runs = forAccount(state.rcapProfileRuns, id);
  const versions = forAccount(state.rcapProfileVersions, id);
  const sectionRecords = forAccount(state.rcapProfileSections, id);
  const unknowns = forAccount(state.rcapProfileUnknowns, id);
  const corrections = forAccount(state.rcapProfileCorrections, id);
  const dependencies = forAccount(state.rcapProfileDependencies, id);
  const snapshots = forAccount(state.rcapProfileSnapshots, id);

  // The current version is the highest-numbered one. Versions are never renumbered, so this is
  // stable across reads.
  const ordered = [...versions].sort((a, b) => (Number(b.versionNumber) || 0) - (Number(a.versionNumber) || 0));
  const current = ordered[0] || null;
  const previous = ordered[1] || null;

  const latestRun = [...runs].sort((a, b) => clean(b.finishedAt || b.startedAt).localeCompare(clean(a.finishedAt || a.startedAt)))[0] || null;

  const sourcesById = new Map(sources.map((source) => [clean(source.id), source]));
  const currentSections = current ? sectionRecords.filter((section) => clean(section.versionId) === clean(current.id)) : [];
  const sectionByKey = new Map(currentSections.map((section) => [lower(section.sectionKey), section]));

  // Targeted invalidation, computed rather than stored: a section is stale when a source it
  // actually cited has changed since the version was built.
  // Staleness is decided per dependency edge, not per source: two sections can cite the same
  // document at different revisions, and the one written after the change is not stale. Both
  // sides must be known -- an unknown revision on either side means unknown, not changed.
  const sourceRevisions = new Map(sources.map((source) => [clean(source.id), clean(source.revisionId)]));
  const staleByKey = new Map(rcapSectionsInvalidatedBy({ sourceRevisions }, dependencies)
    .map((entry) => [entry.sectionKey, entry.reason]));

  const claimsBySection = new Map();
  for (const claim of claims) {
    const key = lower(claim.sectionKey);
    if (!SECTION_BY_KEY.has(key)) continue;
    if (!claimsBySection.has(key)) claimsBySection.set(key, []);
    claimsBySection.get(key).push(claim);
  }
  const unknownsBySection = new Map();
  for (const unknown of unknowns) {
    const key = lower(unknown.sectionKey);
    if (!SECTION_BY_KEY.has(key)) continue;
    if (!unknownsBySection.has(key)) unknownsBySection.set(key, []);
    unknownsBySection.get(key).push(unknown);
  }

  const context = { accountId: id, role, sourcesById, claimsBySection, unknownsBySection, staleByKey };
  const sectionViews = RCAP_PROFILE_SECTIONS.map((definition) => sectionView(definition, sectionByKey.get(definition.key) || null, context));
  const byKey = new Map(sectionViews.map((section) => [section.key, section]));

  const keyByNumber = new Map(RCAP_PROFILE_SECTIONS.map((section) => [section.number, section.key]));
  const groups = RCAP_PROFILE_SECTION_GROUPS.map((group) => Object.freeze({
    key: group.key,
    label: group.label,
    sections: Object.freeze(group.sections.map((number) => byKey.get(keyByNumber.get(number))).filter(Boolean))
  }));

  const readable = sources.filter((source) => lower(source.accessState) === "available");
  const blocked = sources.filter((source) => ACCESS_STATE.get(lower(source.accessState))?.blocking);
  const scopeBlocked = sources.some((source) => lower(source.accessState) === "not_authorized");

  const presentCount = sectionViews.filter((section) => section.present).length;
  const status = current ? lower(current.status) : (latestRun ? lower(latestRun.status) : "not_started");
  const statusKey = status === "succeeded" ? "needs_review" : status === "running" ? "researching" : status;

  const comparison = current && previous
    ? (() => {
      const before = snapshots.find((snapshot) => clean(snapshot.versionId) === clean(previous.id));
      const after = snapshots.find((snapshot) => clean(snapshot.versionId) === clean(current.id));
      if (!before || !after) return null;
      const diff = rcapCompareProfileSnapshots(before, after);
      return Object.freeze({
        available: true,
        fromVersion: Number(previous.versionNumber) || 0,
        toVersion: Number(current.versionNumber) || 0,
        identical: diff.identical,
        changedCount: diff.changedCount,
        sections: diff.sections
      });
    })()
    : null;

  return Object.freeze({
    available: true,
    availability: Object.freeze({ state: "ready", reason: null }),
    account: Object.freeze({ id, name: organizationName, overviewHref: href(id, "overview"), profileHref: href(id) }),

    status: Object.freeze({
      key: statusKey,
      label: PROFILE_STATUS_LABEL.get(statusKey) || "Not started",
      // Rule 24: a disqualification is a successful research outcome, so it must not be rendered
      // in the same register as a failure.
      successful: RCAP_SUCCESSFUL_PROFILE_OUTCOMES.includes(statusKey),
      disqualificationReason: clean(current?.disqualificationReason)
    }),

    version: current
      ? Object.freeze({
        id: clean(current.id),
        number: Number(current.versionNumber) || 1,
        status: lower(current.status),
        createdAt: clean(current.createdAt),
        contentHash: clean(current.contentHash),
        approvedBy: clean(current.approvedBy),
        approvedAt: clean(current.approvedAt)
      })
      : null,
    versionCount: ordered.length,
    comparison,

    // The run's own state, so "failed" and "blocked" are visible as themselves rather than as an
    // absence of profile.
    run: latestRun
      ? Object.freeze({
        id: clean(latestRun.id),
        status: lower(latestRun.status),
        reason: clean(latestRun.reason),
        blockerKey: clean(latestRun.blockerKey),
        attempt: Number(latestRun.attempt) || 1,
        finishedAt: clean(latestRun.finishedAt),
        trigger: lower(latestRun.trigger)
      })
      : null,

    groups: Object.freeze(groups),
    sections: Object.freeze(sectionViews),
    completeness: Object.freeze({ present: presentCount, total: RCAP_PROFILE_SECTIONS.length, complete: presentCount === RCAP_PROFILE_SECTIONS.length }),

    sourcePanel: Object.freeze({
      total: sources.length,
      readable: readable.length,
      blocked: blocked.length,
      sources: Object.freeze(sources.map(sourceView)),
      // The one blocker a reader can act on today. Present only when it is genuinely the cause.
      blocker: scopeBlocked ? RCAP_DRIVE_BLOCKER : null
    }),

    corrections: Object.freeze(corrections.map((correction) => {
      const raw = detail.relationship?.[correction.field];
      const liveValue = typeof raw === "string" || typeof raw === "number" ? clean(raw) : "";
      // The correction was written against a value that has since changed. Accepting it now would
      // overwrite something newer than the research, so it is shown as a conflict, not a choice.
      const conflicted = Boolean(liveValue) && liveValue !== clean(correction.currentValue) && lower(correction.state) === "proposed";
      return Object.freeze({
        id: clean(correction.id),
        field: clean(correction.field),
        currentValue: clean(correction.currentValue),
        proposedValue: clean(correction.proposedValue),
        rationale: clean(correction.rationale),
        state: conflicted ? "conflict" : lower(correction.state),
        conflictValue: conflicted ? liveValue : "",
        decidable: !conflicted && lower(correction.state) === "proposed" && roleHasCapability(role, RCAP_CAPABILITIES.approve),
        sources: Object.freeze(list(correction.sourceIds).map((sourceId) => sourcesById.get(clean(sourceId))).filter(Boolean).map(sourceView))
      });
    })),

    conflicts: Object.freeze(sectionViews.filter((section) => section.conflict).map((section) => Object.freeze({
      sectionKey: section.key,
      sectionLabel: section.label,
      reason: section.conflict.reason,
      editedBy: section.conflict.editedBy
    }))),

    permissions: Object.freeze({
      canManage: roleHasCapability(role, RCAP_CAPABILITIES.manage),
      canApprove: roleHasCapability(role, RCAP_CAPABILITIES.approve)
    }),

    // The same declaration the Overview carries. Nothing on this page contacts anybody.
    safety: Object.freeze({ externalActions: 0, sendControls: 0 })
  });
}
