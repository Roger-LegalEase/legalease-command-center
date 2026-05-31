import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOperatorSearchIndex,
  runOperatorSearchAction,
  searchOperatorIndex
} from "./operator-search.mjs";
import { createCaptureInboxItem } from "./lee-quick-capture.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const baseState = {
  runtime: {
    livePostingGates: { linkedin: { enabled: false }, facebook: { enabled: false } }
  },
  tasks: [
    { id: "task-1", title: "Review RCAP proposal", description: "Internal proposal review.", status: "open", priority: "high", updatedAt: "2026-05-27T10:00:00.000Z" }
  ],
  captureInbox: [
    { id: "capture-1", raw_input: "Confirm RCAP dashboard blocker.", summary: "Confirm RCAP dashboard blocker", review_state: "review_required", inferred_type: "blocker", priority: "high", created_at: "2026-05-27T10:05:00.000Z", updated_at: "2026-05-27T10:05:00.000Z", routed_to: [] }
  ],
  conversationNotes: [
    { id: "conversation-1", summary: "Roger decided to keep RCAP review-only.", review_state: "reviewed", updated_at: "2026-05-27T10:10:00.000Z" }
  ],
  morningBriefs: [
    { key: "morning-brief-2026-05-27", mission_today: "Move RCAP internal review.", generated_at: "2026-05-27T08:00:00.000Z" }
  ],
  eveningReflections: [
    { key: "evening-reflection-2026-05-27", notes_for_tomorrow: [{ title: "Confirm dashboard requirements", detail: "Start here tomorrow." }], generated_at: "2026-05-27T18:00:00.000Z" }
  ],
  operatingMemory: [
    { key: "operating-memory-2026-05-27", moved_today: [{ title: "RCAP packet updated", detail: "Internal-only handoff packet refreshed." }], generated_at: "2026-05-27T18:30:00.000Z" }
  ],
  dailyCloseouts: [
    { key: "daily-closeout-2026-05-27", tomorrow_mission: "Confirm RCAP dashboard requirements.", generated_at: "2026-05-27T19:00:00.000Z" }
  ],
  partnerProgramArtifacts: [
    { key: "rcap-proposal-draft-v1", title: "RCAP Proposal Draft", review_state: "approved", updatedAt: "2026-05-27T09:00:00.000Z" },
    { key: "rcap-partner-page-draft-v1", title: "RCAP Partner Page Draft", review_state: "review_required", updatedAt: "2026-05-27T09:30:00.000Z" },
    { key: "rcap-dashboard-readiness-v1", title: "RCAP Dashboard Readiness", review_state: "blocked", blocker_reason: "Missing dashboard requirements.", updatedAt: "2026-05-27T09:45:00.000Z" }
  ],
  reports: [
    { key: "rcap-weekly-report-draft-v1", title: "RCAP Weekly Report Draft", status: "draft", review_state: "review_required", updatedAt: "2026-05-27T11:00:00.000Z" }
  ],
  evidencePackNotes: [
    { key: "rcap-production-activation-evidence-v1", title: "RCAP Evidence Note", notes: "No external action taken.", status: "recorded", updatedAt: "2026-05-27T11:10:00.000Z" }
  ],
  dataRoomItems: [
    { id: "data-room-1", title: "RCAP internal packet", summary: "Internal packet placeholder.", status: "draft", updatedAt: "2026-05-27T11:15:00.000Z" }
  ],
  partnerPrograms: [
    { id: "partner-program-rcap", slug: "rcap", name: "RCAP", status: "activation_review", updatedAt: "2026-05-27T11:20:00.000Z" }
  ],
  handoffPackets: [
    { id: "rcap-handoff-packet-v1", title: "RCAP Internal Handoff Packet", handoff_ready: false, status: "internal_only", updated_at: "2026-05-27T11:25:00.000Z" }
  ],
  osHealthSnapshots: [
    { id: "os-health-2026-05-27", overall_health: "needs_attention", generated_at: "2026-05-27T20:00:00.000Z" }
  ],
  auditHistory: [
    { id: "audit-1", action: "rcap artifact review state changed", resourceType: "partner_program_artifact", timestamp: "2026-05-27T11:30:00.000Z" }
  ],
  activityEvents: [
    { id: "activity-1", eventType: "RCAP review state changed", title: "Dashboard blocked", createdAt: "2026-05-27T11:35:00.000Z" }
  ]
};

