// Founder OS Release 2 — the Today operating loop.
//
// Two things are proven here, because they are the two promises the release makes:
//   1. The ranking rules of docs/founder-os/workspaces/today.md order the queue, and only work
//      that needs Roger today is in it.
//   2. Completing ONE communication does all six things the charter names, in one action.
//
// Everything is pure: no server, no store, no network. The safety invariant is asserted the same
// way — by proving the cascade performs zero external actions and never sends.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FOUNDER_OS_TODAY_ENV_KEY,
  FOUNDER_OS_TODAY_SECTIONS,
  readFounderOsTodayConfig
} from "./ui/founder-os-config.mjs";
import {
  FOUNDER_TODAY_RANK_TIERS,
  FOUNDER_TODAY_STALE_DAYS,
  buildFounderTodayView
} from "./ui/view-models/founder-today-view.mjs";
import { buildAuthorizedFounderTodayPage } from "./today-page-service.mjs";
import { markCommunicationDraftSentManually, saveCommunicationDraft } from "./communication-composer-service.mjs";
import { applyTaskWorkbenchAction } from "./task-workbench-service.mjs";
import { createQueueItem } from "./company-memory.mjs";
import { renderFounderTodayLoading, todayPageBrowserSource } from "./ui/pages/today-page.mjs";

const NOW = "2026-07-25T15:00:00.000Z"; // 11:00 Eastern, a Saturday
const OWNER = Object.freeze({ authenticated:true, id:"roger", role:"owner", label:"Roger" });
const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}
const daysAgo = (days) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

// ---------------------------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------------------------

check("FOUNDER_OS_TODAY defaults off and only the exact string \"true\" turns it on", () => {
  assert.equal(FOUNDER_OS_TODAY_ENV_KEY, "FOUNDER_OS_TODAY");
  assert.equal(readFounderOsTodayConfig({}).enabled, false);
  assert.equal(readFounderOsTodayConfig({ FOUNDER_OS_TODAY:"1" }).enabled, false);
  assert.equal(readFounderOsTodayConfig({ FOUNDER_OS_TODAY:"TRUE" }).enabled, false);
  assert.equal(readFounderOsTodayConfig({ FOUNDER_OS_TODAY:"true" }).enabled, true);
  assert.equal(readFounderOsTodayConfig().source, "server-environment");
});

check("the five charter sections are the sections, in charter order", () => {
  assert.deepEqual(
    FOUNDER_OS_TODAY_SECTIONS.map((section) => section.id),
    ["now", "next", "communications", "meetings", "needsAttention"]
  );
  assert.equal(FOUNDER_OS_TODAY_SECTIONS[0].limit, 1, "Now is a single item.");
  assert.equal(FOUNDER_OS_TODAY_SECTIONS[1].limit, 5, "Next is at most five items.");
});

check("the flag chooses exactly one Today renderer, never both", () => {
  const legacy = todayPageBrowserSource();
  const founder = todayPageBrowserSource({ founderOsToday:true });
  assert.notEqual(legacy, founder);
  assert.match(legacy, /data-today-answer="needs-you"|needs-you/);
  assert.doesNotMatch(founder, /vnext-today-progress-list/);
  assert.match(founder, /data-founder-today/);
  assert.equal(todayPageBrowserSource({ founderOsToday:false }), legacy, "Anything but true is off.");
  const loading = renderFounderTodayLoading();
  for (const slot of ["now", "next", "communications", "meetings", "needs-attention"]) {
    assert.ok(loading.includes(`data-today-answer="${slot}"`), `${slot} needs a section slot.`);
  }
});

// ---------------------------------------------------------------------------------------------
// The ranking rules (today.md)
// ---------------------------------------------------------------------------------------------

check("the six ranking tiers are the six rules, in order", () => {
  assert.deepEqual(FOUNDER_TODAY_RANK_TIERS.map((entry) => entry.tier), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    FOUNDER_TODAY_RANK_TIERS.map((entry) => entry.id),
    ["hard_blocker", "external_commitment", "waiting_on_me", "follow_up_due", "approval", "scheduled"]
  );
});

