#!/usr/bin/env node
// Phase 18H guard: meeting briefs read the owner's own calendar (live, read-only), match
// attendees against company memory without fabricating relationships, and pull Gmail as short
// per-attendee snippets ON DEMAND only. The heartbeat engine is structurally calendar-only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coreStateCollections } from "./storage.mjs";
import {
  MEETING_BRIEFS_ENGINE_ID,
  MEETING_BRIEFS_COLLECTIONS,
  MEETING_BRIEFS_CAP,
  EMAIL_SNIPPET_MAX_CHARS,
  MAX_SNIPPETS_PER_ATTENDEE,
  MAX_ATTENDEES_ENRICHED,
  normalizeBriefEvent,
  matchAttendeeToMemory,
  buildTalkingPoints,
  buildMeetingBrief,
  normalizeEmailSnippet,
  attachEmailContext,
  reconcileMeetingBriefs,
  buildMeetingBriefsView,
  planMeetingBriefs,
  actMeetingBriefs,
  buildMeetingBriefsEngine
} from "./meeting-briefs.mjs";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const NOW = new Date("2026-07-07T16:00:00Z");

const RAW_EVENT = {
  id: "evt-1",
  status: "confirmed",
  summary: "Pilot kickoff with County Legal Aid",
  location: "Zoom",
  start: { dateTime: "2026-07-08T15:00:00Z" },
  end: { dateTime: "2026-07-08T16:00:00Z" },
  organizer: { email: "roger@legalease.com" },
  attendees: [
    { email: "roger@legalease.com", self: true, responseStatus: "accepted" },
    { email: "Jane@CountyLegalAid.org", displayName: "Jane Alvarez", responseStatus: "accepted" },
    { email: "declined@example.com", responseStatus: "declined" },
    { email: "room-4@resource.calendar.google.com", resource: true, responseStatus: "accepted" }
  ]
};

const MEMORY_STATE = {
  contacts: [{ contact_id: "c-jane", email: "jane@countylegalaid.org", name: "Jane Alvarez", organization: "County Legal Aid" }],
  queueItems: [{ id: "q1", status: "needs_roger", title: "Approve pilot terms", relatedContact: "c-jane", riskLevel: "caution" }],
  partnerPrograms: [{ id: "p1", name: "County Legal Aid", status: "stalled" }],
  supportIssues: []
};

await check("meetingBriefs collections are registered in coreStateCollections", () => {
  for (const collection of MEETING_BRIEFS_COLLECTIONS) {
    assert(coreStateCollections.includes(collection), `${collection} must be in coreStateCollections`);
  }
});

await check("normalizeBriefEvent drops cancelled/declined/rooms, keeps people", () => {
  assert.equal(normalizeBriefEvent({ ...RAW_EVENT, status: "cancelled" }), null);
  const event = normalizeBriefEvent(RAW_EVENT);
  assert.equal(event.event_id, "evt-1");
  assert.equal(event.title, "Pilot kickoff with County Legal Aid");
  assert.deepEqual(event.attendees.map((a) => a.email), ["roger@legalease.com", "jane@countylegalaid.org"]);
  assert.equal(event.attendees[0].self, true);
  assert.equal(event.attendees[1].name, "Jane Alvarez");
});

await check("attendee matching never fabricates a relationship", () => {
  const known = matchAttendeeToMemory(MEMORY_STATE, "JANE@countylegalaid.org");
  assert.equal(known.known, true);
  assert.equal(known.contactName, "Jane Alvarez");
  assert.equal(known.relationship, "company memory contact");
  const unknown = matchAttendeeToMemory(MEMORY_STATE, "stranger@example.com");
  assert.equal(unknown.known, false);
  assert.equal(unknown.relationship || "", "");
});

