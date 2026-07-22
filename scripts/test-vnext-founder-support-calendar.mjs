import assert from "node:assert/strict";
import {
  FOUNDER_SUPPORT_ACTIONS,
  FOUNDER_SUPPORT_LANES,
  FounderSupportError,
  buildFounderSupportView,
  executeFounderSupportAction,
  founderSupportSafeError
} from "./founder-support-service.mjs";
import {
  FOUNDER_CALENDAR_ACTIONS,
  FOUNDER_CALENDAR_CATEGORIES,
  FounderCalendarError,
  buildFounderCalendarView,
  buildGoogleCalendarCreateUrl,
  executeFounderCalendarAction,
  founderCalendarSafeError
} from "./founder-calendar-service.mjs";

const NOW = "2026-07-21T15:00:00.000Z";
const OWNER = { authenticated:true, id:"owner-roger", role:"owner", label:"Roger" };
const VIEWER = { authenticated:true, id:"viewer-1", role:"viewer", label:"Viewer" };
const PRIVATE_SENTINEL = "FULL-PRIVATE-PROVIDER-PAYLOAD-MUST-NOT-LEAK";
let passed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function supportIssue(id, overrides = {}) {
  return {
    id,
    title:`Issue ${id}`,
    summary:`Synthetic customer context for ${id}.`,
    status:"open",
    urgency:"normal",
    owner:"Roger",
    rawPayload:{ body:PRIVATE_SENTINEL },
    created_at:"2026-07-19T14:00:00.000Z",
    updated_at:"2026-07-21T14:00:00.000Z",
    history:[],
    ...overrides
  };
}

const SUPPORT_STATE = {
  partners:[{ id:"partner-customer", organizationName:"Example Customer Co", primaryContactName:"Jamie Customer" }],
  companyContacts:[],
  companyOrganizations:[],
  outreachContacts:[],
  reactivationContacts:[],
  prospectCandidates:[],
  supportIssues:[
    supportIssue("support-new", { partnerId:"partner-customer" }),
    supportIssue("support-waiting-legal", { status:"drafted" }),
    supportIssue("support-waiting-customer", { status:"waiting", waitingOn:"Customer" }),
    supportIssue("support-escalated", { escalated:true, escalatedAt:"2026-07-21T12:00:00.000Z" }),
    supportIssue("support-urgent", { urgency:"urgent" }),
    supportIssue("support-resolved", { status:"resolved", resolved_at:"2026-07-20T12:00:00.000Z" })
  ],
  inboxSignals:[{
    id:"signal-customer",
    kind:"customer_issue",
    category:"customer",
    status:"suggested",
    title:"Customer conversation",
    summary:"A synthetic customer conversation needs review.",
    counterpartName:"Taylor Customer",
    bodyText:PRIVATE_SENTINEL,
    evidence:[PRIVATE_SENTINEL],
    ownerOnly:true,
    createdAt:"2026-07-20T14:00:00.000Z",
    updatedAt:"2026-07-21T14:00:00.000Z"
  }],
  tasks:[],
  auditHistory:[],
  activityEvents:[]
};

function meetingBrief(id, overrides = {}) {
  return {
    id:`brief-${id}`,
    event_id:id,
    title:`Meeting ${id}`,
    start_at:"2026-07-21T16:00:00.000Z",
    end_at:"2026-07-21T17:00:00.000Z",
    location:"Video call",
    attendees:[{ email:"roger@example.com", self:true }, { email:"guest@example.com", name:"Synthetic Guest", self:false }],
    known_attendees:[],
    talking_points:["Review the known relationship before the meeting."],
    email_context:[{ snippet:PRIVATE_SENTINEL }],
    status:"prepared",
    updated_at:"2026-07-21T14:00:00.000Z",
    ...overrides
  };
}

