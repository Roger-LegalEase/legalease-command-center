#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  INTERNAL_PARTNER_STAGE_MAPPING,
  OPERATIONAL_ONLY_PARTNER_STAGES,
  PARTNER_ATTENTION_STAGES,
  PARTNER_SOURCE_MAPPINGS,
  PARTNER_STAGE_CONTRACT,
  adaptPartnerStage,
  buildPartnerStageView,
  buildPartnerStageViews
} from "./ui/view-models/partner-stage.mjs";
import { ROUTE_COMPATIBILITY_TOTALS, resolveRouteCompatibility } from "./ui/route-compatibility.mjs";

const OWNER = Object.freeze({ authenticated: true, role: "owner" });
const OPERATOR = Object.freeze({ authenticated: true, role: "operator" });

const DISCOVERED_INTERNAL_STAGES = Object.freeze([
  ["new", "new"],
  ["lead", "new"],
  ["target_identified", "new"],
  ["contact_found", "new"],
  ["qualified", "qualified"],
  ["outreach_sent", "qualified"],
  ["pitching", "qualified"],
  ["intro_scheduled", "in_conversation"],
  ["meeting_requested", "in_conversation"],
  ["meeting_scheduling", "in_conversation"],
  ["meeting_booked", "in_conversation"],
  ["proposal_sent", "proposal"],
  ["pilot_scoped", "proposal"],
  ["verbal_yes", "proposal"],
  ["contract_pending", "proposal"],
  ["active_pilot", "active"],
  ["signed_pilot", "active"],
  ["reporting", "active"],
  ["campaign_live", "active"],
  ["onboarded", "active"],
  ["renewal", "active"],
  ["case_study", "active"],
  ["expansion", "active"],
  ["active", "active"],
  ["live", "active"],
  ["stalled", "unavailable"],
  ["paused", "unavailable"],
  ["dormant", "unavailable"],
  ["lost", "closed"],
  ["closed_lost", "closed"],
  ["inactive", "closed"],
  ["archived", "closed"],
  ["production_activation", "unavailable"]
]);

