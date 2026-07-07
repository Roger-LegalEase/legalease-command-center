// Phase 18H meeting briefs (Google live-fetch decision, approved by Roger 2026-07-07):
//   - Calendar: live read-only fetch on demand AND on the daily heartbeat (autopilot OFF by
//     default). Low sensitivity: it is Roger's own schedule.
//   - Gmail: per-attendee thread SNIPPETS only, fetched ON DEMAND when Roger asks for email
//     context on one brief. Never full bodies, never in the background — the heartbeat engine
//     is structurally given only the calendar fetcher, no Gmail dependency.
//   - No automatic Gmail feed into the support desk.
//
// This module is pure: it has no network path. The server injects already-fetched calendar
// events and email snippets; this module normalizes, matches attendees against company
// memory, derives plain-English talking points, and persists brief records.

import { emitCompanyEvent } from "./company-memory.mjs";

export const MEETING_BRIEFS_ENGINE_ID = "meeting-briefs";
export const MEETING_BRIEFS_COLLECTIONS = ["meetingBriefs"];
export const MEETING_BRIEFS_CAP = 100;
export const EMAIL_SNIPPET_MAX_CHARS = 240;
export const MAX_SNIPPETS_PER_ATTENDEE = 3;
export const MAX_ATTENDEES_ENRICHED = 5;
export const BRIEF_LOOKAHEAD_DAYS = 7;

function list(value) {
  return Array.isArray(value) ? value : [];
}
function clean(value) {
  return String(value ?? "").trim();
}
function lower(value) {
  return clean(value).toLowerCase();
}
function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}
function oneLine(value = "", max = 300) {
  return clean(String(value).replace(/\s+/g, " ")).slice(0, max);
}

// Google Calendar v3 event -> the minimal shape a brief needs. Declined events and rooms are
// dropped; cancelled events return null.
export function normalizeBriefEvent(raw = {}) {
  if (!raw || raw.status === "cancelled") return null;
  const eventId = clean(raw.id || raw.iCalUID);
  if (!eventId) return null;
  const attendees = list(raw.attendees)
    .filter((attendee) => attendee && clean(attendee.email) && attendee.resource !== true && attendee.responseStatus !== "declined")
    .map((attendee) => ({
      email: lower(attendee.email),
      name: oneLine(attendee.displayName || "", 80),
      response: clean(attendee.responseStatus) || "needsAction",
      self: attendee.self === true
    }));
  return {
    event_id: eventId,
    title: oneLine(raw.summary || "Untitled meeting", 140),
    start_at: clean(raw.start?.dateTime || raw.start?.date),
    end_at: clean(raw.end?.dateTime || raw.end?.date),
    location: oneLine(raw.location || "", 140),
    organizer_email: lower(raw.organizer?.email || ""),
    attendees
  };
}

// Match one attendee email against company memory. Returns only what is already known
// internally; never fabricates a relationship.
export function matchAttendeeToMemory(state = {}, email = "") {
  const at = lower(email);
  if (!at) return { email: at, known: false };
  const contact = list(state.contacts).find((item) => lower(item.email) === at) || null;
  const outreach = list(state.outreachContacts).find((item) => lower(item.email) === at) || null;
  const reactivation = list(state.reactivationContacts).find((item) => lower(item.email) === at) || null;
  const supportIssue = list(state.supportIssues).find((item) => lower(item.contact_email) === at && !["resolved", "closed"].includes(item.status)) || null;
  const known = Boolean(contact || outreach || reactivation || supportIssue);
  return {
    email: at,
    known,
    contactId: contact ? clean(contact.contact_id) : "",
    contactName: oneLine(contact?.name || outreach?.name || reactivation?.name || "", 80),
    organization: oneLine(contact?.organization || outreach?.organization_name || "", 100),
    relationship: contact ? "company memory contact" : outreach ? "outreach contact" : reactivation ? "reactivation contact" : supportIssue ? "support requester" : "",
    openSupportTitle: supportIssue ? oneLine(supportIssue.title, 100) : ""
  };
}