const CALENDAR_STATE = {
  partners:[{ id:"partner-goodwill", organizationName:"Goodwill Delta", owner:"Roger" }],
  companyContacts:[],
  contacts:[],
  meetingBriefs:[
    meetingBrief("partner-event", {
      title:"Partner pilot kickoff",
      known_attendees:[{ contactId:"contact-jane", organization:"Goodwill Delta", relationship:"company memory contact" }]
    })
  ],
  calendarSignals:[
    {
      id:"calendar-partner-copy",
      eventId:"partner-event",
      title:"Partner pilot kickoff",
      startTime:"2026-07-21T16:00:00.000Z",
      endTime:"2026-07-21T17:00:00.000Z",
      htmlLink:"https://calendar.google.com/calendar/event?eid=synthetic-partner",
      rawPayload:{ body:PRIVATE_SENTINEL },
      updatedAt:"2026-07-21T14:05:00.000Z"
    },
    {
      id:"investor-event",
      title:"Investor update with Example Ventures",
      startTime:"2026-07-22T18:00:00.000Z",
      endTime:"2026-07-22T18:30:00.000Z",
      htmlLink:"javascript:alert(1)",
      updatedAt:"2026-07-21T13:00:00.000Z"
    },
    {
      id:"customer-event",
      title:"Customer onboarding call",
      startTime:"2026-07-20T16:00:00.000Z",
      endTime:"2026-07-20T17:00:00.000Z",
      updatedAt:"2026-07-20T18:00:00.000Z"
    }
  ],
  googleCalendarSignals:[{
    id:"internal-event",
    title:"Internal LegalEase team standup",
    startsAt:"2026-07-23T15:00:00.000Z",
    endsAt:"2026-07-23T15:30:00.000Z",
    attendees:[{ email:"roger@example.com", self:true }, { email:"lawrence@example.com", name:"Lawrence", self:false }],
    updatedAt:"2026-07-21T13:00:00.000Z"
  }],
  googleInsights:[{
    id:"google-insight-meeting",
    source:"calendar",
    insightType:"Meeting Prep",
    title:"Calendar meeting prep",
    inferredReason:"An upcoming event could use preparation.",
    eventStart:"2026-07-24T17:00:00.000Z",
    status:"suggested",
    ownerOnly:true,
    rawPayload:{ body:PRIVATE_SENTINEL },
    updatedAt:"2026-07-21T13:00:00.000Z"
  }],
  automationEvents:[{
    id:"other-event",
    source:"calendar",
    eventType:"calendar_event",
    title:"Quarterly planning session",
    startsAt:"2026-07-25T17:00:00.000Z",
    endsAt:"2026-07-25T18:00:00.000Z",
    updatedAt:"2026-07-21T13:00:00.000Z"
  }],
  tasks:[],
  auditHistory:[],
  activityEvents:[]
};

console.log("Founder Support and Calendar service tests");

{
  assert.deepEqual(FOUNDER_SUPPORT_LANES, ["New", "Waiting on LegalEase", "Waiting on customer", "Escalated", "Urgent", "Resolved"]);
  assert.deepEqual(FOUNDER_SUPPORT_ACTIONS, ["open_issue", "draft_response", "create_task", "set_status", "resolve", "escalate", "link_relationship"]);
  const view = buildFounderSupportView(SUPPORT_STATE, OWNER, NOW);
  assert.equal(view.available, true);
  assert.equal(view.counts.total, 7);
  assert.equal(view.counts.byLane.New, 2, "canonical issue plus customer inbox signal");
  for (const lane of FOUNDER_SUPPORT_LANES) assert.ok(view.counts.byLane[lane] >= 1, `${lane} is represented`);
  assert.equal(view.items.find((item) => item.source.id === "support-new").relationship.id, "partner:partner-customer");
  assert.equal(view.items.find((item) => item.source.id === "signal-customer").composerSource.kind, "inbox");
  assert.equal(view.items.every((item) => item.actions.draftResponse && item.safety.responseSendAvailable === false), true);
  assert.equal(view.safety.responseSendAvailable, false);
  assert.equal(JSON.stringify(view).includes(PRIVATE_SENTINEL), false);
  assert.equal(JSON.stringify(view).includes("bodyText"), false);
  assert.equal(JSON.stringify(view).includes("rawPayload"), false);
  ok("Support unifies canonical issues and customer inbox signals into the six founder lanes without private payloads");
}

{
  const filtered = buildFounderSupportView(SUPPORT_STATE, OWNER, NOW, { lane:"Urgent", search:"urgent" });
  assert.equal(filtered.counts.total, 7);
  assert.equal(filtered.counts.visible, 1);
  assert.equal(filtered.items[0].source.id, "support-urgent");
  assert.throws(() => buildFounderSupportView(SUPPORT_STATE, OWNER, NOW, { lane:"Provider queue" }), FounderSupportError);
  const unauthorized = buildFounderSupportView(SUPPORT_STATE, VIEWER, NOW);
  assert.equal(unauthorized.authorized, false);
  assert.deepEqual(unauthorized.items, []);
  ok("Support filtering is stable and authorization fails closed");
}

