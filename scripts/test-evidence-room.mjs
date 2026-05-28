import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildEvidenceIndex,
  buildEvidenceOverview,
  generateEvidenceSummary
} from "./evidence-room.mjs";
import { buildOsHealthSnapshot } from "./os-health.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const baseState = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: false },
      facebook: { enabled: false }
    },
    openAIConfigured: true,
    accessControl: { authRequired: true, localFallbackOpen: false },
    supabaseStorage: { connected: true, ok: true }
  },
  evidencePackNotes: [
    {
      id: "evidence-rcap-activation",
      key: "rcap-production-activation-evidence-v1",
      title: "RCAP Production Activation Evidence",
      type: "production_activation",
      source: "RCAP Production Activation",
      partnerSlug: "rcap",
      status: "recorded",
      review_state: "review_required",
      timestamp: "2026-05-27T10:00:00.000Z",
      notes: "Review-only activation package created."
    }
  ],
  reports: [
    {
      id: "report-rcap-weekly",
      key: "rcap-weekly-report-draft-v1",
      title: "RCAP Weekly Activation Report Draft",
      reportType: "partner_weekly_activation_report",
      status: "draft",
      review_state: "review_required",
      generatedAt: "2026-05-27T11:00:00.000Z"
    }
  ],
  dataRoomItems: [
    {
      id: "dataroom-rcap-evidence",
      title: "RCAP production activation evidence note",
      itemType: "evidence_note",
      status: "draft",
      section: "RCAP proof",
      lastUpdated: "2026-05-27"
    }
  ],
  partnerProgramArtifacts: [
    {
      key: "rcap-proposal-draft-v1",
      title: "RCAP Proposal Draft",
      artifactType: "proposal",
      status: "draft",
      review_state: "needs_revision",
      updatedAt: "2026-05-27T12:00:00.000Z"
    }
  ],
  handoffPackets: [
    {
      key: "rcap-handoff-packet-v1",
      title: "RCAP Internal Handoff Packet",
      status: "internal_only",
      handoff_ready: false,
      updated_at: "2026-05-27T13:00:00.000Z"
    }
  ],
  soc2Evidence: [
    {
      id: "soc2-evidence-1",
      evidenceTitle: "SOC 2 Readiness Snapshot",
      controlArea: "Evidence Collection",
      evidenceStatus: "Ready for Review",
      evidenceQuality: "Acceptable",
      collectionDate: "2026-05-27",
      notes: "Readiness artifact for internal review."
    }
  ],
  auditHistory: [
    {
      id: "audit-1",
      action: "rcap review state changed",
      resourceType: "partner_program_artifact",
      resourceId: "rcap-proposal-draft-v1",
      timestamp: "2026-05-27T12:00:00.000Z"
    }
  ],
  activityEvents: [
    {
      id: "activity-1",
      eventType: "Evidence note created",
      title: "RCAP evidence recorded",
      relatedObjectType: "evidence_note",
      relatedObjectId: "rcap-production-activation-evidence-v1",
      createdAt: "2026-05-27T10:05:00.000Z"
    }
  ],
  tasks: [
    {
      id: "task-1",
      title: "Review RCAP evidence package",
      status: "open",
      priority: "high",
      source: "rcap",
      created_at: "2026-05-27T09:00:00.000Z"
    }
  ],
  operatingMemory: [
    {
      key: "operating-memory-2026-05-27",
      date: "2026-05-27",
      generated_at: "2026-05-27T18:00:00.000Z",
      moved_today: [{ title: "RCAP evidence package assembled", detail: "Ready for internal review." }]
    }
  ],
  dailyCloseouts: [
    {
      key: "daily-closeout-2026-05-27",
      date: "2026-05-27",
      generated_at: "2026-05-27T19:00:00.000Z",
      carry_forward: [{ title: "Review evidence room", detail: "Confirm proof before external movement." }]
    }
  ],
  partnerPrograms: [{ id: "partner-program-rcap", slug: "rcap", name: "RCAP", status: "activation_review" }],
  smokeTestRuns: [],
  osHealthSnapshots: [],
  evidenceSummaries: []
};

const index = buildEvidenceIndex(baseState, { now: "2026-05-28T12:00:00.000Z" });
assert(index.items.length >= 9, "Evidence index should collect proof from notes, reports, Data Room, SOC 2 readiness, audit, activity, and workflows.");
assert(index.items.some(item => item.source === "RCAP Production Activation"), "Evidence sources should include RCAP Production Activation.");
assert(index.items.some(item => item.source === "SOC 2 Readiness"), "Evidence sources should include SOC 2 Readiness.");
assert(index.items.every(item => item.title && item.type && item.source && item.proof_category), "Evidence items should have useful display fields.");
assert(index.sources.some(item => item.source === "Data Room"), "Evidence sources should group Data Room artifacts.");
assert(index.data_room_index.some(group => group.category === "RCAP proof"), "Data Room index should include RCAP proof.");
assert(index.filters.types.length > 0, "Evidence filters should include type options.");
assert(index.filters.sources.includes("RCAP Production Activation"), "Evidence filters should include source options.");
assert(index.filters.proof_categories.includes("investor") || index.filters.proof_categories.includes("partner"), "Evidence filters should include proof categories.");