await check("talking points: known contact, waiting decisions, stalled partner, honest default", () => {
  const points = buildTalkingPoints(MEMORY_STATE, [matchAttendeeToMemory(MEMORY_STATE, "jane@countylegalaid.org")]);
  assert(points.some((p) => p.includes("Jane Alvarez is known here")), points.join(" | "));
  assert(points.some((p) => p.includes("1 queue item(s) about Jane Alvarez")), "waiting decisions surface");
  assert(points.some((p) => p.includes("stalled partner program")), "stalled partner surfaces");
  const empty = buildTalkingPoints({}, [matchAttendeeToMemory({}, "stranger@example.com")]);
  assert.deepEqual(empty, ["No history in company memory. Treat this as a first conversation and capture what you learn."]);
  for (const point of [...points, ...empty]) assert(!point.includes("—"), "no em-dashes in brief copy");
});

await check("buildMeetingBrief assembles the persisted record", () => {
  const brief = buildMeetingBrief(MEMORY_STATE, RAW_EVENT, { now: NOW });
  assert.equal(brief.id, "brief-evt-1");
  assert.equal(brief.known_attendees.length, 1);
  assert.deepEqual(brief.email_context, []);
  assert.equal(brief.status, "prepared");
  assert.equal(brief.source, "calendar_live");
});

await check("email snippets are short single lines, never bodies", () => {
  const long = normalizeEmailSnippet({ with: "jane@countylegalaid.org", subject: "Re: pilot", snippet: ("word ".repeat(200)) + "\nsecond\nline", at: "Mon, 6 Jul 2026" });
  assert(long.snippet.length <= EMAIL_SNIPPET_MAX_CHARS);
  assert(!long.snippet.includes("\n"), "snippet collapses to one line");
  assert.equal(normalizeEmailSnippet({}), null);
});

await check("email context caps attendees and snippets per attendee", () => {
  const brief = buildMeetingBrief(MEMORY_STATE, RAW_EVENT, { now: NOW });
  const many = {};
  for (let i = 0; i < 8; i++) {
    many[`person${i}@example.com`] = Array.from({ length: 6 }, (_, j) => ({ subject: `S${i}-${j}`, snippet: "hello", at: "" }));
  }
  const enriched = attachEmailContext(brief, many, { now: NOW });
  assert.equal(enriched.email_context.length, MAX_ATTENDEES_ENRICHED * MAX_SNIPPETS_PER_ATTENDEE);
  assert(enriched.email_context_at);
});

await check("reconcile preserves pulled email context, drops stale, caps", () => {
  const brief = buildMeetingBrief(MEMORY_STATE, RAW_EVENT, { now: NOW });
  const withContext = attachEmailContext(brief, { "jane@countylegalaid.org": [{ subject: "Re: pilot", snippet: "see you Tuesday", at: "" }] }, { now: NOW });
  const stale = { ...brief, id: "brief-old", event_id: "old", start_at: "2026-07-01T00:00:00Z" };
  const refreshed = buildMeetingBrief(MEMORY_STATE, { ...RAW_EVENT, summary: "Pilot kickoff (renamed)" }, { now: NOW });
  const rec = reconcileMeetingBriefs([withContext, stale], [refreshed], { now: NOW });
  assert.equal(rec.created, 0, "same event id is an update, not a new brief");
  assert.equal(rec.briefs.length, 1, "stale past brief dropped");
  assert.equal(rec.briefs[0].title, "Pilot kickoff (renamed)");
  assert.equal(rec.briefs[0].email_context.length, 1, "pulled email context survives a calendar refresh");
  const many = Array.from({ length: 150 }, (_, i) => buildMeetingBrief({}, { ...RAW_EVENT, id: `evt-${i}` }, { now: NOW }));
  assert(reconcileMeetingBriefs([], many, { now: NOW }).briefs.length <= MEETING_BRIEFS_CAP);
});