{
  const item = buildFounderSupportView(SUPPORT_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "support-new");
  const payload = {
    itemId:item.id,
    action:"create_task",
    requestId:"support_create_task_001",
    expectedVersion:item.source.version,
    title:"Resolve the customer issue",
    dueDate:"2026-07-22"
  };
  const result = executeFounderSupportAction(SUPPORT_STATE, OWNER, NOW, payload);
  assert.equal(result.state.tasks.length, 1);
  assert.equal(result.state.tasks[0].sourceType, "support_issue");
  assert.equal(result.state.tasks[0].partnerId, "partner-customer");
  assert.match(result.state.tasks[0].history[0].note, /No response was sent/);
  assert.equal(result.result.responseSent, false);
  assert.equal(result.result.externalActions, 0);
  assert.equal(result.state.activityEvents[0].metadata.responseSent, false);
  assert.equal(executeFounderSupportAction(result.state, OWNER, NOW, payload).alreadyApplied, true);
  ok("Support task creation is scoped, relationship-aware, idempotent, and sendless");
}

{
  const waiting = buildFounderSupportView(SUPPORT_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "support-waiting-customer");
  const resolved = executeFounderSupportAction(SUPPORT_STATE, OWNER, NOW, {
    itemId:waiting.id,
    action:"resolve",
    requestId:"support_resolve_item_01",
    expectedVersion:waiting.source.version,
    note:"Verified the synthetic resolution."
  });
  const issue = resolved.state.supportIssues.find((entry) => entry.id === "support-waiting-customer");
  assert.equal(issue.status, "resolved");
  assert.equal(issue.resolved_at, NOW);
  assert.equal(resolved.result.externalActions, 0);

  const customerSignal = buildFounderSupportView(SUPPORT_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "signal-customer");
  const signalResult = executeFounderSupportAction(SUPPORT_STATE, OWNER, NOW, {
    itemId:customerSignal.id,
    action:"resolve",
    requestId:"support_signal_done_001",
    expectedVersion:customerSignal.source.version
  });
  assert.equal(signalResult.state.inboxSignals[0].status, "done");
  ok("resolve reuses canonical Support transitions and retires customer inbox signals honestly");
}

{
  const item = buildFounderSupportView(SUPPORT_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "support-new");
  const escalated = executeFounderSupportAction(SUPPORT_STATE, OWNER, NOW, {
    itemId:item.id,
    action:"escalate",
    requestId:"support_escalate_0001",
    expectedVersion:item.source.version,
    note:"Owner review needed."
  });
  assert.equal(buildFounderSupportView(escalated.state, OWNER, NOW).items.find((entry) => entry.source.id === "support-new").lane, "Escalated");

  const waiting = executeFounderSupportAction(SUPPORT_STATE, OWNER, NOW, {
    itemId:item.id,
    action:"set_status",
    requestId:"support_wait_customer1",
    expectedVersion:item.source.version,
    status:"waiting_on_customer"
  });
  assert.equal(buildFounderSupportView(waiting.state, OWNER, NOW).items.find((entry) => entry.source.id === "support-new").lane, "Waiting on customer");

  const linked = executeFounderSupportAction(SUPPORT_STATE, OWNER, NOW, {
    itemId:item.id,
    action:"link_relationship",
    requestId:"support_link_relation1",
    expectedVersion:item.source.version,
    relationshipId:"partner:partner-customer"
  });
  assert.equal(linked.state.supportIssues.find((entry) => entry.id === "support-new").relationshipId, "partner:partner-customer");
  ok("Support escalation, waiting status, and relationship linking are scoped internal updates");
}

