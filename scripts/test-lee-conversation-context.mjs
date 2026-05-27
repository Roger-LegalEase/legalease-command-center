import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildEveningReflection,
  buildMorningBrief,
  createConversationNote,
  updateConversationNoteAction
} from "./lee-conversation-context.mjs";
import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";
import { synthesizeOperatingMemory } from "./operating-memory.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const baseState = {
  runtime: { livePostingGates: { linkedin: { enabled: false } } },
  conversationNotes: [],
  tasks: [],
  partnerProgramArtifacts: [],
  reports: [],
  evidencePackNotes: [],
  partners: [],
  partnerPrograms: [],
  auditHistory: [],
  activityEvents: []
};

const created = createConversationNote(baseState, {
  source_label: "Roger and Le-E planning note",
  raw_note: "Decision: make the RCAP dashboard readiness blocker the first move tomorrow. Carry forward proposal edits. Do not touch live publishing.",
  linked_workflow: "RCAP",
  linked_partner: "RCAP",
  priority: "high"
}, { now: "2026-05-27T18:00:00.000Z", actor: "owner_token" });

assert.equal(created.note.source_type, "manual_conversation_capture", "Note source type should be manual capture.");
assert.equal(created.note.review_state, "review_required", "Default review_state should be review_required.");
assert(created.note.classification.length > 0, "Classification should exist.");
assert(created.note.suggested_brief_updates.length > 0, "Suggested Morning Brief updates should exist.");
assert(created.note.suggested_reflection_updates.length > 0, "Suggested Evening Reflection updates should exist.");
assert(created.state.auditHistory[0].action === "conversation note saved", "Save should create audit entry.");
assert(created.state.activityEvents[0].eventType === "Conversation note saved", "Save should create activity event.");

const reviewed = updateConversationNoteAction(created.state, created.note.id, "mark_reviewed", {
  now: "2026-05-27T18:10:00.000Z",
  actor: "owner_token"
});
assert.equal(reviewed.note.review_state, "reviewed", "Note can be marked reviewed.");

const morningApplied = updateConversationNoteAction(reviewed.state, created.note.id, "apply_morning_brief", {
  now: "2026-05-27T18:20:00.000Z",
  actor: "owner_token"
});
assert.equal(morningApplied.note.review_state, "applied_morning_brief", "Note can be applied to Morning Brief inputs.");
assert.equal(morningApplied.note.applied_to_morning_brief, true, "Morning Brief applied flag should be set.");

const reflectionApplied = updateConversationNoteAction(morningApplied.state, created.note.id, "apply_evening_reflection", {
  now: "2026-05-27T18:30:00.000Z",
  actor: "owner_token"
});
assert.equal(reflectionApplied.note.review_state, "applied_evening_reflection", "Note can be applied to Evening Reflection inputs.");
assert.equal(reflectionApplied.note.applied_to_evening_reflection, true, "Evening Reflection applied flag should be set.");

const carried = updateConversationNoteAction(reflectionApplied.state, created.note.id, "carry_forward", {
  now: "2026-05-27T18:40:00.000Z",
  actor: "owner_token"
});
assert.equal(carried.note.review_state, "carry_forward", "Note can be carried forward.");

const brief = buildMorningBrief(carried.state);
assert(brief.top_3_actions.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Applied notes should affect Morning Brief synthesis.");

const reflection = buildEveningReflection(carried.state);
assert(reflection.carry_forward.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Applied notes should affect Evening Reflection synthesis.");

const memory = synthesizeOperatingMemory(carried.state, { now: "2026-05-27T19:00:00.000Z", date: "2026-05-27" });
assert(memory.carry_forward.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Applied notes should affect Operating Memory synthesis.");

const loop = buildDailyOperatingLoop(carried.state);
assert(loop.top3.some(item => /RCAP|dashboard|proposal/i.test(item.title + " " + item.detail)), "Reviewed/applied notes should affect Daily Operating Loop.");

const ignored = updateConversationNoteAction(carried.state, created.note.id, "ignore", {
  now: "2026-05-27T18:50:00.000Z",
  actor: "owner_token"
});
assert.equal(ignored.note.review_state, "ignored", "Note can be ignored.");
assert(!buildMorningBrief(ignored.state).top_3_actions.some(item => /dashboard readiness blocker/i.test(item.title + " " + item.detail)), "Ignored notes should not affect Morning Brief.");
assert(!buildEveningReflection(ignored.state).carry_forward.some(item => /dashboard readiness blocker/i.test(item.title + " " + item.detail)), "Ignored notes should not affect Evening Reflection.");
assert(!synthesizeOperatingMemory(ignored.state, { now: "2026-05-27T20:00:00.000Z", date: "2026-05-27" }).carry_forward.some(item => /dashboard readiness blocker/i.test(item.title + " " + item.detail)), "Ignored notes should not affect Operating Memory.");
assert.equal(ignored.state.auditHistory[0].action, "conversation note ignored", "Ignore should create audit entry.");
assert.equal(ignored.state.activityEvents[0].eventType, "Conversation note ignored", "Ignore should create activity entry.");
assert.equal(buildDailyOperatingLoop(ignored.state).liveGatesCount, 0, "Live gates must remain 0.");

assert(serverSource.includes("Le-E Conversation Capture"), "Cockpit capture module must render.");
assert(serverSource.includes("conversationNotesPageHtml"), "#conversation-notes route renderer must exist.");
assert(serverSource.includes("\"conversation-notes\""), "#conversation-notes route must be registered.");
assert(serverSource.includes("/api/conversation-notes"), "Conversation note API must exist.");
assert(serverSource.includes("Mark Reviewed"), "Review controls must render.");
assert(serverSource.includes("Apply to Today's Brief Inputs"), "Morning Brief apply control must render.");
assert(serverSource.includes("Apply to Evening Reflection Inputs"), "Evening Reflection apply control must render.");
assert(!/conversation-notes[\s\S]{0,2600}(send email|publish page|activate dashboard|enable live)/i.test(serverSource), "Conversation context must not enable external controls.");

console.log("Le-E conversation context tests passed.");
