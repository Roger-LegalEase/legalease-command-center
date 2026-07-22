import assert from "node:assert/strict";
import {
  FOUNDER_SUPPORT_ACTION_PATH,
  FOUNDER_SUPPORT_API_ROUTES,
  FOUNDER_SUPPORT_VIEW_PATH,
  handleFounderSupportApiRequest,
  isFounderSupportApiPath
} from "./founder-support-api.mjs";
import {
  FOUNDER_CALENDAR_ACTION_PATH,
  FOUNDER_CALENDAR_API_ROUTES,
  FOUNDER_CALENDAR_CREATE_LINK_PATH,
  FOUNDER_CALENDAR_VIEW_PATH,
  handleFounderCalendarApiRequest,
  isFounderCalendarApiPath
} from "./founder-calendar-api.mjs";

const NOW = "2026-07-21T15:00:00.000Z";
const OWNER = Object.freeze({ authenticated:true, id:"owner-roger", role:"owner", label:"Roger" });
const SIGNED_OUT = Object.freeze({ authenticated:false, id:"", role:"viewer" });
const PRIVATE_SENTINEL = "PRIVATE-PROVIDER-BODY-MUST-NOT-LEAK";
let passed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function supportState() {
  return {
    partners:[{
      id:"partner-customer",
      organizationName:"Example Customer Co",
      primaryContactName:"Jamie Customer",
      visibility:"all"
    }],
    companyContacts:[],
    companyOrganizations:[],
    outreachContacts:[],
    outreachOrganizations:[],
    reactivationContacts:[],
    prospectCandidates:[],
    outreachCampaigns:[],
    outreachAttempts:[],
    outreachReplies:[],
    suppressionList:[],
    campaignRelationships:[],
    meetings:[],
    meetingBriefs:[],
    files:[],
    supportIssues:[{
      id:"support-one",
      title:"Customer needs help with an intake step",
      summary:"A synthetic customer could not finish the next step.",
      status:"open",
      urgency:"normal",
      partnerId:"partner-customer",
      owner:"Roger",
      created_at:"2026-07-20T12:00:00.000Z",
      updated_at:"2026-07-21T14:00:00.000Z",
      rawPayload:{ body:PRIVATE_SENTINEL },
      history:[]
    }],
    inboxSignals:[],
    tasks:[],
    auditHistory:[],
    activityEvents:[]
  };
}

function calendarState() {
  return {
    partners:[{ id:"partner-one", organizationName:"Example Partner", visibility:"all" }],
    companyContacts:[],
    contacts:[],
    meetingBriefs:[],
    calendarSignals:[{
      id:"event-one",
      eventId:"event-one",
      title:"Partner planning meeting",
      safeSummary:"Review the shared pilot decision.",
      startTime:"2026-07-22T16:00:00.000Z",
      endTime:"2026-07-22T16:30:00.000Z",
      organization:"Example Partner",
      htmlLink:"https://calendar.google.com/calendar/event?eid=synthetic",
      attendees:[{ self:true, name:"Roger" }, { self:false, name:"Jamie Partner", email:"jamie@example.com" }],
      updatedAt:"2026-07-21T14:00:00.000Z",
      rawPayload:{ body:PRIVATE_SENTINEL }
    }],
    googleCalendarSignals:[],
    googleInsights:[],
    automationEvents:[],
    tasks:[],
    auditHistory:[],
    activityEvents:[]
  };
}

function fakeStore(seed, { writable = true } = {}) {
  let current = structuredClone(seed);
  const reads = [];
  const writes = [];
  const store = {
    async readState() {
      reads.push(true);
      return structuredClone(current);
    }
  };
  if (writable) {
    store.writeCollections = async (patch) => {
      writes.push(structuredClone(patch));
      current = { ...current, ...structuredClone(patch) };
    };
  }
  return { store, reads, writes, state:() => structuredClone(current) };
}

console.log("Founder Support and Calendar HTTP adapter tests");

{
  assert.equal(isFounderSupportApiPath(FOUNDER_SUPPORT_VIEW_PATH), true);
  assert.equal(isFounderSupportApiPath(FOUNDER_SUPPORT_ACTION_PATH), true);
  assert.equal(isFounderSupportApiPath("/api/ui/support/debug"), false);
  assert.deepEqual(FOUNDER_SUPPORT_API_ROUTES, [
    "GET /api/ui/support",
    "POST /api/ui/support/action"
  ]);
  assert.deepEqual(await handleFounderSupportApiRequest({ pathname:"/api/ui/unrelated" }), { matched:false });
  ok("Support routes match only their narrow HTTP boundary");
}