await check("module never talks to the network directly", () => {
  const source = readFileSync(join(process.cwd(), "scripts", "meeting-briefs.mjs"), "utf8");
  assert(!/\bfetch\s*\(/.test(source), "no direct fetch in the module");
  assert(!source.includes("googleapis.com"), "no Google URLs in the module");
});

await check("plan observes without writing; act is calendar-only and honest", async () => {
  const state = { meetingBriefs: [] };
  const frozen = JSON.stringify(state);
  const plan = planMeetingBriefs(state, { now: NOW });
  assert.equal(JSON.stringify(state), frozen);
  assert.equal(plan.observations.calendarFetcher, "not_wired");

  const noDep = await actMeetingBriefs(state, { now: NOW });
  assert.equal(noDep.results.status, "not_wired");
  assert.equal(noDep.state, state, "no write without a fetcher");

  const notConnected = await actMeetingBriefs(state, { now: NOW, fetchCalendarEventsForBriefs: async () => null });
  assert.equal(notConnected.results.status, "not_connected");

  const failed = await actMeetingBriefs(state, { now: NOW, fetchCalendarEventsForBriefs: async () => { throw new Error("boom"); } });
  assert.equal(failed.results.status, "error");
  assert.equal(failed.state, state);

  const live = await actMeetingBriefs(MEMORY_STATE, { now: NOW, fetchCalendarEventsForBriefs: async () => [RAW_EVENT] });
  assert.equal(live.results.status, "prepared");
  assert.equal(live.results.created, 1);
  assert.equal(live.state.meetingBriefs.length, 1);
  assert(live.state.companyEvents.some((e) => e.type === "meeting_briefs_prepared"));
  const again = await actMeetingBriefs(live.state, { now: NOW, fetchCalendarEventsForBriefs: async () => [RAW_EVENT] });
  assert.equal(again.results.created, 0, "second run same event creates nothing new");
});

await check("engine descriptor and view", () => {
  const engine = buildMeetingBriefsEngine({ fetchCalendarEventsForBriefs: async () => [] });
  assert.equal(engine.id, MEETING_BRIEFS_ENGINE_ID);
  assert.equal(engine.cadence, "daily");
  const view = buildMeetingBriefsView({ meetingBriefs: [buildMeetingBrief(MEMORY_STATE, RAW_EVENT, { now: NOW })] }, { now: NOW });
  assert.equal(view.counts.total, 1);
  assert.equal(view.counts.withKnownAttendees, 1);
  assert.equal(view.counts.withEmailContext, 0);
});

await check("server wiring: engine registered calendar-only, on-demand Gmail routes present", async () => {
  const { HEARTBEAT_ENGINE_IDS } = await import("./heartbeat-engines.mjs");
  assert(HEARTBEAT_ENGINE_IDS.includes(MEETING_BRIEFS_ENGINE_ID));
  const registry = readFileSync(join(process.cwd(), "scripts", "heartbeat-engines.mjs"), "utf8");
  const registration = registry.slice(registry.indexOf("buildMeetingBriefsEngine({"), registry.indexOf("buildMeetingBriefsEngine({") + 120);
  assert(registration.includes("fetchCalendarEventsForBriefs"), "engine gets the calendar fetcher");
  assert(!/gmail/i.test(registration), "engine must NOT get a Gmail dependency; email context is on-demand only");
  const server = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
  for (const marker of ['"/api/meeting-briefs"', '"/api/meeting-briefs/prepare"', '"/api/meeting-briefs/email-context"', "fetchGmailSnippetsForAttendee", "fetchCalendarEventsForBriefs", 'searchParams.set("format", "metadata")']) {
    assert(server.includes(marker), `preview-server should contain ${marker}`);
  }
  const gmailFetch = server.slice(server.indexOf("async function fetchGmailSnippetsForAttendee"), server.indexOf("async function fetchGmailSnippetsForAttendee") + 1800);
  assert(gmailFetch.includes('"maxResults", "3"'), "Gmail snippet fetch stays capped at 3 threads per attendee");
  assert(!gmailFetch.includes('"full"'), "Gmail fetch must never request full message bodies");
});

console.log(`meeting briefs tests passed (${passed} checks).`);