{
  const item = buildFounderSupportView(SUPPORT_STATE, OWNER, NOW).items.find((entry) => entry.source.id === "support-new");
  assert.throws(() => executeFounderSupportAction(SUPPORT_STATE, VIEWER, NOW, {
    itemId:item.id,
    action:"escalate",
    requestId:"support_denied_action1",
    expectedVersion:item.source.version
  }), (error) => error instanceof FounderSupportError && error.status === 403);
  assert.throws(() => executeFounderSupportAction(SUPPORT_STATE, OWNER, NOW, {
    itemId:item.id,
    action:"resolve",
    requestId:"support_stale_action01",
    expectedVersion:"2026-07-20T00:00:00.000Z"
  }), (error) => error instanceof FounderSupportError && error.status === 409);
  assert.deepEqual(founderSupportSafeError(new FounderSupportError("Issue changed; refresh and try again.", 409, "stale")), {
    status:409,
    body:{ ok:false, outcome:"stale", message:"Issue changed; refresh and try again." }
  });
  ok("Support rejects unauthorized and stale writes with safe errors");
}

{
  assert.deepEqual(FOUNDER_CALENDAR_CATEGORIES, ["Partner meeting", "Investor meeting", "Customer call", "Internal meeting", "Other"]);
  assert.deepEqual(FOUNDER_CALENDAR_ACTIONS, ["create_preparation_task", "create_follow_up_task", "open_google_event", "create_google_event"]);
  const view = buildFounderCalendarView(CALENDAR_STATE, OWNER, NOW, { timeZone:"America/Chicago" });
  assert.equal(view.available, true);
  assert.equal(view.counts.total, 6, "duplicate Partner brief and Calendar signal collapse to one event");
  assert.equal(view.counts.today, 1);
  assert.equal(view.counts.thisWeek, 5);
  assert.equal(view.counts.upcomingPartnerMeetings, 1);
  assert.equal(view.counts.investorMeetings, 1);
  assert.equal(view.counts.customerCalls, 1);
  assert.equal(view.counts.internalMeetings, 1);
  const partner = view.items.find((event) => event.category === "Partner meeting");
  assert.equal(partner.relationship.id, "partner:partner-goodwill");
  assert.equal(partner.openGoogleHref, "https://calendar.google.com/calendar/event?eid=synthetic-partner");
  const investor = view.items.find((event) => event.category === "Investor meeting");
  assert.equal(investor.openGoogleHref, "https://calendar.google.com/calendar/u/0/r", "unsafe links fall back to the read-only Calendar home");
  assert.equal(view.items.every((event) => event.safety.calendarWrites === false && event.actions.openGoogleEvent), true);
  assert.equal(view.createEvent.writesFromCommandCenter, false);
  assert.equal(JSON.stringify(view).includes(PRIVATE_SENTINEL), false);
  assert.equal(JSON.stringify(view).includes("guest@example.com"), false);
  assert.equal(JSON.stringify(view).includes("rawPayload"), false);
  ok("Calendar deduplicates read-only records into Today, week, and meeting-type sections without leaking raw context");
}

{
  const view = buildFounderCalendarView(CALENDAR_STATE, OWNER, NOW, { range:"today", timeZone:"America/Chicago" });
  assert.equal(view.counts.total, 6);
  assert.equal(view.counts.visible, 1);
  assert.equal(view.items[0].category, "Partner meeting");
  const investor = buildFounderCalendarView(CALENDAR_STATE, OWNER, NOW, { category:"Investor meeting", search:"ventures" });
  assert.equal(investor.counts.visible, 1);
  assert.throws(() => buildFounderCalendarView(CALENDAR_STATE, OWNER, NOW, { range:"provider_payload" }), FounderCalendarError);
  assert.equal(buildFounderCalendarView(CALENDAR_STATE, VIEWER, NOW).authorized, false);
  ok("Calendar ranges, meeting filters, and authorization are deterministic");
}

{
  const href = buildGoogleCalendarCreateUrl({
    title:"Synthetic Partner Meeting",
    start:"2026-07-29T15:00:00.000Z",
    end:"2026-07-29T15:30:00.000Z",
    details:"Review the pilot decision.",
    location:"Video call"
  });
  const url = new URL(href);
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.pathname, "/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), "Synthetic Partner Meeting");
  assert.equal(url.searchParams.get("dates"), "20260729T150000Z/20260729T153000Z");
  assert.equal(url.searchParams.get("details"), "Review the pilot decision.");
  const allDay = new URL(buildGoogleCalendarCreateUrl({ title:"Planning day", start:"2026-07-30" }));
  assert.equal(allDay.searchParams.get("dates"), "20260730/20260731");
  assert.throws(() => buildGoogleCalendarCreateUrl({ title:"Bad event", start:"not-a-date" }), FounderCalendarError);
  ok("prefilled event creation produces an encoded Google template URL without a Calendar write");
}