const rankingState = {
  // Rule 1: a customer-facing incident.
  supportIssues:[{
    id:"sup-incident", status:"open", title:"Customer cannot access their record",
    summary:"Sign-in fails for a paying customer.", urgency:"urgent",
    created_at:daysAgo(0), updated_at:daysAgo(0)
  }],
  // Rule 1: a campaign safety trip, and rule 6 noise that must not outrank anything.
  alerts:[
    { id:"alert-safety", dedupe_key:"safety", severity:"critical", source_group:"safety", status:"active",
      title:"Reactivation stopped for safety", detail:"Bounce rate crossed the threshold.", last_seen_at:NOW },
    { id:"alert-info", dedupe_key:"info", severity:"info", source_group:"partners", status:"active",
      title:"A partner program is quiet", detail:"Nothing is blocked.", last_seen_at:NOW }
  ],
  inboxSignals:[
    // Rule 2: an external commitment due today.
    { id:"sig-commitment", status:"suggested", kind:"commitment", counterpartName:"Ben Ortiz",
      summary:"You promised Ben the pilot terms by today.", dueAt:"2026-07-25", priority:"normal",
      createdAt:daysAgo(3), updatedAt:daysAgo(3) },
    // Rule 3: waiting on me, oldest inbound.
    { id:"sig-old", status:"suggested", kind:"needs_reply", counterpartName:"Dana Reed",
      summary:"Dana asked a question nine days ago.", priority:"normal",
      createdAt:daysAgo(9), updatedAt:daysAgo(9) },
    // Rule 3: waiting on me, newer inbound.
    { id:"sig-new", status:"suggested", kind:"needs_reply", counterpartName:"Sam Poole",
      summary:"Sam replied yesterday.", priority:"normal",
      createdAt:daysAgo(1), updatedAt:daysAgo(1) },
    // A commitment that is NOT due today: it stays in its workspace.
    { id:"sig-future", status:"suggested", kind:"commitment", counterpartName:"Kim Alvarez",
      summary:"Due next month.", dueAt:"2026-08-30", priority:"high",
      createdAt:daysAgo(1), updatedAt:daysAgo(1) }
  ],
  meetingBriefs:[
    { id:"brief-soon", event_id:"ev-soon", title:"Investor sync", start_at:"2026-07-25T16:00:00.000Z",
      known_attendees:[{ email:"a@example.com" }], talking_points:["Pipeline"], updated_at:NOW },
    { id:"brief-later", event_id:"ev-later", title:"Team retro", start_at:"2026-07-25T22:00:00.000Z",
      known_attendees:[], talking_points:[], updated_at:NOW },
    { id:"brief-tomorrow", event_id:"ev-tomorrow", title:"Not today", start_at:"2026-07-27T14:00:00.000Z",
      known_attendees:[], talking_points:[], updated_at:NOW }
  ],
  tasks:[
    // Rule 6: due today, so it qualifies.
    { id:"task-due", title:"Send the board update", status:"open", priority:"high",
      owner:"Roger", due_date:"2026-07-25", updated_at:daysAgo(1) },
    // Rule 6: not due, so it stays out of Today entirely.
    { id:"task-someday", title:"Refactor the importer", status:"open", priority:"high",
      owner:"Roger", due_date:"2026-09-01", updated_at:daysAgo(1) },
    // Waiting with no movement for longer than the stale window.
    { id:"task-silent", title:"Waiting on counsel", status:"waiting", priority:"normal",
      owner:"Roger", waiting_on:"Lawrence", updated_at:daysAgo(FOUNDER_TODAY_STALE_DAYS + 6) }
  ],
  queueItems:[]
};

const ranked = buildFounderTodayView(rankingState, OWNER, NOW);
const order = [...ranked.sections.now, ...ranked.sections.next];
const titleAt = (index) => order[index]?.title || "";
const find = (title) => [...order, ...ranked.sections.communications, ...ranked.sections.needsAttention, ...ranked.sections.meetings]
  .find((item) => item.title === title) || null;

check("rule 1 — a hard blocker is Now, ahead of everything else", () => {
  assert.equal(ranked.sections.now.length, 1, "Now is exactly one item.");
  assert.equal(titleAt(0), "Customer cannot access their record");
  assert.equal(ranked.sections.now[0].rankTier, 1);
});

check("rule 1 — a campaign safety trip ranks as a hard blocker too", () => {
  const trip = find("Reactivation stopped for safety");
  assert.ok(trip, "The safety trip must be in the queue.");
  assert.equal(trip.rankTier, 1);
  // It is stated in plain language and offers no engine terminology.
  assert.doesNotMatch(trip.summary + trip.whyNow, /engine|heartbeat|projector|collection/i);
});