function partnerLineFor(state = {}, matches = []) {
  const names = new Set(matches.map((match) => lower(match.organization)).filter(Boolean));
  if (!names.size) return "";
  const program = list(state.partnerPrograms).find((item) => names.has(lower(item.name)));
  if (!program) return "";
  if (program.status === "stalled") return `${program.name} is a stalled partner program. Ask what unblocks it.`;
  return `${program.name} is an active partner program (${clean(program.status) || "in progress"}).`;
}

export function buildTalkingPoints(state = {}, matches = []) {
  const points = [];
  for (const match of matches) {
    if (!match.known) continue;
    const who = match.contactName || match.email;
    points.push(`${who} is known here as a ${match.relationship}${match.organization ? ` at ${match.organization}` : ""}.`);
    if (match.openSupportTitle) points.push(`${who} has an open support request: ${match.openSupportTitle}. Read it before the meeting.`);
    if (match.contactId) {
      const waiting = list(state.queueItems).filter((item) => item.status === "needs_roger" && clean(item.relatedContact) === match.contactId);
      if (waiting.length) points.push(`${waiting.length} queue item(s) about ${who} are waiting on your decision.`);
    }
  }
  const partnerLine = partnerLineFor(state, matches);
  if (partnerLine) points.push(partnerLine);
  if (!points.length) points.push("No history in company memory. Treat this as a first conversation and capture what you learn.");
  return points.slice(0, 8);
}

export function buildMeetingBrief(state = {}, event = {}, { now = new Date() } = {}) {
  const normalized = normalizeBriefEvent(event);
  if (!normalized) return null;
  const externalAttendees = list(normalized.attendees).filter((attendee) => !attendee.self);
  const matches = externalAttendees.map((attendee) => matchAttendeeToMemory(state, attendee.email));
  const at = nowIso(now);
  return {
    id: `brief-${normalized.event_id}`,
    event_id: normalized.event_id,
    title: normalized.title,
    start_at: normalized.start_at,
    end_at: normalized.end_at,
    location: normalized.location,
    organizer_email: normalized.organizer_email,
    attendees: normalized.attendees,
    known_attendees: matches.filter((match) => match.known),
    talking_points: buildTalkingPoints(state, matches),
    email_context: [],
    email_context_at: "",
    status: "prepared",
    source: "calendar_live",
    generated_at: at,
    updated_at: at
  };
}

// One Gmail thread snippet, forced down to a single short line. Never a body.
export function normalizeEmailSnippet(raw = {}) {
  const snippet = oneLine(raw.snippet || "", EMAIL_SNIPPET_MAX_CHARS);
  if (!snippet && !clean(raw.subject)) return null;
  return {
    with: lower(raw.with || raw.email || ""),
    subject: oneLine(raw.subject || "(no subject)", 140),
    snippet,
    at: clean(raw.at || raw.date || "")
  };
}

export function attachEmailContext(brief = {}, snippetsByAttendee = {}, { now = new Date() } = {}) {
  const context = [];
  const attendees = Object.keys(snippetsByAttendee).slice(0, MAX_ATTENDEES_ENRICHED);
  for (const email of attendees) {
    for (const raw of list(snippetsByAttendee[email]).slice(0, MAX_SNIPPETS_PER_ATTENDEE)) {
      const snippet = normalizeEmailSnippet({ ...raw, with: email });
      if (snippet) context.push(snippet);
    }
  }
  return { ...brief, email_context: context, email_context_at: nowIso(now), updated_at: nowIso(now) };
}