{
  const beforeCalendar = JSON.stringify({
    meetingBriefs:CALENDAR_STATE.meetingBriefs,
    calendarSignals:CALENDAR_STATE.calendarSignals,
    googleCalendarSignals:CALENDAR_STATE.googleCalendarSignals,
    googleInsights:CALENDAR_STATE.googleInsights,
    automationEvents:CALENDAR_STATE.automationEvents
  });
  const event = buildFounderCalendarView(CALENDAR_STATE, OWNER, NOW).items.find((entry) => entry.category === "Partner meeting");
  const payload = {
    eventId:event.id,
    action:"create_preparation_task",
    requestId:"calendar_prep_task_001",
    expectedVersion:event.source.version,
    title:"Prepare the pilot decision",
    dueDate:"2026-07-21"
  };
  const result = executeFounderCalendarAction(CALENDAR_STATE, OWNER, NOW, payload);
  assert.equal(result.state.tasks.length, 1);
  assert.equal(result.state.tasks[0].sourceType, "google_calendar");
  assert.equal(result.state.tasks[0].partnerId, "partner-goodwill");
  assert.match(result.state.tasks[0].history[0].note, /No event or invitation was changed/);
  assert.equal(result.result.calendarChanged, false);
  assert.equal(result.result.invitationSent, false);
  assert.equal(result.result.externalActions, 0);
  assert.equal(result.state.auditHistory[0].calendarChanged, false);
  assert.equal(JSON.stringify({
    meetingBriefs:result.state.meetingBriefs,
    calendarSignals:result.state.calendarSignals,
    googleCalendarSignals:result.state.googleCalendarSignals,
    googleInsights:result.state.googleInsights,
    automationEvents:result.state.automationEvents
  }), beforeCalendar);
  assert.equal(executeFounderCalendarAction(result.state, OWNER, NOW, payload).alreadyApplied, true);
  ok("meeting preparation creates only an internal task and leaves every Calendar source unchanged");
}

{
  const event = buildFounderCalendarView(CALENDAR_STATE, OWNER, NOW).items.find((entry) => entry.category === "Customer call");
  const result = executeFounderCalendarAction(CALENDAR_STATE, OWNER, NOW, {
    eventId:event.id,
    action:"create_follow_up_task",
    requestId:"calendar_followup_0001",
    expectedVersion:event.source.version,
    note:"Capture the customer decision."
  });
  assert.equal(result.state.tasks[0].title, "Follow up after: Customer onboarding call");
  assert.equal(result.state.tasks[0].due_date, "2026-07-21", "past meeting follow-up is due today");
  assert.equal(result.state.tasks[0].priority, "high");
  assert.equal(result.result.calendarChanged, false);
  ok("post-meeting follow-up creates a due-today customer task without changing Google Calendar");
}

{
  const event = buildFounderCalendarView(CALENDAR_STATE, OWNER, NOW).items[0];
  assert.throws(() => executeFounderCalendarAction(CALENDAR_STATE, VIEWER, NOW, {
    eventId:event.id,
    action:"create_preparation_task",
    requestId:"calendar_denied_task01",
    expectedVersion:event.source.version
  }), (error) => error instanceof FounderCalendarError && error.status === 403);
  assert.throws(() => executeFounderCalendarAction(CALENDAR_STATE, OWNER, NOW, {
    eventId:event.id,
    action:"create_preparation_task",
    requestId:"calendar_stale_task001",
    expectedVersion:"2026-07-20T00:00:00.000Z"
  }), (error) => error instanceof FounderCalendarError && error.status === 409);
  assert.deepEqual(founderCalendarSafeError(new FounderCalendarError("Event changed; refresh and try again.", 409, "stale")), {
    status:409,
    body:{ ok:false, outcome:"stale", message:"Event changed; refresh and try again." }
  });
  ok("Calendar rejects unauthorized and stale task creation with safe errors");
}

console.log(`PASS test-vnext-founder-support-calendar (${passed} checks)`);