check("rule 2 — a commitment due today outranks a reply that is merely waiting", () => {
  const commitment = find("Follow up with Ben Ortiz");
  const reply = find("Follow up with Dana Reed");
  assert.equal(commitment.rankTier, 2);
  assert.equal(reply.rankTier, 3);
  assert.ok(order.indexOf(commitment) < order.indexOf(reply));
});

check("rule 2 — a meeting starting soon is preparation work and competes for Now", () => {
  const soon = ranked.sections.meetings.find((item) => item.title === "Investor sync");
  const later = ranked.sections.meetings.find((item) => item.title === "Team retro");
  assert.equal(soon.rankTier, 2, "A meeting inside the window is an external deadline.");
  assert.equal(later.rankTier, 6);
  assert.ok(order.some((item) => item.title === "Investor sync"), "It must be able to reach Now/Next.");
});

check("rule 3 — waiting-on-me communications are ordered oldest inbound first", () => {
  const older = find("Follow up with Dana Reed");
  const newer = find("Follow up with Sam Poole");
  assert.equal(older.rankTier, 3);
  assert.equal(newer.rankTier, 3);
  assert.ok(older.inboundAgeDays > newer.inboundAgeDays);
  const positions = [...order, ...ranked.sections.communications];
  assert.ok(positions.indexOf(older) < positions.indexOf(newer), "The older inbound comes first.");
});

check("priority and urgency stay separate, and ranking multiplies them", () => {
  const item = find("Follow up with Ben Ortiz");
  assert.equal(item.priority, "normal");
  assert.equal(item.urgency, "today");
  assert.equal(item.priorityScore * 0 + item.rankScore, (item.urgencyScore + 1) * (item.priorityScore + 1));
  const blocker = ranked.sections.now[0];
  assert.ok(blocker.urgencyScore > item.urgencyScore, "Urgency is derived from time, not priority.");
});

check("only work that needs Roger today is ranked at all", () => {
  const rankedTitles = new Set(ranked.sections.now.concat(ranked.sections.next).map((item) => item.title));
  assert.equal(find("Refactor the importer"), null, "Work due in September is not today's work.");
  assert.equal(find("Follow up with Kim Alvarez"), null, "A commitment due next month is not today's work.");
  assert.equal(find("Not today"), null, "Tomorrow's meeting is not on today's agenda.");
  // Work due today qualifies and is ranked, even when the queue's cap keeps it off the screen.
  const withoutBlockers = buildFounderTodayView({ ...rankingState, alerts:[], supportIssues:[], inboxSignals:[], meetingBriefs:[] }, OWNER, NOW);
  assert.ok(
    withoutBlockers.sections.now.concat(withoutBlockers.sections.next).some((item) => item.title === "Send the board update"),
    "Work due today is today's work."
  );
  assert.ok(rankedTitles.size >= 1);
});

check("the queue is capped on purpose, and says so instead of hiding the remainder", () => {
  assert.ok(ranked.counts.overflow > 0, "This fixture ranks more than Now plus five.");
  const displayed = new Set([
    ...ranked.sections.now, ...ranked.sections.next, ...ranked.sections.communications,
    ...ranked.sections.meetings, ...ranked.sections.needsAttention
  ].map((item) => item.id));
  assert.ok(displayed.size > 0);
  // Nothing that qualified is unaccounted for: it is either shown or counted.
  assert.equal(
    buildAuthorizedFounderTodayPage(rankingState, OWNER, NOW).overflow,
    ranked.counts.overflow,
    "The payload carries the overflow count so the page can state it."
  );
});

check("nothing waits silently forever — 14 days with no movement resurfaces", () => {
  const stalled = ranked.sections.needsAttention.find((item) => item.title === "Waiting on counsel");
  assert.ok(stalled, "A waiting item older than the stale window must resurface.");
  assert.match(stalled.summary, /No movement for \d+ days/);
  assert.equal(stalled.section, "needsAttention");
});

check("a typed section never repeats an item already shown in Now or Next", () => {
  const promoted = new Set(order.map((item) => item.id));
  for (const key of ["communications", "needsAttention"]) {
    for (const item of ranked.sections[key]) {
      assert.ok(!promoted.has(item.id), `${item.title} appears twice in one queue.`);
    }
  }
  // ...but the section still reports the whole lane, so it can never read as falsely empty.
  assert.ok(ranked.totals.needsAttention >= ranked.counts.needsAttention);
  assert.ok(ranked.totals.needsAttention > 0, "The incident and the safety trip are in the lane.");
});

