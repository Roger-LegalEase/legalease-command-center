import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";
import { buildEveningReflection, buildMorningBrief } from "./lee-conversation-context.mjs";
import { createCaptureInboxItem, routeCaptureInboxItem } from "./lee-quick-capture.mjs";
import { synthesizeOperatingMemory } from "./operating-memory.mjs";

const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const baseState = {
  runtime: { livePostingGates: { linkedin: { enabled: false } } },
  captureInbox: [],
  conversationNotes: [],
  tasks: [],
  evidencePackNotes: [],
  activityEvents: [],
  auditHistory: []
};

const created = createCaptureInboxItem(baseState, {
  raw_input: "Decision: tomorrow focus on RCAP dashboard readiness blocker. Carry forward proposal edits. Do not touch live publishing.",
  source_label: "Le-E chat takeaway",
  linked_partner: "RCAP",
  linked_workflow: "RCAP",
  priority: "high"
}, { now: "2026-05-27T19:00:00.000Z", actor: "owner_token" });

assert.equal(created.item.capture_type, "auto_classify", "Default capture_type should be auto_classify.");
assert.equal(created.item.review_state, "review_required", "Default review_state should be review_required.");
assert(created.item.inferred_type, "Le-E classification/inferred_type should exist.");
assert(created.item.suggested_routes.length > 0, "Suggested routes should exist.");
assert.equal(created.state.auditHistory[0].action, "quick capture saved", "Create should add audit entry.");
assert.equal(created.state.activityEvents[0].eventType, "Quick Capture saved", "Create should add activity event.");

const reviewed = routeCaptureInboxItem(created.state, created.item.id, "mark_reviewed", { now: "2026-05-27T19:05:00.000Z", actor: "owner_token" });
assert.equal(reviewed.item.review_state, "reviewed", "Capture can be marked reviewed.");

const toConversation = routeCaptureInboxItem(reviewed.state, created.item.id, "route_conversation_notes", { now: "2026-05-27T19:10:00.000Z", actor: "owner_token" });
assert(toConversation.state.conversationNotes.length > 0, "Capture can route to conversationNotes.");
assert(toConversation.item.routed_to.includes("conversationNotes"), "Routed capture should track conversationNotes.");

const toMorning = routeCaptureInboxItem(toConversation.state, created.item.id, "route_morning_brief", { now: "2026-05-27T19:15:00.000Z", actor: "owner_token" });
assert(toMorning.item.routed_to.includes("morningBriefInputs"), "Capture can route to morningBriefInputs.");

const toEvening = routeCaptureInboxItem(toMorning.state, created.item.id, "route_evening_reflection", { now: "2026-05-27T19:20:00.000Z", actor: "owner_token" });
assert(toEvening.item.routed_to.includes("eveningReflectionInputs"), "Capture can route to eveningReflectionInputs.");

const toMemory = routeCaptureInboxItem(toEvening.state, created.item.id, "route_operating_memory", { now: "2026-05-27T19:25:00.000Z", actor: "owner_token" });
assert(toMemory.item.routed_to.includes("operatingMemory"), "Capture can route to operatingMemory.");

const toTask = routeCaptureInboxItem(toMemory.state, created.item.id, "route_task", { now: "2026-05-27T19:30:00.000Z", actor: "owner_token" });
assert(toTask.state.tasks.some(task => task.sourceType === "captureInbox"), "Capture can route to tasks.");
assert(toTask.item.routed_to.includes("tasks"), "Routed capture should track tasks.");

const brief = buildMorningBrief(toTask.state);
assert(brief.top_3_actions.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Routed captures should affect Morning Brief synthesis.");
const reflection = buildEveningReflection(toTask.state);
assert(reflection.carry_forward.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Routed captures should affect Evening Reflection synthesis.");
const memory = synthesizeOperatingMemory(toTask.state, { now: "2026-05-27T20:00:00.000Z", date: "2026-05-27" });
assert(memory.carry_forward.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Routed captures should affect Operating Memory synthesis.");
assert(buildDailyOperatingLoop(toTask.state).liveGatesCount === 0, "Live gates must remain 0.");

const ignored = routeCaptureInboxItem(toTask.state, created.item.id, "ignore", { now: "2026-05-27T19:35:00.000Z", actor: "owner_token" });
assert.equal(ignored.item.review_state, "ignored", "Capture can be ignored.");
assert(!buildMorningBrief(ignored.state).top_3_actions.some(item => /dashboard readiness blocker/i.test(item.title + " " + item.detail)), "Ignored captures should not affect Morning Brief.");
assert(!buildEveningReflection(ignored.state).carry_forward.some(item => /dashboard readiness blocker/i.test(item.title + " " + item.detail)), "Ignored captures should not affect Evening Reflection.");
assert(!synthesizeOperatingMemory(ignored.state, { now: "2026-05-27T21:00:00.000Z", date: "2026-05-27" }).carry_forward.some(item => /dashboard readiness blocker/i.test(item.title + " " + item.detail)), "Ignored captures should not affect Operating Memory.");
assert.equal(ignored.state.auditHistory[0].action, "quick capture ignored", "Ignore should create audit entry.");
assert.equal(ignored.state.activityEvents[0].eventType, "Quick Capture ignored", "Ignore should create activity event.");

assert.equal((server.match(/<h2>Quick Capture<\/h2>/g) || []).length, 1, "Only one Quick Capture module should exist in cockpit.");
assert(!server.includes("Le-E Conversation Capture"), "No separate Le-E Conversation Capture module should exist.");
assert(!server.includes("cockpitConversationCaptureHtml"), "Separate conversation capture renderer should be removed.");
assert(server.includes("Capture with Le-E"), "Unified Quick Capture should use Capture with Le-E button.");
assert(server.includes("/api/capture-inbox"), "Capture Inbox API must exist.");
assert(server.includes("captureInboxPageHtml"), "#capture-inbox route renderer must exist.");
assert(server.includes("\"capture-inbox\""), "#capture-inbox route must be registered.");
assert(server.includes("Route to Conversation Notes"), "Capture review page should route to Conversation Notes.");
assert(server.includes("Route to Morning Brief Inputs"), "Capture review page should route to Morning Brief Inputs.");
assert(server.includes("Route to Evening Reflection Inputs"), "Capture review page should route to Evening Reflection Inputs.");
assert(server.includes("Route to Notes & Decisions"), "Capture review page should route to Notes & Decisions.");
assert(server.includes("Route to Task"), "Capture review page should route to Task.");
assert(!/capture-inbox[\s\S]{0,2600}(send email|publish page|activate dashboard|enable live)/i.test(server), "Capture Inbox must not enable external controls.");

console.log("Le-E Quick Capture tests passed.");