const index = buildOperatorSearchIndex(baseState);
assert(Array.isArray(index), "Search index should build an array.");
assert(index.length >= 12, "Search index should include the major OS collections.");
assert(index.some(item => item.type === "task" && /RCAP proposal/i.test(item.title)), "Search should include tasks.");
assert(index.some(item => item.type === "captureInbox" && /dashboard blocker/i.test(item.title)), "Search should include Capture Inbox.");
assert(index.some(item => item.type === "morningBrief"), "Search should include Morning Brief records.");
assert(index.some(item => item.type === "eveningReflection"), "Search should include Evening Reflection records.");
assert(index.some(item => item.type === "operatingMemory"), "Search should include Operating Memory.");
assert(index.some(item => item.type === "dailyCloseout"), "Search should include Daily Closeouts.");
assert(index.some(item => item.type === "rcapArtifact"), "Search should include RCAP artifacts.");
assert(index.some(item => item.type === "handoffPacket"), "Search should include handoff packets.");
assert(index.some(item => item.type === "partnerProgram"), "Search should include partner programs.");
assert(index.some(item => item.type === "report"), "Search should include reports.");
assert(index.some(item => item.type === "evidenceNote"), "Search should include evidence notes.");
assert(index.some(item => item.type === "dataRoomItem"), "Search should include data room items.");
assert(index.some(item => item.type === "auditHistory"), "Search should include audit history.");
assert(index.some(item => item.type === "activityEvent"), "Search should include activity events.");
assert(index.some(item => item.type === "osHealthSnapshot"), "Search should include OS health snapshots.");

const rcapResults = searchOperatorIndex(index, "RCAP");
assert(rcapResults.length > 0, "Search should return RCAP results.");
assert(rcapResults.every(item => item.safe_actions?.length), "Each result should include safe actions.");

const actionNames = new Set(index.flatMap(item => (item.safe_actions || []).map(action => action.action)));
for (const action of ["open_route", "mark_capture_reviewed", "route_capture_task", "route_capture_operating_memory", "open_rcap_review_workspace", "open_os_health", "open_morning_brief", "open_evening_reflection", "open_daily_closeout"]) {
  assert(actionNames.has(action), `Safe action should exist: ${action}`);
}
for (const forbidden of ["send_email", "publish_page", "post_content", "activate_dashboard", "change_live_gates", "call_partner_journey", "expose_secrets"]) {
  assert(!actionNames.has(forbidden), `Forbidden action must not exist: ${forbidden}`);
}

const reviewed = runOperatorSearchAction(baseState, { action: "mark_capture_reviewed", targetId: "capture-1" }, { now: "2026-05-27T21:00:00.000Z", actor: "owner_token" });
assert.equal(reviewed.state.captureInbox.find(item => item.id === "capture-1")?.review_state, "reviewed", "Mark reviewed action should update capture internally.");
assert.equal(reviewed.state.activityEvents[0].metadata.externalSideEffects, false, "Mark reviewed should not have external side effects.");
assert.equal(Object.values(reviewed.state.runtime.livePostingGates).filter(gate => gate.enabled).length, 0, "Live gates must remain 0 after mark reviewed.");

const captured = createCaptureInboxItem(baseState, {
  raw_input: "Make this an internal task for RCAP.",
  source_label: "Operator search test",
  priority: "high"
}, { now: "2026-05-27T21:05:00.000Z", actor: "owner_token" });
const routed = runOperatorSearchAction(captured.state, { action: "route_capture_task", targetId: captured.item.id }, { now: "2026-05-27T21:10:00.000Z", actor: "owner_token" });
assert(routed.state.tasks.some(task => task.sourceId === captured.item.id), "Route capture to task should create an internal task.");
assert.equal(routed.state.activityEvents[0].metadata.externalSideEffects, false, "Route capture to task should be internal-only.");
assert.equal(Object.values(routed.state.runtime.livePostingGates).filter(gate => gate.enabled).length, 0, "Live gates must remain 0 after route capture.");

assert.throws(() => runOperatorSearchAction(baseState, { action: "send_email", targetId: "capture-1" }), /blocked|unsupported|forbidden/i, "Forbidden action should be blocked.");

assert(serverSource.includes("function cockpitOperatorSearchHtml"), "Cockpit search entry must render.");
assert(serverSource.includes("Search"), "Search label must exist.");
assert(serverSource.includes("Open Command Search"), "Open Command Search label must exist.");
assert(serverSource.includes("operatorSearchPageHtml"), "#operator-search route renderer must exist.");
assert(serverSource.includes("\"operator-search\""), "#operator-search route must be registered.");
assert(serverSource.includes("/api/operator-search"), "Operator search API must exist.");
assert(serverSource.includes("/api/operator-search/action"), "Operator search action endpoint must exist.");
assert(!/operator-search[\s\S]{0,3000}(send email|publish page|post content|activate dashboard|change live gates|Partner Journey API)/i.test(serverSource), "Operator Search must not expose external controls.");

console.log("operator search tests passed");