{
  const fake = fakeStore(supportState());
  const disabled = await handleFounderSupportApiRequest({
    enabled:false,
    pathname:FOUNDER_SUPPORT_VIEW_PATH,
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(disabled.status, 404);
  assert.equal(fake.reads.length, 0);

  const read = await handleFounderSupportApiRequest({
    enabled:true,
    method:"GET",
    pathname:FOUNDER_SUPPORT_VIEW_PATH,
    searchParams:new URLSearchParams("includeResolved=false"),
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(read.status, 200);
  assert.equal(read.body.ok, true);
  assert.equal(read.body.items.length, 1);
  assert.equal(read.body.relationshipOptions[0].id, "partner:partner-customer");
  assert.equal(read.body.relationshipOptions[0].label, "Example Customer Co");
  assert.equal(read.body.safety.responseSendAvailable, false);
  assert.equal(read.body.mutations, 0);
  assert.equal(read.body.externalActions, 0);
  assert.equal(Object.hasOwn(read.body, "state"), false);
  assert.doesNotMatch(JSON.stringify(read.body), new RegExp(PRIVATE_SENTINEL));
  ok("Support GET returns a sanitized founder projection and relationship choices without full state");
}

{
  const fake = fakeStore(supportState());
  const view = await handleFounderSupportApiRequest({
    enabled:true,
    method:"GET",
    pathname:FOUNDER_SUPPORT_VIEW_PATH,
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  const item = view.body.items[0];
  const changed = await handleFounderSupportApiRequest({
    enabled:true,
    method:"POST",
    pathname:FOUNDER_SUPPORT_ACTION_PATH,
    input:{
      itemId:item.id,
      action:"create_task",
      requestId:"support_adapter_task_0001",
      expectedVersion:item.source.version,
      title:"Resolve synthetic customer issue",
      dueDate:"2026-07-22"
    },
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.ok, true);
  assert.equal(changed.body.result.responseSent, false);
  assert.equal(changed.body.externalActions, 0);
  assert.equal(Object.hasOwn(changed.body, "state"), false);
  assert.equal(Object.hasOwn(changed.body, "collections"), false);
  assert.deepEqual(Object.keys(fake.writes[0]).sort(), ["activityEvents", "auditHistory", "supportIssues", "tasks"]);
  assert.equal(fake.state().tasks[0].sourceType, "support_issue");
  ok("Support POST persists only scoped internal records and never reports a response send");
}

{
  const fake = fakeStore(supportState());
  const denied = await handleFounderSupportApiRequest({
    enabled:true,
    method:"GET",
    pathname:FOUNDER_SUPPORT_VIEW_PATH,
    store:fake.store,
    actor:SIGNED_OUT,
    now:NOW
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.ok, false);
  const unsupported = await handleFounderSupportApiRequest({
    enabled:true,
    method:"GET",
    pathname:FOUNDER_SUPPORT_VIEW_PATH,
    searchParams:new URLSearchParams("debug=true"),
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(unsupported.status, 400);
  const wrongMethod = await handleFounderSupportApiRequest({
    enabled:true,
    method:"DELETE",
    pathname:FOUNDER_SUPPORT_ACTION_PATH,
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(wrongMethod.status, 405);
  assert.equal(fake.writes.length, 0);
  ok("Support rejects unauthorized, unsupported, and wrong-method requests without writes");
}

{
  assert.equal(isFounderCalendarApiPath(FOUNDER_CALENDAR_VIEW_PATH), true);
  assert.equal(isFounderCalendarApiPath(FOUNDER_CALENDAR_ACTION_PATH), true);
  assert.equal(isFounderCalendarApiPath(FOUNDER_CALENDAR_CREATE_LINK_PATH), true);
  assert.equal(isFounderCalendarApiPath("/api/ui/calendar/provider"), false);
  assert.deepEqual(FOUNDER_CALENDAR_API_ROUTES, [
    "GET /api/ui/calendar",
    "POST /api/ui/calendar/action",
    "POST /api/ui/calendar/create-link"
  ]);
  ok("Calendar routes expose only projection, internal task, and prefilled-link endpoints");
}

{
  const fake = fakeStore(calendarState());
  const read = await handleFounderCalendarApiRequest({
    enabled:true,
    method:"GET",
    pathname:FOUNDER_CALENDAR_VIEW_PATH,
    searchParams:new URLSearchParams("range=this_week&timeZone=America%2FChicago"),
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(read.status, 200);
  assert.equal(read.body.ok, true);
  assert.equal(read.body.items.length, 1);
  assert.equal(read.body.items[0].category, "Partner meeting");
  assert.equal(read.body.safety.calendarWrites, false);
  assert.equal(read.body.mutations, 0);
  assert.equal(read.body.externalActions, 0);
  assert.equal(Object.hasOwn(read.body, "state"), false);
  assert.doesNotMatch(JSON.stringify(read.body), new RegExp(PRIVATE_SENTINEL));
  assert.doesNotMatch(JSON.stringify(read.body), /jamie@example\.com/);
  ok("Calendar GET returns deduplicated read-only event context without provider payloads or guest email addresses");
}

{
  const fake = fakeStore(calendarState());
  const read = await handleFounderCalendarApiRequest({
    enabled:true,
    method:"GET",
    pathname:FOUNDER_CALENDAR_VIEW_PATH,
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  const event = read.body.items[0];
  const beforeCalendar = JSON.stringify(fake.state().calendarSignals);
  const changed = await handleFounderCalendarApiRequest({
    enabled:true,
    method:"POST",
    pathname:FOUNDER_CALENDAR_ACTION_PATH,
    input:{
      eventId:event.id,
      action:"create_preparation_task",
      requestId:"calendar_adapter_task_001",
      expectedVersion:event.source.version
    },
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.ok, true);
  assert.equal(changed.body.result.calendarChanged, false);
  assert.equal(changed.body.result.invitationSent, false);
  assert.equal(changed.body.calendarWrites, 0);
  assert.equal(changed.body.externalActions, 0);
  assert.equal(Object.hasOwn(changed.body, "state"), false);
  assert.deepEqual(Object.keys(fake.writes[0]).sort(), ["activityEvents", "auditHistory", "tasks"]);
  assert.equal(JSON.stringify(fake.state().calendarSignals), beforeCalendar);
  ok("Calendar task creation writes only internal task evidence and leaves the Calendar source unchanged");
}

{
  const fake = fakeStore(calendarState());
  const prepared = await handleFounderCalendarApiRequest({
    enabled:true,
    method:"POST",
    pathname:FOUNDER_CALENDAR_CREATE_LINK_PATH,
    input:{
      title:"Synthetic customer review",
      start:"2026-07-29T15:00:00.000Z",
      end:"2026-07-29T15:30:00.000Z",
      details:"Review the synthetic customer decision.",
      location:"Video call"
    },
    store:fake.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(prepared.status, 200);
  assert.equal(prepared.body.ok, true);
  const url = new URL(prepared.body.href);
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), "Synthetic customer review");
  assert.equal(prepared.body.calendarWrites, 0);
  assert.equal(prepared.body.invitationSent, false);
  assert.equal(prepared.body.externalActions, 0);
  assert.equal(fake.reads.length, 0, "preparing a URL does not need a full-state read");
  assert.equal(fake.writes.length, 0);
  ok("Calendar event planning returns a safe encoded Google review URL without a provider write");
}

{
  const noWriter = fakeStore(calendarState(), { writable:false });
  const read = await handleFounderCalendarApiRequest({
    enabled:true,
    method:"GET",
    pathname:FOUNDER_CALENDAR_VIEW_PATH,
    store:noWriter.store,
    actor:OWNER,
    now:NOW
  });
  const event = read.body.items[0];
  const unavailable = await handleFounderCalendarApiRequest({
    enabled:true,
    method:"POST",
    pathname:FOUNDER_CALENDAR_ACTION_PATH,
    input:{
      eventId:event.id,
      action:"create_follow_up_task",
      requestId:"calendar_no_writer_0001",
      expectedVersion:event.source.version
    },
    store:noWriter.store,
    actor:OWNER,
    now:NOW
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.outcome, "unavailable");
  assert.equal(unavailable.body.mutations, 0);
  const deniedLink = await handleFounderCalendarApiRequest({
    enabled:true,
    method:"POST",
    pathname:FOUNDER_CALENDAR_CREATE_LINK_PATH,
    input:{ title:"Not allowed", start:"2026-07-29T15:00:00.000Z" },
    store:noWriter.store,
    actor:SIGNED_OUT,
    now:NOW
  });
  assert.equal(deniedLink.status, 403);
  assert.equal(deniedLink.body.calendarWrites, 0);
  ok("Calendar fails closed when internal persistence or authorization is unavailable");
}

console.log(`PASS test-vnext-founder-support-calendar-api (${passed} checks)`);
