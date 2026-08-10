// Prospect Activity workspace (Wave 3, Packet 8).
//
// One ordered stream of everything that has actually happened with an organization: messages,
// notes, tasks, calls, meetings, files and stage changes, merged from the sources that already
// own them. It adds no facts. Where it differs from a generic activity feed is what it refuses
// to smooth over:
//
//   - PREPARED IS NOT SENT. Prepared, approved, scheduled, provider-accepted, sent, delivered and
//     replied are seven different things, and an ambiguous provider outcome is "outcome unknown"
//     rather than an optimistic guess. Rule 15 and rule 21 both live here.
//   - A LINK IS ONLY A LINK IF WE HAVE ONE. A Gmail thread is linked when a thread id was
//     recorded. It is never constructed from a message id, a subject, or a hope, because a link
//     that lands on the wrong thread is worse than no link.
//   - NOTHING IS INVENTED TO FILL THE PAGE. An account with no history says so once, rather than
//     rendering an empty scaffold that looks like a loading state.
//
// Read-only, like every RCAP view model. It performs no write and holds no authority.

import { rcapActivityOutcome, rcapEnrichedOutcome } from "./rcap-prospect-overview.mjs";
import { RCAP_PROSPECTS_CANONICAL_ROUTE, RCAP_PROSPECTS_VIEW_KEY } from "../rcap-crm-config.mjs";
import { RELATIONSHIP_DETAIL_READ_COLLECTIONS, buildRelationshipDetail } from "../../relationship-service.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();

export const RCAP_ACTIVITY_READ_COLLECTIONS = RELATIONSHIP_DETAIL_READ_COLLECTIONS;
export const RCAP_ACTIVITY_PAGE_SIZE = 25;
export const RCAP_ACTIVITY_MAX_PAGE_SIZE = 100;

// The kinds a reader can filter by. Each is a different sort of thing that happened, not a
// different colour of the same thing.
export const RCAP_ACTIVITY_KINDS = Object.freeze([
  Object.freeze({ key: "message", label: "Messages" }),
  Object.freeze({ key: "note", label: "Notes" }),
  Object.freeze({ key: "task", label: "Tasks" }),
  Object.freeze({ key: "call", label: "Calls" }),
  Object.freeze({ key: "meeting", label: "Meetings" }),
  Object.freeze({ key: "file", label: "Files" }),
  Object.freeze({ key: "stage", label: "Stage changes" })
]);

export const RCAP_ACTIVITY_DIRECTIONS = Object.freeze([
  Object.freeze({ key: "outbound", label: "From us" }),
  Object.freeze({ key: "inbound", label: "From them" }),
  Object.freeze({ key: "internal", label: "Internal" })
]);

const KIND_KEYS = new Set(RCAP_ACTIVITY_KINDS.map((entry) => entry.key));
const KIND_LABEL = new Map(RCAP_ACTIVITY_KINDS.map((entry) => [entry.key, entry.label]));
const DIRECTION_KEYS = new Set(RCAP_ACTIVITY_DIRECTIONS.map((entry) => entry.key));
const DIRECTION_LABEL = new Map(RCAP_ACTIVITY_DIRECTIONS.map((entry) => [entry.key, entry.label]));

// A single-item label for each kind, because "1 Messages" is not a sentence.
const KIND_SINGULAR = Object.freeze({
  message: "Message", note: "Note", task: "Task", call: "Call",
  meeting: "Meeting", file: "File", stage: "Stage change"
});

function href(accountId, pane = "activity") {
  const base = `#${RCAP_PROSPECTS_CANONICAL_ROUTE}?view=${RCAP_PROSPECTS_VIEW_KEY}&account=${encodeURIComponent(accountId)}`;
  return pane === "overview" ? base : `${base}&pane=${pane}`;
}

// Maps a timeline entry's own vocabulary onto the seven kinds. An entry whose type we do not
// recognise is kept as a note rather than dropped: losing history is worse than filing it under
// the most conservative kind.
// The relationship projection flattens every source record's own `kind` into the generic type
// "activity", so classifying from the projected entry alone files every message under notes. The
// underlying record still carries the truth, and its id is "collection:itemId".
function underlyingRecord(entry = {}, state = {}) {
  const id = clean(entry.id);
  const separator = id.indexOf(":");
  if (separator <= 0) return null;
  const collection = id.slice(0, separator);
  const itemId = id.slice(separator + 1);
  return list(state[collection]).find((row) => clean(row?.id) === itemId) || null;
}

function kindOf(entry = {}, record = null) {
  const type = lower(record?.kind || record?.type || entry.type || entry.kind);
  if (/mail|message|draft|outreach/.test(type)) return "message";
  if (/call/.test(type)) return "call";
  if (/meeting|event|calendar/.test(type)) return "meeting";
  if (/task/.test(type)) return "task";
  if (/file|document|artifact/.test(type)) return "file";
  if (/stage|status|lifecycle/.test(type)) return "stage";
  return "note";
}