check("every item carries one action panel trigger and no send control", () => {
  const all = [...order, ...ranked.sections.communications, ...ranked.sections.needsAttention, ...ranked.sections.meetings];
  assert.ok(all.length > 0);
  for (const item of all) {
    assert.ok(item.title, "Every item names itself in plain language.");
    assert.ok(item.whyNow, "Every item says why it is here now.");
    assert.ok(!("send" in item) && !("publish" in item) && !("approve" in item), "Today has no send path.");
  }
  const communication = find("Follow up with Dana Reed");
  assert.equal(communication.composeSourceKind, "inbox_signal", "Communications open the composer.");
  assert.equal(communication.taskId, "", "A communication does not pretend to be a task.");
  const taskOnly = buildFounderTodayView({ ...rankingState, alerts:[], supportIssues:[], inboxSignals:[], meetingBriefs:[] }, OWNER, NOW);
  const task = taskOnly.sections.now.concat(taskOnly.sections.next).find((item) => item.title === "Send the board update");
  assert.equal(task.taskId, "task-due", "Tasks open the task workbench.");
  assert.equal(task.composeSourceKind, "", "A task does not open the composer instead.");
});

check("completing the Now item promotes the next one", () => {
  const promotedNext = ranked.sections.next[0];
  assert.ok(promotedNext, "There must be a next item to promote.");
  const without = {
    ...rankingState,
    supportIssues:[{ ...rankingState.supportIssues[0], status:"resolved", resolved_at:NOW, updated_at:NOW }]
  };
  const after = buildFounderTodayView(without, OWNER, NOW);
  assert.notEqual(after.sections.now[0].id, ranked.sections.now[0].id, "The completed item is gone.");
  assert.equal(after.sections.now[0].id, promotedNext.id, "The next item became Now.");
});

check("an unauthorized reader gets no ranked work", () => {
  const viewer = buildFounderTodayView(rankingState, { authenticated:true, id:"guest", role:"viewer" }, NOW);
  assert.equal(viewer.authorized, false);
  assert.equal(viewer.sections.now.length + viewer.sections.next.length, 0);
});

check("the page payload is a plain, frozen view with labels for both scales", () => {
  const payload = buildAuthorizedFounderTodayPage(rankingState, OWNER, NOW);
  assert.equal(payload.ok, true);
  assert.equal(payload.founderOsToday, true);
  assert.ok(Object.isFrozen(payload));
  assert.deepEqual(Object.keys(payload.sections), ["now", "next", "communications", "meetings", "needsAttention"]);
  const item = payload.sections.now[0];
  assert.match(item.priorityLabel, /priority$/);
  assert.ok(item.urgencyLabel);
  assert.notEqual(item.priorityLabel, item.urgencyLabel, "Priority and urgency read differently.");
  assert.ok(payload.sections.next.length <= 5, "Next is at most five items.");
});

// ---------------------------------------------------------------------------------------------
// The six-part completion cascade (workflows/01-clear-a-follow-up.md, steps 5-10)
// ---------------------------------------------------------------------------------------------

function cascadeState() {
  const signalId = "sig-cascade";
  return {
    inboxSignals:[{
      id:signalId, status:"suggested", kind:"needs_reply", counterpartName:"Dana Reed",
      counterpartEmail:"dana@example.com", summary:"Dana asked for the pilot terms.",
      priority:"high", createdAt:daysAgo(4), updatedAt:daysAgo(4)
    }],
    partners:[{
      id:"partner-dana", organizationName:"Reed Legal Aid", contactEmail:"dana@example.com",
      contactName:"Dana Reed", stage:"pilot", lastContactedAt:daysAgo(30), updatedAt:daysAgo(30)
    }],
    tasks:[{
      id:"task-dana", title:"Reply to Dana about the pilot terms", status:"open", priority:"high",
      owner:"Roger", sourceType:"partner", sourceId:"partner-dana", due_date:"2026-07-25",
      updated_at:daysAgo(1)
    }],
    approvalQueue:[{
      id:"queued-sequence", status:"queued", type:"outreach_send", to:"dana@example.com",
      summary:"An automated nudge is queued for Dana."
    }],
    queueItems:[
      createQueueItem({
        id:"qi-dana-signal", type:"inbox_reply", sourceEngine:"inbox-intelligence",
        title:"Reply to Dana Reed", summary:"Dana is waiting on the pilot terms.",
        status:"needs_roger", sourceRef:{ collection:"inboxSignals", itemId:signalId }
      }, { now:() => daysAgo(4) }),
      createQueueItem({
        id:"qi-dana-task", type:"partner_followup", sourceEngine:"tasks",
        title:"Reply to Dana about the pilot terms", status:"needs_roger",
        sourceRef:{ collection:"tasks", itemId:"task-dana" }
      }, { now:() => daysAgo(1) }),
      createQueueItem({
        id:"qi-unrelated", type:"partner_followup", sourceEngine:"tasks", title:"Something else entirely",
        status:"needs_roger", sourceRef:{ collection:"tasks", itemId:"task-other" }
      }, { now:() => daysAgo(1) })
    ],
    emailDrafts:[], activityEvents:[], auditHistory:[], companyEvents:[], approvals:[],
    outreachContacts:[], reactivationContacts:[], prospectCandidates:[], companyContacts:[],
    outreachReplies:[], supportIssues:[], outreachSuppressions:[]
  };
}