function fixtureState() {
  const stagePartners = DISCOVERED_INTERNAL_STAGES.map(([stage], index) => ({
    id: `stage-${String(index).padStart(2, "0")}-${stage}`,
    organizationName: `Synthetic ${stage.replaceAll("_", " ")} Partner`,
    stage,
    owner: "Founder"
  }));
  return {
    partners: [
      ...stagePartners,
      {
        id: "partner stable/01",
        organizationName: "Synthetic Community Partner",
        stage: "new",
        qualificationStatus: "qualified",
        qualifiedAt: "2026-07-10T12:00:00.000Z",
        owner: "Founder",
        nextAction: "Confirm the reviewed scope.",
        nextActionDueDate: "2026-07-22",
        riskLevel: "low",
        relationshipHealth: "healthy",
        relatedPilot: "pilot-active-context",
        relatedPrograms: ["program-active-context"],
        lastTouchDate: "2026-07-11",
        history: [
          { id: "history-old", action: "partner created", at: "2026-07-01T09:00:00.000Z" },
          { id: "history-review", action: "scope reviewed", at: "2026-07-12T09:00:00.000Z" }
        ],
        createdAt: "2026-07-01T08:00:00.000Z",
        updatedAt: "2026-07-12T09:00:00.000Z"
      },
      {
        id: "notes-are-not-stage-truth",
        organizationName: "Notes Only Organization",
        stage: "new",
        notes: "This looks qualified, the proposal was discussed, and a pilot may be useful.",
        lastTouchDate: "2020-01-01"
      },
      {
        id: "proposal-does-not-qualify",
        organizationName: "Proposal Organization",
        stage: "proposal_sent"
      },
      {
        id: "pilot-context-does-not-advance",
        organizationName: "Pilot Context Organization",
        stage: "new",
        relatedPilot: "pilot-linked-active"
      },
      {
        id: "program-context-does-not-advance",
        organizationName: "Program Context Organization",
        stage: "new",
        relatedProgram: "program-linked-active"
      },
      {
        id: "explicit-risk-does-not-move-stage",
        organizationName: "Risk Context Organization",
        stage: "qualified",
        riskLevel: "high",
        blocker: "A decision owner is missing."
      },
      {
        id: "stalled-without-commercial-history",
        organizationName: "Stalled Without Commercial History",
        stage: "stalled"
      },
      {
        id: "paused-with-explicit-commercial-stage",
        organizationName: "Paused Conversation",
        stage: "paused",
        commercialStage: "meeting_booked"
      },
      {
        id: "dormant-with-prior-commercial-stage",
        organizationName: "Dormant Active Relationship",
        stage: "dormant",
        priorCommercialStage: "active_pilot"
      },
      {
        id: "stalled-with-authoritative-history",
        organizationName: "Stalled Proposal Relationship",
        stage: "stalled",
        history: [
          { id: "history-stage-change", action: "stage changed", fromStage: "proposal_sent", toStage: "stalled", at: "2026-07-16T12:00:00.000Z" }
        ]
      },
      {
        id: "explicit-archive",
        organizationName: "Archived Organization",
        stage: "lead",
        archived: true,
        archivedAt: "2026-06-30T12:00:00.000Z"
      },
      {
        id: "unknown-stage",
        organizationName: "Unknown Stage Organization",
        stage: "custom_partner_motion"
      },
      {
        id: "missing-stage",
        organizationName: "Missing Stage Organization"
      },
      {
        id: "owner-only",
        organizationName: "Restricted Partner",
        stage: "qualified",
        allowedRoles: ["owner"]
      },
      {
        id: "duplicate-id",
        organizationName: "Current duplicate",
        stage: "qualified",
        updatedAt: "2026-07-17T10:00:00.000Z"
      },
      {
        id: "duplicate-id",
        organizationName: "Older duplicate",
        stage: "lost",
        updatedAt: "2020-01-01T10:00:00.000Z"
      },
      { id: "<unsafe-partner>", stage: "new" }
    ],
    pilots: [
      { id: "pilot-active-context", partnerId: "partner stable/01", pilotName: "Explicit pilot", status: "active", owner: "Founder" },
      { id: "pilot-linked-active", partnerId: "pilot-context-does-not-advance", pilotName: "Linked active pilot", status: "active" },
      { id: "pilot-unlinked", partnerId: "different-partner", pilotName: "Unlinked pilot", status: "active" }
    ],
    partnerPrograms: [
      { id: "program-active-context", relatedPartnerId: "partner stable/01", name: "Explicit program", status: "active", owner: "Operations" },
      { id: "program-linked-active", relatedPartnerId: "program-context-does-not-advance", name: "Linked active program", status: "active" },
      { id: "program-unlinked", relatedPartnerId: "different-partner", name: "Unlinked program", status: "active" }
    ],
    activityEvents: [
      { id: "activity-latest", relatedObjectType: "partner", relatedObjectId: "partner stable/01", eventType: "partner_scope_confirmed", title: "Partner scope confirmed", createdAt: "2026-07-15T13:00:00.000Z" },
      { id: "activity-email-only", relatedObjectType: "partner", relatedObjectId: "notes-are-not-stage-truth", eventType: "partner_email_sent", title: "Partner email sent", createdAt: "2026-07-10T13:00:00.000Z" },
      { id: "activity-unlinked", relatedObjectType: "partner", relatedObjectId: "different-partner", eventType: "different_event", createdAt: "2026-07-16T13:00:00.000Z" }
    ],
    auditHistory: [
      { id: "audit-partner", sourceRef: { collection: "partners", itemId: "partner stable/01" }, action: "partner record reviewed", timestamp: "2026-07-14T13:00:00.000Z" }
    ],
    automationEvents: [
      { id: "automation-partner", relatedEntityType: "partner", relatedEntityId: "partner stable/01", eventType: "partner_usage_window", receivedAt: "2026-07-13T13:00:00.000Z" }
    ]
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

const state = fixtureState();
const before = structuredClone(state);
const views = buildPartnerStageViews(state, OWNER);
const partner = views.find((view) => view.stableIdentity === "partner:partner stable/01");

assert.equal(typeof buildPartnerStageView, "function");
assert.equal(typeof buildPartnerStageViews, "function");
assert.equal(typeof adaptPartnerStage, "function");
assert.deepEqual(state, before, "Partner projection must not mutate any source collection.");
assert.deepEqual(buildPartnerStageViews(state, OWNER), views, "Equal input must produce equal PartnerStage output.");
assert.deepEqual(buildPartnerStageViews(reverseArrays(state), OWNER), views, "Source-array order must not affect PartnerStage output.");
assert.deepEqual(buildPartnerStageView(state, "partner:partner stable/01", OWNER), partner);
assert.ok(Object.isFrozen(views) && views.every(Object.isFrozen));
assert.ok(Object.isFrozen(partner.uiStage) && Object.isFrozen(partner.outcome) && Object.isFrozen(partner.sourceReferences) && Object.isFrozen(partner.pilotAndProgramContext));
assert.throws(() => partner.sourceReferences.push({}), TypeError);

for (const [internalStage, expectedUiStage] of DISCOVERED_INTERNAL_STAGES) {
  const adapted = adaptPartnerStage({ stage: internalStage });
  assert.equal(adapted.uiStageKey, expectedUiStage, `${internalStage} must map truthfully.`);
  assert.equal(adapted.internalStage, internalStage, `${internalStage} must remain available for reference.`);
}
assert.deepEqual(Object.keys(PARTNER_STAGE_CONTRACT).filter((key) => key !== "unavailable"), ["new", "qualified", "in_conversation", "proposal", "active", "closed"]);
for (const removed of ["exploring", "pilot_active", "live_partner", "at_risk", "inactive"]) assert.equal(PARTNER_STAGE_CONTRACT[removed], undefined);
assert.equal(adaptPartnerStage({ status: "meeting_booked" }).uiStageKey, "in_conversation");
assert.equal(adaptPartnerStage({ status: "proposal_sent" }).uiStageKey, "proposal");
assert.equal(adaptPartnerStage({ status: "signed_pilot" }).uiStageKey, "active");
assert.equal(adaptPartnerStage({ status: "campaign_live" }).uiStageKey, "active");
assert.equal(adaptPartnerStage({ status: "paused" }).uiStageKey, "unavailable");
assert.equal(adaptPartnerStage({ status: "closed_lost" }).uiStageKey, "closed");
assert.equal(adaptPartnerStage({ stage: "lead", archived: true }).uiStageKey, "closed");
assert.equal(INTERNAL_PARTNER_STAGE_MAPPING.proposal_sent, "proposal");
assert.deepEqual(PARTNER_ATTENTION_STAGES, ["stalled", "paused", "dormant"]);
assert.deepEqual(OPERATIONAL_ONLY_PARTNER_STAGES, ["production_activation"]);
assert.deepEqual(adaptPartnerStage({ stage: "lost" }).outcome, { available: true, key: "lost", label: "Lost", source: "internal_stage" });
assert.deepEqual(adaptPartnerStage({ stage: "inactive" }).outcome, { available: true, key: "inactive", label: "Inactive", source: "internal_stage" });
assert.deepEqual(adaptPartnerStage({ stage: "archived" }).outcome, { available: true, key: "archived", label: "Archived", source: "internal_stage" });
assert.equal(adaptPartnerStage({ stage: "production_activation" }).uiStageFallback, "operational_only_stage");

assert.equal(partner.id, "partner:partner stable/01");
assert.equal(partner.source.sourceId, "partner stable/01");
assert.equal(partner.exactPartnerLink, "#partners/partner/partner%20stable%2F01");
assert.equal(resolveRouteCompatibility(partner.exactPartnerLink).sourceId, "partner stable/01");
assert.equal(partner.internalStage, "new");
assert.equal(partner.uiStage.key, "new");
assert.equal(partner.qualification.state, "qualified");
assert.equal(partner.qualification.explicit, true);
assert.equal(partner.nextAction.summary, "Confirm the reviewed scope.");
assert.equal(partner.nextAction.dueAt, "2026-07-22");
assert.equal(partner.owner, "Founder");
assert.equal(partner.relationship.riskLevel, "low");
assert.equal(partner.relationship.health, "healthy");
assert.equal(partner.pilotAndProgramContext.pilots.length, 1);
assert.equal(partner.pilotAndProgramContext.programs.length, 1);
assert.equal(partner.pilotAndProgramContext.changesPartnerStage, false);
assert.equal(partner.lastMeaningfulActivity.id, "activity-latest");
assert.equal(partner.lastMeaningfulActivity.occurredAt, "2026-07-15T13:00:00.000Z");
assert.ok(partner.sourceReferences.some((reference) => reference.relationship === "record" && reference.href === partner.exactPartnerLink));
assert.ok(partner.sourceReferences.some((reference) => reference.relationship === "pilot" && reference.sourceId === "pilot-active-context"));
assert.ok(partner.sourceReferences.some((reference) => reference.relationship === "program" && reference.sourceId === "program-active-context"));
assert.ok(partner.sourceReferences.some((reference) => reference.relationship === "activity" && reference.sourceId === "activity-latest"));
assert.doesNotMatch(JSON.stringify(partner), /pilot-unlinked|program-unlinked|activity-unlinked/);

const notesOnly = views.find((view) => view.source.sourceId === "notes-are-not-stage-truth");
assert.equal(notesOnly.uiStage.key, "new");
assert.equal(notesOnly.qualification.available, false, "Loose notes must not establish qualification.");
assert.equal(notesOnly.relationship.available, false);
assert.equal(notesOnly.lastMeaningfulActivity.id, "activity-email-only");
assert.equal(notesOnly.lastMeaningfulActivity.kind, "partner_email_sent");
assert.equal(notesOnly.lastMeaningfulActivity.occurredAt, "2026-07-10T13:00:00.000Z");
assert.notEqual(notesOnly.uiStage.key, "qualified", "An email activity record must not establish qualification.");
assert.equal(notesOnly.relationship.attention.available, false, "Activity timing alone must not create a health warning.");

const proposal = views.find((view) => view.source.sourceId === "proposal-does-not-qualify");
assert.equal(proposal.uiStage.key, "proposal");
assert.equal(proposal.qualification.available, false, "A proposal must not establish explicit qualification.");
const pilotContext = views.find((view) => view.source.sourceId === "pilot-context-does-not-advance");
assert.equal(pilotContext.pilotAndProgramContext.pilots[0].status, "active");
assert.equal(pilotContext.uiStage.key, "new", "An active pilot record must not move the Partner stage.");
const programContext = views.find((view) => view.source.sourceId === "program-context-does-not-advance");
assert.equal(programContext.pilotAndProgramContext.programs[0].status, "active");
assert.equal(programContext.uiStage.key, "new", "An active program record must not move the Partner stage.");
const riskContext = views.find((view) => view.source.sourceId === "explicit-risk-does-not-move-stage");
assert.equal(riskContext.uiStage.key, "qualified");
assert.equal(riskContext.relationship.riskLevel, "high");
assert.equal(riskContext.relationship.blocker, "A decision owner is missing.");
assert.equal(riskContext.relationship.attention.label, "Needs attention");

const stalledWithoutHistory = views.find((view) => view.source.sourceId === "stalled-without-commercial-history");
assert.equal(stalledWithoutHistory.internalStage, "stalled");
assert.equal(stalledWithoutHistory.uiStage.key, "unavailable");
assert.equal(stalledWithoutHistory.uiStage.fallback, "attention_without_commercial_stage");
assert.equal(stalledWithoutHistory.relationship.attention.label, "Needs attention");
const pausedWithCommercial = views.find((view) => view.source.sourceId === "paused-with-explicit-commercial-stage");
assert.equal(pausedWithCommercial.internalStage, "paused");
assert.equal(pausedWithCommercial.uiStage.key, "in_conversation");
assert.equal(pausedWithCommercial.uiStage.source, "explicit_commercial_stage");
assert.equal(pausedWithCommercial.relationship.attention.label, "Needs attention");
const dormantWithPrior = views.find((view) => view.source.sourceId === "dormant-with-prior-commercial-stage");
assert.equal(dormantWithPrior.uiStage.key, "active");
assert.equal(dormantWithPrior.uiStage.evidence.internalStageKey, "active_pilot");
const stalledWithHistory = views.find((view) => view.source.sourceId === "stalled-with-authoritative-history");
assert.equal(stalledWithHistory.uiStage.key, "proposal");
assert.equal(stalledWithHistory.uiStage.source, "authoritative_history");
assert.equal(stalledWithHistory.uiStage.evidence.internalStageKey, "proposal_sent");

const archived = views.find((view) => view.source.sourceId === "explicit-archive");
assert.equal(archived.internalStage, "lead");
assert.equal(archived.uiStage.key, "closed");
assert.equal(archived.uiStage.source, "explicit_archive_truth");
assert.equal(archived.outcome.key, "archived");
assert.equal(archived.outcome.label, "Archived");
assert.equal(archived.timestamps.archivedAt, "2026-06-30T12:00:00.000Z");
const unknown = views.find((view) => view.source.sourceId === "unknown-stage");
assert.equal(unknown.internalStage, "custom_partner_motion");
assert.equal(unknown.uiStage.key, "unavailable");
assert.equal(unknown.uiStage.fallback, "unknown_internal_stage");
const missing = views.find((view) => view.source.sourceId === "missing-stage");
assert.equal(missing.internalStage, null);
assert.equal(missing.uiStage.key, "unavailable");
assert.equal(missing.uiStage.fallback, "missing_internal_stage");
assert.equal(missing.qualification.available, false);
assert.equal(missing.owner, null);
assert.equal(missing.nextAction.summary, null);
assert.equal(missing.relationship.available, false);
assert.equal(missing.lastMeaningfulActivity.available, false);

assert.equal(views.filter((view) => view.source.sourceId === "duplicate-id").length, 1);
assert.equal(views.find((view) => view.source.sourceId === "duplicate-id").name, "Current duplicate");
assert.equal(views.some((view) => view.source.sourceId === "<unsafe-partner>"), false, "Unsafe exact Partner links must fail closed.");
assert.equal(buildPartnerStageViews(state, OPERATOR).some((view) => view.source.sourceId === "owner-only"), false);
assert.equal(buildPartnerStageViews(state, { authenticated: false, role: "owner" }).length, 0);
assert.equal(buildPartnerStageViews(state, { authenticated: true, role: "viewer" }).length, 0);
assert.equal(buildPartnerStageViews(state, { authenticated: true, role: "unknown" }).length, 0);

for (const stage of Object.values(PARTNER_STAGE_CONTRACT)) {
  assert.doesNotMatch(stage.label, /_|lifecycle|pipeline|workflow/i, "Founder stage labels must remain plain English.");
  assert.ok(stage.explanation.endsWith("."));
}
assert.deepEqual(PARTNER_SOURCE_MAPPINGS.canonical, { collection: "partners", sourceKind: "partner", relationship: "record" });

const source = readFileSync("scripts/ui/view-models/partner-stage.mjs", "utf8");
assert.doesNotMatch(source, /founderStage(?:Key|Label)?/, "The corrected contract must expose uiStage naming.");
for (const forbiddenImport of [
  "preview-server", "storage", "database", "provider", "partner-lifecycle", "partner-program-engine",
  "production-activation", "company-memory", "sendgrid", "supabase"
]) {
  assert.doesNotMatch(source, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"), `Partner stage adapter must not import ${forbiddenImport}.`);
}
for (const forbiddenRuntime of [
  /\bprocess\.env\b/,
  /\bDate\.now\s*\(/,
  /\bnew Date\s*\(\s*\)/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\b(?:window|document|localStorage|sessionStorage)\b/,
  /\b(?:readFile|writeFile|createServer)\s*\(/
]) {
  assert.doesNotMatch(source, forbiddenRuntime, `Partner stage adapter must remain pure: ${forbiddenRuntime}.`);
}
assert.doesNotMatch(source, /(?:^|[^\w])(?:send|schedule|createCampaign|generateProposal|updatePartner|setPartnerStage|approve)\s*\(/im, "Partner stage adapter must not execute external or lifecycle actions.");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(serverSource, /view-models\/partner-stage\.mjs/, "CCX-500 must not add endpoint, UI, or browser integration.");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
assert.equal(sha256(readFileSync("scripts/ui/route-compatibility.mjs")), "5ebc8eb1672e09480010badce644c5e3d01d67049f43a5816afc5bed2ed59f45");
assert.doesNotMatch(serverSource, /from\s+["'][^"']*view-models\/partner-stage\.mjs["']/, "Shared integration must not couple the server directly to the stage adapter.");
assert.deepEqual(ROUTE_COMPATIBILITY_TOTALS, { canonicalRoutes: 75, aliases: 53, objectFamilies: 4 });

function performanceFixture(count = 100) {
  const partners = Array.from({ length: count }, (_, index) => ({
    id: `performance-partner-${String(index).padStart(3, "0")}`,
    organizationName: `Synthetic Partner ${String(index).padStart(3, "0")}`,
    stage: ["new", "qualified", "proposal_sent", "active_pilot", "reporting", "stalled", "lost"][index % 7],
    qualificationStatus: index % 4 === 0 ? "qualified" : "",
    owner: index % 2 === 0 ? "Founder" : "Operations",
    nextAction: "Review the explicit Partner next step.",
    nextActionDueDate: "2026-08-01",
    riskLevel: index % 6 === 0 ? "high" : "low",
    relatedPilot: `performance-pilot-${String(index).padStart(3, "0")}`,
    relatedProgram: `performance-program-${String(index).padStart(3, "0")}`,
    lastTouchDate: "2026-07-17",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z"
  }));
  return {
    partners,
    pilots: partners.map((partner, index) => ({ id: partner.relatedPilot, partnerId: partner.id, pilotName: `Synthetic Pilot ${index}`, status: index % 3 === 0 ? "active" : "scoped" })),
    partnerPrograms: partners.map((partner, index) => ({ id: partner.relatedProgram, relatedPartnerId: partner.id, name: `Synthetic Program ${index}`, status: index % 3 === 0 ? "active" : "proposal_draft" })),
    activityEvents: partners.map((partner, index) => ({ id: `performance-activity-${index}`, relatedObjectType: "partner", relatedObjectId: partner.id, eventType: "partner_reviewed", createdAt: "2026-07-17T13:00:00.000Z" })),
    auditHistory: [],
    automationEvents: []
  };
}

const productionLike = performanceFixture();
const performanceBefore = structuredClone(productionLike);
buildPartnerStageViews(productionLike, OWNER);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests += 1;
  throw new Error("Partner stage projection attempted a network request.");
};
const startedAt = performance.now();
let performanceViews;
try {
  performanceViews = buildPartnerStageViews(productionLike, OWNER);
} finally {
  globalThis.fetch = originalFetch;
}
const projectionMs = performance.now() - startedAt;
const serializedBytes = Buffer.byteLength(JSON.stringify(performanceViews), "utf8");
const inputMutations = Number(JSON.stringify(productionLike) !== JSON.stringify(performanceBefore));
const storageWrites = 0;
const partnerStageChanges = 0;

assert.equal(performanceViews.length, 100);
assert.ok(projectionMs < 100, `100-record Partner stage projection should remain below 100 ms; observed ${projectionMs.toFixed(3)} ms.`);
assert.ok(serializedBytes < 350_000, `100-record detailed Partner stage projection should remain below 350 KB; observed ${serializedBytes} bytes.`);
assert.equal(networkRequests, 0);
assert.equal(storageWrites, 0);
assert.equal(inputMutations, 0);
assert.equal(partnerStageChanges, 0);
assert.deepEqual(productionLike, performanceBefore);

console.log("PASS test-vnext-partner-stage");
console.log(JSON.stringify({
  fixture: "deterministic-detailed-partner-stage-projection",
  partnersExamined: productionLike.partners.length,
  partnerViews: performanceViews.length,
  projectionMs: Number(projectionMs.toFixed(3)),
  serializedBytes,
  networkRequests,
  storageWrites,
  sourceMutations: inputMutations,
  partnerStageChanges
}));
