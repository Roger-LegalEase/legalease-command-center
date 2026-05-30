import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saveTodayOperatingMemory, synthesizeOperatingMemory } from "./operating-memory.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const sampleState = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: false },
      facebook: { enabled: false }
    }
  },
  partnerProgramArtifacts: [
    { key: "rcap-proposal-draft-v1", title: "RCAP Proposal Draft", review_state: "needs_revision", review_updated_at: "2026-05-27T09:00:00.000Z" },
    { key: "rcap-partner-page-draft-v1", title: "RCAP Partner Page Draft", review_state: "review_required", review_updated_at: "2026-05-27T09:00:00.000Z" },
    { key: "rcap-dashboard-readiness-v1", title: "RCAP Dashboard Readiness", review_state: "blocked", blocker_reason: "Dashboard requirements are not confirmed.", review_updated_at: "2026-05-27T09:30:00.000Z" },
    { key: "rcap-manual-review-checklist-v1", title: "RCAP Manual Review Checklist", review_state: "review_required", review_updated_at: "2026-05-27T09:40:00.000Z" }
  ],
  reports: [
    { key: "rcap-weekly-report-draft-v1", title: "RCAP Weekly Report Draft", review_state: "approved", review_updated_at: "2026-05-27T10:00:00.000Z" }
  ],
  evidencePackNotes: [
    { key: "rcap-production-activation-evidence-v1", title: "RCAP Evidence Note", review_state: "approved", review_updated_at: "2026-05-27T10:30:00.000Z" }
  ],
  tasks: [
    { id: "task-rcap-proposal-draft-v1", title: "Draft RCAP partner proposal", status: "open", priority: "high", review_state: "review_required", review_updated_at: "2026-05-27T11:00:00.000Z" },
    { id: "task-general", title: "Confirm RCAP approval authority", status: "blocked", priority: "high", escalationReason: "Needs Roger confirmation.", createdAt: "2026-05-27T11:30:00.000Z" }
  ],
  partners: [
    { id: "partner-rcap", slug: "rcap", name: "RCAP", missing_external_details: true, missingExternalDetailsList: ["primary contact", "approval authority"] }
  ],
  partnerPrograms: [
    { id: "partner-program-rcap", slug: "rcap", name: "RCAP", jurisdiction: "TBD", targetAudience: "TBD", packageTier: "TBD" }
  ],
  activityEvents: [
    { id: "activity-review", eventType: "RCAP review state changed", title: "Dashboard Readiness blocked", createdAt: "2026-05-27T12:00:00.000Z" }
  ],
  auditHistory: [
    { id: "audit-review", action: "rcap artifact review state changed", timestamp: "2026-05-27T12:05:00.000Z" }
  ]
};

const memory = synthesizeOperatingMemory(sampleState, {
  now: "2026-05-27T18:00:00.000Z",
  date: "2026-05-27"
});

assert.equal(memory.date, "2026-05-27", "Memory record should include date.");
assert.equal(memory.key, "operating-memory-2026-05-27", "Memory record should use stable day key.");
assert(Array.isArray(memory.moved_today), "moved_today must be an array.");
assert(Array.isArray(memory.decisions_made), "decisions_made must be an array.");
assert(Array.isArray(memory.still_blocked), "still_blocked must be an array.");
assert(Array.isArray(memory.carry_forward), "carry_forward must be an array.");
assert(Array.isArray(memory.resurface_tomorrow), "resurface_tomorrow must be an array.");
assert(Array.isArray(memory.do_not_carry_forward), "do_not_carry_forward must be an array.");
assert(Array.isArray(memory.risk_notes), "risk_notes must be an array.");
assert.equal(memory.live_gates_count, 0, "Live gates must remain 0.");
assert.equal(memory.external_actions_confirmation, "No emails sent, no posts published, no partner pages published, no dashboards activated, no external systems contacted.", "Memory must confirm no external actions.");
assert(memory.carry_forward.some(item => /RCAP|handoff|review|task/i.test(item.title + " " + item.detail)), "Carry-forward items should reflect daily loop or RCAP review state.");
assert(memory.still_blocked.some(item => /Dashboard|blocked|primary contact|approval authority/i.test(item.title + " " + item.detail)), "Blocked items should reflect RCAP blockers or missing details.");
assert(memory.resurface_tomorrow.length > 0, "Resurface tomorrow should contain carry-forward guidance.");

const saved = saveTodayOperatingMemory(sampleState, {
  now: "2026-05-27T18:00:00.000Z",
  date: "2026-05-27",
  actor: "owner_token"
});
assert.equal(saved.record.key, "operating-memory-2026-05-27", "Saved memory should use stable key.");
assert.equal(saved.state.operatingMemory.length, 1, "Save should create one memory record.");
assert(saved.state.auditHistory[0].action === "operating memory saved", "Save should create audit entry.");
assert(saved.state.activityEvents[0].eventType === "Operating memory saved", "Save should create activity event.");

const savedAgain = saveTodayOperatingMemory(saved.state, {
  now: "2026-05-27T19:00:00.000Z",
  date: "2026-05-27",
  actor: "owner_token"
});
assert.equal(savedAgain.state.operatingMemory.length, 1, "Save should update today's memory instead of duplicating.");

assert(serverSource.includes("function cockpitOperatingMemoryHtml"), "Cockpit memory section must render.");
assert(serverSource.includes("Operating Memory"), "Operating Memory label must exist.");
assert(serverSource.includes("Moved Today"), "Moved Today section must render.");
assert(serverSource.includes("Carry Forward"), "Carry Forward section must render.");
assert(serverSource.includes("Resurface Tomorrow"), "Resurface Tomorrow section must render.");
assert(serverSource.includes("Still Blocked"), "Still Blocked section must render.");
assert(serverSource.includes("operatingMemoryPageHtml"), "Operating Memory route renderer must exist.");
assert(serverSource.includes("\"operating-memory\""), "#operating-memory route must be registered.");
assert(serverSource.includes("/api/operating-memory/today/save"), "Save Today endpoint must exist.");
assert(serverSource.includes("Save Today’s Operating Memory"), "Review-only save button must render.");
assert(!/operating-memory[\s\S]{0,2400}(send email|publish page|activate dashboard|enable live)/i.test(serverSource), "Operating Memory must not enable external controls.");

console.log("operating memory tests passed");