function draftAndSend({ completeQueueItems, nextFollowUpDate = "2026-08-05" }) {
  const start = cascadeState();
  const saved = saveCommunicationDraft(start, OWNER, {
    sourceKind:"inbox_signal",
    sourceId:"sig-cascade",
    requestId:"communication_draft_founder_os_release_two_a",
    recipient:"dana@example.com",
    recipientName:"Dana Reed",
    recipientOrganization:"Reed Legal Aid",
    subject:"Pilot terms",
    body:"Dana - here are the pilot terms you asked for. Happy to walk through them this week."
  }, { now:NOW });
  const withDraft = { ...saved.state };
  // The panel completes the task the follow-up was about.
  withDraft.emailDrafts = withDraft.emailDrafts.map((draft) => ({ ...draft, originatingTaskId:"task-dana" }));
  const draft = withDraft.emailDrafts[0];
  const sent = markCommunicationDraftSentManually(withDraft, OWNER, draft.id, {
    requestId:"communication_manual_sent_founder_os_release_two_a",
    expectedVersion:draft.updatedAt || draft.version || "legacy",
    nextFollowUpDate,
    completeOriginatingTask:true,
    completionNote:"Sent the pilot terms."
  }, { now:NOW, completeQueueItems });
  return { start, saved, sent };
}

const cascade = draftAndSend({ completeQueueItems:true });

check("cascade 1 of 6 — the interaction is recorded", () => {
  assert.equal(cascade.sent.ok, true);
  const activity = cascade.sent.state.activityEvents.find((event) => event.eventType === "Manual email sent");
  assert.ok(activity, "An activity event records the outbound touch.");
  const audit = cascade.sent.state.auditHistory.find((entry) => entry.action === "manual_email_recorded");
  assert.ok(audit, "The audit ledger records it too.");
  assert.equal(cascade.sent.draft.status, "Sent manually");
});

check("cascade 2 of 6 — the related task is completed", () => {
  assert.equal(cascade.sent.taskCompleted, true);
  const task = cascade.sent.state.tasks.find((entry) => entry.id === "task-dana");
  assert.equal(String(task.status).toLowerCase(), "done");
});

check("cascade 3 of 6 — the relationship's last-contact date updates", () => {
  const partner = cascade.sent.state.partners.find((entry) => entry.id === "partner-dana");
  const before = cascade.start.partners[0];
  assert.equal(partner.lastContacted, NOW, "The relationship's last-contact timestamp moves to now.");
  assert.equal(partner.lastTouchDate, NOW.slice(0, 10));
  assert.ok(Date.parse(partner.lastOutboundInteractionAt) > Date.parse(before.lastContactedAt));
});

check("cascade 4 of 6 — an incompatible automated sequence is stopped for review", () => {
  assert.equal(cascade.sent.automation.reviewRequired, true);
  const queued = cascade.sent.state.approvalQueue.find((entry) => entry.id === "queued-sequence");
  assert.notEqual(queued.status, "queued", "The queued automation may not proceed untouched.");
});

check("cascade 5 of 6 — the next follow-up is set", () => {
  const stored = cascade.sent.state.emailDrafts.find((draft) => draft.id === cascade.sent.draft.id);
  assert.equal(stored.nextFollowUpDate, "2026-08-05", "The next touch is recorded on the draft.");
  assert.equal(cascade.sent.nextFollowUpNeeded, false, "Nothing is left to ask for.");
  const partner = cascade.sent.state.partners.find((entry) => entry.id === "partner-dana");
  assert.equal(partner.nextFollowUpDate, "2026-08-05", "And on the relationship.");
  // Recording no date instead asks for one rather than silently leaving the thread open.
  const withoutDate = draftAndSend({ completeQueueItems:true, nextFollowUpDate:"" });
  assert.equal(withoutDate.sent.nextFollowUpNeeded, true);
});