function directionOf(entry = {}, kind = "") {
  const raw = lower(entry.direction);
  if (DIRECTION_KEYS.has(raw)) return raw;
  // A note or a task is something we did on our side of the relationship, not correspondence.
  if (["note", "task", "file", "stage"].includes(kind)) return "internal";
  return "";
}

// A Gmail thread link, and only when a thread id was actually recorded.
export function rcapGmailThreadHref(entry = {}) {
  const threadId = clean(entry.threadId || entry.thread_id || entry.gmailThreadId || entry.rawPayload?.threadId);
  if (!threadId || !/^[A-Za-z0-9_-]{6,}$/.test(threadId)) return "";
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function dateLabel(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------------------------
// Collecting
// ---------------------------------------------------------------------------------------------

function entryFromTimeline(entry, state) {
  const record = underlyingRecord(entry, state);
  const kind = kindOf(entry, record);
  const outcome = kind === "message"
    ? (rcapActivityOutcome(entry).key === "recorded" ? rcapEnrichedOutcome(entry, state) : rcapActivityOutcome(entry))
    : null;
  return {
    id: clean(entry.id),
    kind,
    direction: directionOf({ ...entry, direction: entry.direction || record?.direction }, kind),
    title: clean(entry.label) || clean(entry.title) || KIND_SINGULAR[kind],
    summary: clean(entry.summary),
    occurredAt: clean(entry.occurredAt),
    outcome,
    href: rcapGmailThreadHref({ ...record, ...entry, threadId: entry.threadId || record?.threadId }),
    actor: clean(entry.actor || entry.owner)
  };
}

function entryFromTask(task) {
  const done = ["done", "complete", "completed", "closed"].includes(lower(task.status));
  return {
    id: `task:${clean(task.id)}`,
    kind: /call/.test(lower(task.title)) ? "call" : "task",
    direction: "internal",
    title: clean(task.title) || "Task",
    summary: clean(task.nextAction) && clean(task.nextAction) !== clean(task.title) ? clean(task.nextAction) : "",
    occurredAt: clean(task.completedAt || task.completedAtIso || task.dueAt || task.dueDate || task.createdAt),
    // A task's truth is whether it is done, and an open task is not an event that happened -- it
    // is one that has not. Saying so is the difference between a timeline and a wish list.
    outcome: Object.freeze({ key: done ? "completed" : "open", label: done ? "Completed" : "Still open" }),
    href: "",
    actor: clean(task.owner)
  };
}

function entryFromNote(note) {
  return {
    id: `note:${clean(note.id)}`,
    kind: "note",
    direction: "internal",
    title: clean(note.title) || "Note",
    summary: clean(note.body || note.summary),
    occurredAt: clean(note.createdAt || note.occurredAt),
    outcome: null,
    href: "",
    actor: clean(note.author || note.owner)
  };
}

function entryFromMeeting(meeting) {
  return {
    id: `meeting:${clean(meeting.id)}`,
    kind: "meeting",
    direction: "internal",
    title: clean(meeting.title || meeting.summary) || "Meeting",
    summary: clean(meeting.location),
    occurredAt: clean(meeting.startsAt || meeting.occurredAt || meeting.date),
    outcome: null,
    href: clean(meeting.href),
    actor: clean(meeting.owner)
  };
}

function entryFromFile(file) {
  return {
    id: `file:${clean(file.id)}`,
    kind: "file",
    direction: "internal",
    title: clean(file.title || file.name) || "File",
    summary: clean(file.description),
    occurredAt: clean(file.updatedAt || file.createdAt),
    outcome: null,
    href: clean(file.href),
    actor: clean(file.owner)
  };
}

// ---------------------------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------------------------

export function buildRcapProspectActivity(state = {}, actor = {}, accountId = "", now = "", options = {}) {
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
  const organizationName = clean(detail.relationship?.organizationName) || clean(detail.relationship?.name) || "This organization";

  // The relationship projection carries OPEN tasks only -- reasonably, since it exists to answer
  // "what is outstanding". An authoritative history cannot be built from that alone: a completed
  // task is the strongest evidence that something actually happened, and dropping it would make
  // the timeline quietly flatter than the truth. Completed tasks are read back from the source
  // collection, scoped to this account's OWN contact addresses, so nothing crosses accounts.
  const accountEmails = new Set(list(detail.contacts).map((contact) => lower(contact.email)).filter(Boolean));
  const projectedTaskIds = new Set(list(detail.tasks).map((task) => clean(task.id)));
  const closedTasks = list(state.tasks).filter((task) =>
    !projectedTaskIds.has(clean(task.id))
    && accountEmails.has(lower(task.email))
    && ["done", "complete", "completed", "closed"].includes(lower(task.status)));

  const collected = [
    ...list(detail.timeline).map((entry) => entryFromTimeline(entry, state)),
    ...list(detail.tasks).map(entryFromTask),
    ...closedTasks.map(entryFromTask),
    ...list(detail.notes).map(entryFromNote),
    ...list(detail.meetings).map(entryFromMeeting),
    ...list(detail.files).map(entryFromFile)
  ].filter((entry) => entry.id);

  // One entry per id. The relationship timeline and the task list can both surface the same
  // record; showing it twice would make a single action look like two.
  const byId = new Map();
  for (const entry of collected) if (!byId.has(entry.id)) byId.set(entry.id, entry);

  // Newest first. Entries with no recorded date sort last rather than being dropped or dated
  // with the current time, which would be an invented fact.
  const ordered = [...byId.values()].sort((a, b) => {
    if (!a.occurredAt && !b.occurredAt) return 0;
    if (!a.occurredAt) return 1;
    if (!b.occurredAt) return -1;
    return b.occurredAt.localeCompare(a.occurredAt);
  });

  const query = options.query || {};
  const kindFilter = KIND_KEYS.has(lower(query.kind)) ? lower(query.kind) : "";
  const directionFilter = DIRECTION_KEYS.has(lower(query.direction)) ? lower(query.direction) : "";

  const filtered = ordered.filter((entry) =>
    (!kindFilter || entry.kind === kindFilter) && (!directionFilter || entry.direction === directionFilter));

  const requested = Number(query.limit);
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.trunc(requested), RCAP_ACTIVITY_MAX_PAGE_SIZE)
    : RCAP_ACTIVITY_PAGE_SIZE;
  const offsetRequested = Number(query.offset);
  const offset = Number.isFinite(offsetRequested) && offsetRequested > 0 ? Math.trunc(offsetRequested) : 0;
  const page = filtered.slice(offset, offset + limit);

  // Counts are over EVERYTHING, not over the current page, so a filter chip never reports the
  // size of the view it is sitting in.
  const countsByKind = new Map(RCAP_ACTIVITY_KINDS.map((entry) => [entry.key, 0]));
  for (const entry of ordered) countsByKind.set(entry.kind, (countsByKind.get(entry.kind) || 0) + 1);

  const entries = page.map((entry) => Object.freeze({
    ...entry,
    kindLabel: KIND_SINGULAR[entry.kind] || KIND_LABEL.get(entry.kind) || "Activity",
    directionLabel: entry.direction ? DIRECTION_LABEL.get(entry.direction) : "",
    dateLabel: dateLabel(entry.occurredAt),
    // The distinction the whole file exists for, made explicit for the renderer.
    dateKnown: Boolean(entry.occurredAt),
    outcome: entry.outcome ? Object.freeze({ ...entry.outcome }) : null,
    linked: Boolean(entry.href)
  }));

  return Object.freeze({
    available: true,
    availability: Object.freeze({ state: "ready", reason: null }),
    account: Object.freeze({ id, name: organizationName, overviewHref: href(id, "overview"), profileHref: href(id, "profile"), activityHref: href(id) }),

    entries: Object.freeze(entries),
    filters: Object.freeze({
      kind: kindFilter,
      direction: directionFilter,
      kinds: Object.freeze(RCAP_ACTIVITY_KINDS.map((entry) => Object.freeze({
        ...entry, count: countsByKind.get(entry.key) || 0, href: `${href(id)}&kind=${entry.key}`
      }))),
      directions: Object.freeze(RCAP_ACTIVITY_DIRECTIONS.map((entry) => Object.freeze({
        ...entry, href: `${href(id)}&direction=${entry.key}`
      }))),
      clearHref: href(id)
    }),

    pagination: Object.freeze({
      offset,
      limit,
      total: filtered.length,
      totalUnfiltered: ordered.length,
      hasMore: offset + limit < filtered.length,
      nextHref: offset + limit < filtered.length
        ? `${href(id)}${kindFilter ? `&kind=${kindFilter}` : ""}${directionFilter ? `&direction=${directionFilter}` : ""}&offset=${offset + limit}`
        : null,
      previousHref: offset > 0
        ? `${href(id)}${kindFilter ? `&kind=${kindFilter}` : ""}${directionFilter ? `&direction=${directionFilter}` : ""}&offset=${Math.max(0, offset - limit)}`
        : null
    }),

    // Three different silences, told apart. An account with no history, a filter that matches
    // nothing, and a page past the end are not the same situation.
    emptyState: entries.length
      ? null
      : Object.freeze({
        state: ordered.length === 0 ? "no_history" : (offset > 0 ? "past_the_end" : "filtered_out"),
        reason: ordered.length === 0
          ? "Nothing has been recorded for this organization yet."
          : (offset > 0
            ? "There is nothing further back than this."
            : "No recorded activity matches this filter.")
      }),

    // Same declaration the other RCAP surfaces carry. This page reads history; it makes none.
    safety: Object.freeze({ mutations: 0, externalActions: 0, sendControls: 0 })
  });
}