const overview = buildEvidenceOverview(baseState, { now: "2026-05-28T12:00:00.000Z" });
assert(overview.total_evidence_items >= index.items.length, "Evidence overview should count evidence items.");
assert(overview.rcap_evidence_count > 0, "Evidence overview should count RCAP evidence.");
assert(overview.partner_evidence_count > 0, "Evidence overview should count partner evidence.");
assert(overview.soc2_readiness_evidence_count > 0, "Evidence overview should count SOC 2 Readiness evidence.");
assert(overview.data_room_item_count > 0, "Evidence overview should count Data Room items.");
assert(overview.report_count > 0, "Evidence overview should count reports.");
assert(Array.isArray(overview.missing_proof_warnings), "Evidence overview should produce missing proof warnings.");

const generated = generateEvidenceSummary(baseState, { now: "2026-05-28T12:05:00.000Z", actor: "owner_token" });
assert.equal(generated.summary.status, "review_ready", "Generate Evidence Summary should create review-ready internal artifact.");
assert.equal(generated.summary.review_only, true, "Evidence Summary must be review-only.");
assert.equal(generated.summary.external_side_effects, false, "Evidence Summary must not create external side effects.");
assert.equal(generated.summary.live_gates_count, 0, "Evidence Summary must preserve live gates at 0.");
assert.equal(generated.state.evidenceSummaries.length, 1, "Evidence Summary should save one internal summary artifact.");
assert(generated.state.auditHistory.some(item => item.action === "evidence summary generated"), "Evidence Summary should create audit entry.");
assert(generated.state.activityEvents.some(item => item.eventType === "Evidence Summary generated"), "Evidence Summary should create activity event.");
const generatedAgain = generateEvidenceSummary(generated.state, { now: "2026-05-28T12:10:00.000Z", actor: "owner_token" });
assert.equal(generatedAgain.state.evidenceSummaries.length, 1, "Evidence Summary should update today's summary instead of duplicating.");

const health = buildOsHealthSnapshot(generated.state, {
  now: "2026-05-28T12:15:00.000Z",
  date: "2026-05-28",
  supabaseDbConnected: true,
  supabaseStorageConnected: true,
  openAIConfigured: true,
  ownerTokenAuthConfigured: true,
  localFallbackAvailable: true
});
assert(health.workflow_health.evidence_room, "OS Health should include evidence room status.");
assert(health.data_freshness.latest_evidence_summary_timestamp, "OS Health should include latest evidence summary timestamp.");
assert("missing_evidence_warnings" in health, "OS Health should include missing evidence warnings.");
assert("stale_evidence_warnings" in health, "OS Health should include stale evidence warnings.");

assert(serverSource.includes("function cockpitEvidenceRoomHtml"), "Cockpit Evidence Room card must render.");
assert(serverSource.includes("evidenceRoomPageHtml"), "#evidence-room route renderer must exist.");
assert(serverSource.includes("\"evidence-room\""), "#evidence-room route must be registered.");
assert(serverSource.includes("Evidence Overview"), "Evidence overview must render.");
assert(serverSource.includes("Evidence Sources"), "Evidence sources must render.");
assert(serverSource.includes("Evidence List"), "Evidence list must render.");
assert(serverSource.includes("Data Room Index"), "Data Room index must render.");
assert(serverSource.includes("Generate Evidence Summary"), "Generate Evidence Summary action must render.");
assert(serverSource.includes("/api/evidence-room/summary"), "Evidence Summary endpoint must exist.");
assert(!/evidence-room[\s\S]{0,5000}(send email|publish page|activate dashboard|Partner Journey API|child_process|execCommand|spawn\()/i.test(serverSource), "Evidence Room must not expose external controls or browser shell execution.");
const evidenceRoomSource = serverSource.match(/function evidenceRoomPageHtml[\s\S]*?function [a-zA-Z0-9]+PageHtml/)?.[0] || "";
assert(evidenceRoomSource.includes("SOC 2 Readiness"), "Evidence Room must use SOC 2 Readiness language.");
assert(!/SOC 2 compliant|SOC 2 certified/i.test(evidenceRoomSource), "Evidence Room must not claim SOC 2 compliance or certification.");
assert.equal(generated.summary.no_external_actions_confirmation, "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey calls, no external systems contacted.", "Evidence Summary must confirm no external actions.");

console.log("Evidence Room tests passed.");
