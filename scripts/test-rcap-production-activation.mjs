import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRcapProductionActivation, rcapActivationStatus } from "./production-activation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

const baseState = {
  runtime: {
    livePostingGates: {
      linkedin: { enabled: false },
      facebook: { enabled: false },
      instagram: { enabled: false },
      tiktok: { enabled: false },
      x: { enabled: false }
    }
  },
  partners: [],
  tasks: [],
  partnerPrograms: [],
  partnerProgramArtifacts: [],
  reports: [],
  dataRoomItems: [],
  evidencePackNotes: [],
  activityEvents: [],
  auditHistory: []
};

const first = ensureRcapProductionActivation(baseState, { now: "2026-05-27T12:00:00.000Z" });
const second = ensureRcapProductionActivation(first.state, { now: "2026-05-27T12:05:00.000Z" });
const status = rcapActivationStatus(second.state);

assert.equal(status.partner, "RCAP");
assert.equal(status.review_only, true);
assert.equal(status.external_side_effects, false);
assert.equal(status.live_gates, 0);
assert.equal(status.proposal_task.status, "exists");
assert.equal(status.proposal_draft.status, "exists");
assert.equal(status.partner_page_draft.status, "exists");
assert.equal(status.dashboard_readiness.status, "exists");
assert.equal(status.weekly_report_draft.status, "exists");
assert.equal(status.evidence_note.status, "exists");

assert.equal(second.state.partners.filter((item) => item.slug === "rcap").length, 1, "RCAP partner should be idempotent.");
assert.equal(second.state.tasks.filter((item) => item.id === "task-rcap-proposal-draft-v1").length, 1, "Proposal task should not duplicate.");
assert.equal(second.state.partnerProgramArtifacts.filter((item) => item.key === "rcap-proposal-draft-v1").length, 1, "Proposal draft should not duplicate.");
assert.equal(second.state.partnerProgramArtifacts.filter((item) => item.key === "rcap-partner-page-draft-v1").length, 1, "Partner page draft should not duplicate.");
assert.equal(second.state.partnerProgramArtifacts.filter((item) => item.key === "rcap-dashboard-readiness-v1").length, 1, "Dashboard readiness should not duplicate.");
assert.equal(second.state.reports.filter((item) => item.key === "rcap-weekly-report-draft-v1").length, 1, "Weekly report draft should not duplicate.");
assert.equal(second.state.evidencePackNotes.filter((item) => item.key === "rcap-production-activation-evidence-v1").length, 1, "Evidence note should not duplicate.");

for (const artifact of second.state.partnerProgramArtifacts.filter((item) => item.partnerSlug === "rcap")) {
  assert.equal(artifact.reviewOnly, true, artifact.key + " should be review-only.");
  assert.notEqual(artifact.status, "published", artifact.key + " must not be published.");
}
assert.equal(second.state.partnerProgramArtifacts.find((item) => item.key === "rcap-partner-page-draft-v1").published, false);
assert.equal(second.state.partnerProgramArtifacts.find((item) => item.key === "rcap-dashboard-readiness-v1").dashboardLive, false);
assert.equal(second.state.partnerProgramArtifacts.find((item) => item.key === "rcap-dashboard-readiness-v1").activationAllowed, false);
assert.equal(second.state.reports.find((item) => item.key === "rcap-weekly-report-draft-v1").reviewOnly, true);
assert.equal(second.state.evidencePackNotes.find((item) => item.key === "rcap-production-activation-evidence-v1").noEmailSent, true);
assert.equal(second.state.evidencePackNotes.find((item) => item.key === "rcap-production-activation-evidence-v1").noPostPublished, true);
assert.equal(second.state.evidencePackNotes.find((item) => item.key === "rcap-production-activation-evidence-v1").noPartnerPagePublished, true);
assert.equal(second.state.evidencePackNotes.find((item) => item.key === "rcap-production-activation-evidence-v1").noDashboardActivated, true);

assert.match(server, /\/api\/production-activation\/rcap/, "RCAP activation endpoint should be registered.");
assert.match(server, /authorizeRequest\(request, url, process\.env\)/, "Hosted auth should still run before endpoints.");
const startRouteIndex = server.indexOf('url.pathname === "/api/production-activation/rcap/start"');
assert.notEqual(startRouteIndex, -1, "Activation start route should exist.");
const startRouteSnippet = server.slice(startRouteIndex, startRouteIndex + 900);
assert.doesNotMatch(startRouteSnippet, /state:\s*withPublicChannelSetup/, "Activation start endpoint must return a compact summary, not the full app state.");
assert.match(startRouteSnippet, /activation_status:\s*rcapActivationStatus/, "Activation start endpoint should return compact activation status.");
assert.match(server, /rcapActivationClientStatus/, "Cockpit should keep a compact activation status for UI refreshes.");
assert.match(server, /layout: cockpit-grid-fixed-v1/, "Fixed cockpit marker should remain present.");
assert.match(server, /nav: topnav-fixed-v1/, "Fixed top nav marker should remain present.");
assert.match(server, /liveGatesCount:\s*Object\.values/, "Health endpoint should still report live gates.");

console.log("RCAP production activation tests passed");