check("cascade 6 of 6 — the item leaves Today, and only the right items leave", () => {
  assert.deepEqual([...cascade.sent.queueItemsCompleted].sort(), ["qi-dana-signal", "qi-dana-task"]);
  const byId = new Map(cascade.sent.state.queueItems.map((item) => [item.id, item]));
  assert.equal(byId.get("qi-dana-signal").status, "completed");
  assert.equal(byId.get("qi-dana-task").status, "completed");
  assert.equal(byId.get("qi-unrelated").status, "needs_roger", "An unrelated item is never touched.");
});

check("the cascade is one action from Roger's point of view", () => {
  // All six effects come from the single mark-sent call, not from six separate requests.
  const changed = Object.keys(cascade.sent.collections);
  for (const collection of ["emailDrafts", "tasks", "partners", "approvalQueue", "activityEvents", "auditHistory", "queueItems"]) {
    assert.ok(changed.includes(collection), `${collection} must change in the same action.`);
  }
});

check("SAFETY — the cascade performs zero external actions and sends nothing", () => {
  assert.equal(cascade.sent.externalActions, 0);
  const audit = cascade.sent.state.auditHistory.find((entry) => entry.action === "manual_email_recorded");
  assert.equal(audit.externalSideEffects, false);
  assert.equal(audit.emailSentByApplication, false);
  const stored = cascade.sent.state.emailDrafts.find((draft) => draft.id === cascade.sent.draft.id);
  assert.equal(stored.emailSentByApplication, false);
  assert.equal(stored.externalDeliveryRecorded, true, "The send happened in Gmail, by Roger's own hand.");
  assert.match(cascade.sent.message, /No email was sent by LegalEase/);
  // The panel's own source contains no send endpoint.
  const panelSource = readFileSync(new URL("./ui/pages/today-page.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(panelSource, /\/api\/(outreach|campaign|social)[^"']*send|publishPostNow|releaseWave/i);
});

check("with the flag off the cascade behaves exactly as it did before Release 2", () => {
  const off = draftAndSend({ completeQueueItems:false });
  assert.equal(off.sent.ok, true);
  assert.deepEqual(off.sent.queueItemsCompleted, []);
  const byId = new Map(off.sent.state.queueItems.map((item) => [item.id, item]));
  assert.equal(byId.get("qi-dana-signal").status, "needs_roger", "No queue transition without the flag.");
  assert.ok(!Object.keys(off.sent.collections).includes("queueItems"));
  assert.equal(off.sent.taskCompleted, true, "Everything else is unchanged.");
});

check("marking sent twice is recorded once", () => {
  const first = cascade.sent;
  const draft = first.state.emailDrafts[0];
  assert.throws(() => markCommunicationDraftSentManually(first.state, OWNER, draft.id, {
    requestId:"communication_manual_sent_founder_os_release_two_b",
    expectedVersion:draft.updatedAt,
    completeOriginatingTask:false
  }, { now:NOW, completeQueueItems:true }), /already/i);
});

check("completing a task from the panel also removes it from Today", () => {
  const state = cascadeState();
  const task = state.tasks[0];
  const result = applyTaskWorkbenchAction(state, OWNER, "task-dana", {
    action:"done",
    expectedVersion:new Date(Date.parse(task.updated_at)).toISOString(),
    note:"Handled in the panel."
  }, { now:NOW, completeQueueItems:true });
  assert.deepEqual(result.body.queueItemsCompleted, ["qi-dana-task"]);
  const byId = new Map(result.state.queueItems.map((item) => [item.id, item]));
  assert.equal(byId.get("qi-dana-task").status, "completed");
  assert.equal(byId.get("qi-unrelated").status, "needs_roger");

  const off = applyTaskWorkbenchAction(cascadeState(), OWNER, "task-dana", {
    action:"done",
    expectedVersion:new Date(Date.parse(task.updated_at)).toISOString(),
    note:"Handled in the panel."
  }, { now:NOW });
  assert.deepEqual(off.body.queueItemsCompleted, []);
  assert.ok(!Object.keys(off.collections).includes("queueItems"));
});

console.log(`test-founder-os-today: ${checks.length} checks passed`);
for (const name of checks) console.log(`  ✓ ${name}`);