// Upsert fresh briefs by event id. Email context already pulled for an event survives a
// calendar refresh; briefs for meetings more than two days past are dropped.
export function reconcileMeetingBriefs(existing = [], fresh = [], { now = new Date() } = {}) {
  const cutoff = new Date(now).getTime() - 2 * 24 * 60 * 60 * 1000;
  const byEvent = new Map(list(existing).map((brief) => [brief.event_id, brief]));
  const next = [];
  const seen = new Set();
  let created = 0;
  for (const brief of fresh) {
    if (!brief || seen.has(brief.event_id)) continue;
    seen.add(brief.event_id);
    const prior = byEvent.get(brief.event_id);
    if (prior) {
      next.push({ ...brief, email_context: list(prior.email_context), email_context_at: clean(prior.email_context_at), generated_at: prior.generated_at || brief.generated_at });
    } else {
      created += 1;
      next.push(brief);
    }
  }
  for (const brief of list(existing)) {
    if (seen.has(brief.event_id)) continue;
    const started = Date.parse(brief.start_at || "");
    if (Number.isFinite(started) && started < cutoff) continue;
    next.push(brief);
  }
  next.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  return { briefs: next.slice(0, MEETING_BRIEFS_CAP), created };
}

export function buildMeetingBriefsView(state = {}, { now = new Date() } = {}) {
  const briefs = list(state.meetingBriefs);
  const nowMs = new Date(now).getTime();
  const upcoming = briefs.filter((brief) => {
    const started = Date.parse(brief.start_at || "");
    return !Number.isFinite(started) || started >= nowMs - 60 * 60 * 1000;
  });
  return {
    generated_at: nowIso(now),
    briefs,
    counts: {
      total: briefs.length,
      upcoming: upcoming.length,
      withKnownAttendees: briefs.filter((brief) => list(brief.known_attendees).length).length,
      withEmailContext: briefs.filter((brief) => list(brief.email_context).length).length
    }
  };
}

// ---- Heartbeat engine ----------------------------------------------------------------------
// Calendar only. The Gmail snippet path is deliberately NOT available here: email context is
// pulled on demand from the Meetings page, one brief at a time.

export function planMeetingBriefs(state = {}, ctx = {}) {
  const view = buildMeetingBriefsView(state, { now: ctx.now || new Date() });
  return { observations: { briefs: view.counts.total, upcoming: view.counts.upcoming, calendarFetcher: typeof ctx.fetchCalendarEventsForBriefs === "function" ? "wired" : "not_wired" } };
}

export async function actMeetingBriefs(state = {}, ctx = {}) {
  const now = ctx.now || new Date();
  if (typeof ctx.fetchCalendarEventsForBriefs !== "function") {
    return { state, results: { status: "not_wired", reason: "calendar_fetcher_missing" } };
  }
  let events;
  try {
    events = await ctx.fetchCalendarEventsForBriefs();
  } catch (error) {
    return { state, results: { status: "error", error: String(error?.message || error) } };
  }
  if (!Array.isArray(events)) {
    return { state, results: { status: "not_connected", reason: "calendar_not_connected" } };
  }
  const fresh = events.map((event) => buildMeetingBrief(state, event, { now })).filter(Boolean);
  const rec = reconcileMeetingBriefs(state.meetingBriefs, fresh, { now });
  let next = { ...state, meetingBriefs: rec.briefs };
  if (rec.created > 0) {
    next = emitCompanyEvent(next, {
      source: MEETING_BRIEFS_ENGINE_ID,
      type: "meeting_briefs_prepared",
      risk: "info",
      summary: `${rec.created} new meeting brief(s) prepared from read-only Calendar. No email was read.`
    });
  }
  return { state: next, results: { status: "prepared", created: rec.created, total: rec.briefs.length } };
}

export function buildMeetingBriefsEngine(deps = {}) {
  return {
    id: MEETING_BRIEFS_ENGINE_ID,
    cadence: "daily",
    plan(state, ctx) {
      return planMeetingBriefs(state, { ...ctx, fetchCalendarEventsForBriefs: deps.fetchCalendarEventsForBriefs });
    },
    async act(state, ctx) {
      return actMeetingBriefs(state, { ...ctx, fetchCalendarEventsForBriefs: deps.fetchCalendarEventsForBriefs });
    }
  };
}
