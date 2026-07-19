#!/usr/bin/env node
import assert from "node:assert/strict";
import { planSocialScheduleMutation, saveSocialSchedule } from "./social-schedule-actions.mjs";
import { buildSocialCalendarContract } from "./social-calendar-service.mjs";
import { renderSocialCalendarPage } from "./ui/pages/social-calendar.mjs";

const actor = { authenticated:true, id:"operator-synthetic", role:"owner" };
const state = { posts:[{ id:"post-scheduled", _version:3, title:"Synthetic Post", targetChannels:["linkedin"], status:"draft" }, { id:"post-tray", _version:1, title:"Unscheduled Post", targetChannels:["instagram"], status:"draft" }], approvals:[], approvalQueue:[], queueItems:[], publishEvents:[], activityEvents:[], auditHistory:[], postImages:[], brandAssets:[], postingKits:[], generationBatches:[], library:[], settings:{ sourceItems:[], localAssets:[] } };
const input = { expectedVersion:3, requestId:"schedule-request-1", scheduledAt:"2026-08-10T09:30:00-04:00", timezone:"America/New_York" };
const plan = planSocialScheduleMutation(state, actor, "post-scheduled", input, "2026-07-19T12:00:00.000Z");
assert.deepEqual(plan.patch, { scheduledFor:input.scheduledAt, timezone:input.timezone, scheduleStatus:"scheduled" });
assert.throws(() => planSocialScheduleMutation(state, actor, "post-scheduled", { ...input, scheduledAt:"2026-08-10T09:30:00" }, "2026-07-19T12:00:00.000Z"), /explicit offset/);
assert.throws(() => planSocialScheduleMutation(state, actor, "post-scheduled", { ...input, timezone:"" }, "2026-07-19T12:00:00.000Z"), /IANA/);
assert.throws(() => planSocialScheduleMutation(state, actor, "post-scheduled", { ...input, scheduledAt:"2026-08-10T09:30:00+02:00" }, "2026-07-19T12:00:00.000Z"), /same local time/);
assert.throws(() => planSocialScheduleMutation(state, actor, "post-scheduled", { ...input, expectedVersion:2 }, "2026-07-19T12:00:00.000Z"), /changed/);
let committed;
const result = await saveSocialSchedule({ now:() => "2026-07-19T12:00:00.000Z", commitPostMutation:async (request) => { committed = request; return { version:4 }; } }, state, actor, "post-scheduled", input);
assert.equal(result.version, 4); assert.deepEqual(committed.patch, plan.patch); assert.equal(committed.audit.action, "social_post_schedule_saved");
const scheduledState = structuredClone(state); scheduledState.posts[0] = { ...scheduledState.posts[0], ...committed.patch, _version:4 };
const calendar = buildSocialCalendarContract(scheduledState, actor, { generatedAt:"2026-07-19T12:00:00.000Z" });
assert.equal(calendar.items.length, 1); assert.equal(calendar.unscheduled.length, 1); assert.equal(calendar.items[0].href, "#social/post/post-scheduled");
const html = renderSocialCalendarPage(calendar); assert.match(html, /Month/); assert.match(html, /Week/); assert.match(html, /All channels/); assert.match(html, /Unscheduled Post/); assert.doesNotMatch(html, /publish|approve/i);
console.log("Social schedule action tests passed.");
