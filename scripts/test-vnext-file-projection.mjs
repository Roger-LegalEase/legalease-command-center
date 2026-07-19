#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { FILE_SOURCE_MATRIX } from "./ui/view-models/file-sources.mjs";
import { buildFileProjection, buildFileView, buildFileViews } from "./ui/view-models/file-view.mjs";
import { resolveRouteCompatibility } from "./ui/route-compatibility.mjs";

const OWNER = Object.freeze({ authenticated: true, role: "owner" });
const OPERATOR = Object.freeze({ authenticated: true, role: "operator" });

function fixtureState() {
  return {
    reports: [
      {
        id: "campaign-results-report",
        reportTitle: "Campaign results export",
        reportType: "campaign_results",
        campaignId: "campaign-01",
        status: "exported",
        generatedAt: "2026-07-17T10:00:00.000Z",
        markdownPath: "data/exports/reports/campaign-results.md",
        owner: "Growth"
      },
      { id: "same-name-report", reportTitle: "Quarterly update", status: "draft" }
    ],
    dataRoomItems: [
      {
        id: "uploaded-document",
        title: "Partner packet",
        filePath: "Data Room/Partner packet.pdf",
        status: "draft",
        owner: "Operations",
        partnerId: "partner-01",
        campaignId: "campaign-01",
        postId: "post-01",
        partnerProgramId: "program-01",
        reportId: "campaign-results-report",
        evidenceId: "evidence-note-01",
        createdAt: "2026-07-10T09:00:00.000Z",
        updatedAt: "2026-07-17T11:00:00.000Z"
      },
      { id: "same-name-data-room", title: "Quarterly update", filePath: "Data Room/Quarterly update.pdf" },
      { id: "version-1", title: "Security overview", filePath: "Data Room/Security overview.md", version: 1 },
      { id: "version-2", title: "Security overview", filePath: "Data Room/Security overview.md", version: 2, previousVersionId: "version-1" },
      { id: "dedupe-canonical", title: "Canonical diligence memo", filePath: "Data Room/Diligence memo.txt" },
      { id: "dedupe-explicit-copy", title: "Copy of diligence memo", duplicateOfId: "dedupe-canonical", filePath: "Data Room/Diligence memo copy.txt" },
      { id: "spreadsheet", title: "Revenue model", filePath: "Data Room/Revenue model.xlsx", status: "usable" },
      { id: "presentation", title: "Board deck", filePath: "Data Room/Board deck.pptx" },
      { id: "collection", title: "Diligence collection", itemType: "folder" },
      { id: "public-link", title: "Public guide", itemType: "link", public: true, sourceLink: "https://example.com/public-guide" },
      { id: "private-link", title: "Private source", itemType: "link", sourceLink: "https://example.com/private-source" },
      { id: "absolute-path", title: "Unsafe path", filePath: "/home/operator/private.pdf" },
      { id: "unknown-type", title: "Discussion mentions budget.xlsx" },
      { id: "owner-only-file", title: "Restricted file", ownerOnly: true, filePath: "Data Room/Restricted.pdf" },
      { id: "missing-status", title: "No status metadata", filePath: "Data Room/No status.txt" },
      { id: "<unsafe-id>", title: "Unsafe identity" }
    ],
    dataRoom: [
      { id: "uploaded-document", title: "Legacy mirrored Partner packet", filePath: "Data Room/legacy-copy.pdf", updatedAt: "2026-07-18T11:00:00.000Z" }
    ],
    evidencePackNotes: [
      { id: "evidence-note-01", title: "Partner evidence note", type: "evidence_note", partnerId: "partner-01", status: "recorded", timestamp: "2026-07-17T12:00:00.000Z" }
    ],
    soc2Evidence: [
      { id: "soc2-snapshot", evidenceTitle: "SOC 2 Readiness Snapshot", artifactFilename: "legalease-soc2-readiness-snapshot-2026-07.md", evidenceStatus: "Approved", generatedAt: "2026-07-17T13:00:00.000Z", link: "/api/soc2/evidence-snapshot/export" },
      { id: "soc2-verified", evidenceTitle: "Verified access sample", evidenceStatus: "Ready for Review", verifiedAt: "2026-07-17T14:00:00.000Z" }
    ],
    soc2Policies: [
      { id: "soc2-policy-01", policyName: "Information Security Policy", status: "In Progress", owner: "Compliance", lastReviewedDate: "2026-07-15" }
    ],
    brandAssets: [
      { id: "brand-logo", name: "LegalEase primary logo", assetType: "logo", mimeType: "image/png", fileUrl: "assets/brand/logo.png", approved: true, postId: "post-01", version: 1 }
    ],
    activityEvents: [
      { id: "file-event-created", eventType: "file created", relatedObjectType: "dataRoomItems", relatedObjectId: "uploaded-document", createdAt: "2026-07-10T09:00:00.000Z", rawPayload: { private: "must not project" } },
      { id: "file-event-shared", eventType: "file shared", relatedObjectType: "data-room-item", relatedObjectId: "uploaded-document", createdAt: "2026-07-17T12:00:00.000Z", notes: "sensitive notes must not project" },
      { id: "unrelated-event", eventType: "file updated", relatedObjectType: "dataRoomItems", relatedObjectId: "another-file", createdAt: "2026-07-17T13:00:00.000Z" }
    ],
    auditHistory: [
      { id: "file-event-created", action: "file created", resourceType: "dataRoomItems", resourceId: "uploaded-document", timestamp: "2026-07-10T09:00:00.000Z", providerPayload: "must not project" },
      { id: "file-event-verified", action: "file verified", resourceType: "soc2-evidence", resourceId: "soc2-verified", timestamp: "2026-07-17T14:00:00.000Z" }
    ],
    partnerProgramArtifacts: [{ id: "program-artifact-01", title: "Partner proposal artifact" }],
    postImages: [{ id: "post-image-01", postId: "post-01", versionNumber: 2, imageUrl: "https://example.com/image.png" }],
    localAssets: [{ id: "local-asset-01", filePath: "/tmp/private.png" }],
    postingKits: [{ id: "posting-kit-01", postId: "post-01" }],
    campaignKits: [{ id: "campaign-kit-01", campaignId: "campaign-01", path: "data/exports/campaign-kit" }],
    evidenceSummaries: [{ id: "evidence-summary-01", title: "Evidence summary" }],
    handoffPackets: [{ id: "handoff-packet-01", title: "Partner handoff" }],
    soc2AccessReviews: [{ id: "access-review-01", system: "Supabase" }],
    soc2Changes: [{ id: "change-01", title: "Storage change" }],
    soc2Incidents: [{ id: "incident-01", incidentTitle: "Storage incident" }],
    soc2AuditLogs: [{ id: "audit-raw-01", action: "access denied" }],
    assetBundles: [{ id: "asset-bundle-01" }]
  };
}

function reverseArrays(value) {
  if (Array.isArray(value)) return value.map(reverseArrays).reverse();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, reverseArrays(child)]));
}

const state = fixtureState();
const before = structuredClone(state);
const projection = buildFileProjection(state, OWNER, "2026-07-17T15:00:00.000Z");
const views = projection.files;

assert.equal(typeof buildFileProjection, "function");
assert.equal(typeof buildFileViews, "function");
assert.equal(typeof buildFileView, "function");
assert.deepEqual(state, before, "File projection must never mutate source state.");
assert.deepEqual(buildFileViews(state, OWNER, "2026-07-17T15:00:00.000Z"), views);
assert.deepEqual(buildFileViews(reverseArrays(state), OWNER, "2026-07-17T15:00:00.000Z"), views, "Input order must not affect FileViews.");
assert.deepEqual(buildFileViews(state, OWNER, "2099-01-01T00:00:00.000Z"), views, "Current-clock changes must not affect source truth.");
assert.ok(Object.isFrozen(projection) && Object.isFrozen(views) && views.every(Object.isFrozen));
assert.throws(() => views.push({}), TypeError);

const includedCollections = FILE_SOURCE_MATRIX.included.map((source) => source.collection);
assert.deepEqual(includedCollections, ["reports", "dataRoomItems", "evidencePackNotes", "soc2Evidence", "soc2Policies", "brandAssets"]);
for (const collection of includedCollections) assert.ok(views.some((view) => view.sourceCollection === collection), `${collection} must project.`);
for (const source of FILE_SOURCE_MATRIX.deferred) {
  assert.ok(Array.isArray(state[source.collection]), `${source.collection} needs an actual candidate fixture.`);
  assert.equal(views.some((view) => view.sourceCollection === source.collection), false, `${source.collection} must remain deferred.`);
}

const upload = buildFileView(state, "data-room-item:uploaded-document", OWNER);
assert.equal(upload.id, "data-room-item:uploaded-document");
assert.equal(upload.stableKey, "data-room-item:uploaded-document");
assert.equal(upload.name, "Partner packet", "The authoritative dataRoomItems record wins over its legacy mirror.");
assert.equal(upload.href, "#files/data-room-item/uploaded-document");
assert.equal(resolveRouteCompatibility(upload.href).sourceId, "uploaded-document");
assert.equal(upload.fileType.key, "pdf");
assert.equal(upload.status.key, "draft");
assert.equal(upload.verifiedAt, null, "Missing verification dates must remain unavailable.");
assert.equal(upload.storageRef.reference, "Data Room/Partner packet.pdf");
assert.equal(upload.storageRef.signedUrlReturned, false);
assert.equal(upload.storageRef.localAbsolutePathReturned, false);
assert.deepEqual(upload.sourceRef.mirrorCollections, ["dataRoom"]);
assert.equal(upload.activity.length, 2, "Stable activity IDs must deduplicate audit and activity rows.");
assert.deepEqual(upload.activity.map((event) => event.kind), ["shared", "created"]);
assert.doesNotMatch(JSON.stringify(upload.activity), /private|sensitive notes|providerPayload/);

const related = new Map(upload.relatedObjects.map((item) => [item.kind, item]));
assert.equal(related.get("Partner").href, "#partners/partner/partner-01");
assert.equal(related.get("Campaign").href, "#outreach/campaign/campaign-01");
assert.equal(related.get("Post").href, "#social/post/post-01");
assert.equal(related.get("Program").href, "#item/partnerPrograms/program-01");
assert.ok(upload.relatedObjects.some((item) => item.relationship === "related_report" && item.href === "#files/report/campaign-results-report"));
assert.ok(upload.relatedObjects.some((item) => item.relationship === "related_evidence" && item.href === "#files/evidence-note/evidence-note-01"));

const reportSameName = views.find((view) => view.stableKey === "report:same-name-report");
const dataRoomSameName = views.find((view) => view.stableKey === "data-room-item:same-name-data-room");
assert.equal(reportSameName.name, dataRoomSameName.name);
assert.notEqual(reportSameName.stableKey, dataRoomSameName.stableKey, "Unrelated same-name records must remain separate.");
const version1 = views.find((view) => view.stableKey === "data-room-item:version-1");
const version2 = views.find((view) => view.stableKey === "data-room-item:version-2");
assert.ok(version1 && version2, "Explicit versions remain distinguishable.");
assert.ok(version2.relatedObjects.some((item) => item.relationship === "replaces" && item.href === version1.href));
assert.equal(views.some((view) => view.stableKey === "data-room-item:dedupe-explicit-copy"), false);
assert.ok(views.find((view) => view.stableKey === "data-room-item:dedupe-canonical").sourceRef.duplicateSourceIds.includes("dedupe-explicit-copy"));
assert.ok(projection.diagnostics.deduplications >= 2, "Legacy mirrors and explicit duplicate relationships must be counted.");

assert.equal(views.some((view) => view.sourceId === "<unsafe-id>"), false);
assert.equal(buildFileViews(state, { authenticated: false, role: "owner" }).length, 0);
assert.equal(buildFileViews(state, { authenticated: true, role: "unknown" }).length, 0);
assert.equal(buildFileViews(state, { authenticated: true, role: "viewer" }).length, 0);
const operatorProjection = buildFileProjection(state, OPERATOR);
assert.equal(operatorProjection.files.some((view) => view.sourceId === "owner-only-file"), false);
const withoutHidden = structuredClone(state);
withoutHidden.dataRoomItems = withoutHidden.dataRoomItems.filter((record) => record.id !== "owner-only-file");
assert.equal(operatorProjection.diagnostics.candidateRecordsScanned, buildFileProjection(withoutHidden, OPERATOR).diagnostics.candidateRecordsScanned, "Hidden records must be filtered before counts.");
const operatorUpload = buildFileView(state, "data-room-item:uploaded-document", OPERATOR);
assert.equal(operatorUpload.storageRef.reference, null);
assert.equal(operatorUpload.storageRef.privateReferenceSuppressed, true);
assert.equal(operatorUpload.permissions.canViewPrivateStorageMetadata, false);

assert.equal(buildFileView(state, "data-room-item:absolute-path", OWNER).storageRef.reference, null, "Local absolute paths must never project.");
assert.equal(buildFileView(state, "data-room-item:public-link", OWNER).storageRef.publicUrl, "https://example.com/public-guide");
assert.equal(buildFileView(state, "data-room-item:private-link", OWNER).storageRef.publicUrl, null, "A URL is not public without explicit public truth.");
assert.equal(buildFileView(state, "soc2-evidence:soc2-snapshot", OWNER).fileType.key, "markdown");
assert.equal(buildFileView(state, "soc2-evidence:soc2-snapshot", OWNER).verifiedAt, null, "Approved does not mean verified.");
assert.equal(buildFileView(state, "soc2-evidence:soc2-verified", OWNER).verifiedAt, "2026-07-17T14:00:00.000Z");
assert.equal(buildFileView(state, "brand-asset:brand-logo", OWNER).fileType.key, "image");
assert.equal(buildFileView(state, "report:campaign-results-report", OWNER).fileType.key, "markdown");
assert.equal(buildFileView(state, "data-room-item:spreadsheet", OWNER).fileType.key, "spreadsheet");
assert.equal(buildFileView(state, "data-room-item:presentation", OWNER).fileType.key, "presentation");
assert.equal(buildFileView(state, "data-room-item:collection", OWNER).fileType.key, "collection");
assert.equal(buildFileView(state, "data-room-item:public-link", OWNER).fileType.key, "link");
assert.equal(buildFileView(state, "evidence-note:evidence-note-01", OWNER).fileType.key, "text");
assert.equal(buildFileView(state, "data-room-item:unknown-type", OWNER).fileType.key, "unknown", "Vague prose must not create a file extension.");
assert.equal(buildFileView(state, "data-room-item:missing-status", OWNER).status.available, false);
assert.equal(buildFileView(state, "brand-asset:brand-logo", OWNER).status.key, "approved");
assert.equal(buildFileView(state, "brand-asset:brand-logo", OWNER).verifiedAt, null, "Approval must not become verification.");
assert.equal(buildFileView(state, "data-room-item:same-name-data-room", OWNER).activity.length, 0, "Modified timestamps alone must not fabricate activity.");

const sources = [
  readFileSync("scripts/ui/view-models/file-sources.mjs", "utf8"),
  readFileSync("scripts/ui/view-models/file-view.mjs", "utf8")
].join("\n");
for (const forbiddenImport of ["preview-server", "storage", "database", "provider", "sendgrid", "supabase", "partner-program-engine"]) {
  assert.doesNotMatch(sources, new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"));
}
for (const forbiddenRuntime of [
  /\bprocess\.env\b/, /\bDate\.now\s*\(/, /\bnew Date\s*\(\s*\)/, /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\b(?:window|localStorage|sessionStorage)\b|\bdocument\s*\./,
  /\b(?:readFile|writeFile|createServer)\s*\(/
]) assert.doesNotMatch(sources, forbiddenRuntime);
assert.doesNotMatch(sources, /(?:^|[^\w])(?:save|upload|share|publish|generate|createFile|write|migrate)\s*\(/im);
assert.doesNotMatch(sources, /state\.files|state\[\s*["']files["']\s*\]/, "CCX-600 must not create a canonical files collection.");
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
assert.doesNotMatch(serverSource, /view-models\/file-(?:view|sources)\.mjs/);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
assert.equal(sha256(readFileSync("scripts/ui/route-compatibility.mjs")), "5ebc8eb1672e09480010badce644c5e3d01d67049f43a5816afc5bed2ed59f45");
assert.equal(sha256(serverSource), "4e978fb5b0adb4df3b7d70a7c6e5785b0ae9313c396f80ae0bfed5201e77510c");
assert.match(readFileSync("package.json", "utf8"), /"test:vnext-file-projection": "node scripts\/test-vnext-file-projection\.mjs"/);

function performanceFixture(count = 120) {
  const records = Array.from({ length: count }, (_, index) => ({
    id: `performance-file-${String(index).padStart(3, "0")}`,
    title: `Synthetic detailed file ${String(index).padStart(3, "0")}`,
    filePath: `Data Room/Synthetic file ${String(index).padStart(3, "0")}.pdf`,
    status: index % 3 === 0 ? "draft" : "usable",
    owner: index % 2 === 0 ? "Operations" : "Founder",
    partnerId: `performance-partner-${index % 10}`,
    campaignId: `performance-campaign-${index % 8}`,
    updatedAt: "2026-07-17T12:00:00.000Z"
  }));
  const duplicates = records.slice(0, 10).map((record, index) => ({
    ...record,
    id: `performance-duplicate-${String(index).padStart(3, "0")}`,
    duplicateOfId: record.id
  }));
  return {
    dataRoomItems: [...records, ...duplicates],
    reports: [], evidencePackNotes: [], soc2Evidence: [], soc2Policies: [], brandAssets: [],
    activityEvents: records.map((record, index) => ({
      id: `performance-event-${index}`,
      eventType: "file updated",
      relatedObjectType: "dataRoomItems",
      relatedObjectId: record.id,
      createdAt: "2026-07-17T13:00:00.000Z"
    })),
    auditHistory: []
  };
}

const detailed = performanceFixture();
const detailedBefore = structuredClone(detailed);
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = () => {
  networkRequests += 1;
  throw new Error("File projection attempted a network request.");
};
let benchmark;
const startedAt = performance.now();
try {
  benchmark = buildFileProjection(detailed, OWNER, "2026-07-17T14:00:00.000Z");
} finally {
  globalThis.fetch = originalFetch;
}
const projectionMs = performance.now() - startedAt;
const serializedBytes = Buffer.byteLength(JSON.stringify(benchmark.files), "utf8");
const sourceMutations = Number(JSON.stringify(detailed) !== JSON.stringify(detailedBefore));
const storageWrites = 0;

assert.equal(benchmark.diagnostics.candidateRecordsScanned, 130);
assert.equal(benchmark.diagnostics.projectedFiles, 120);
assert.equal(benchmark.diagnostics.deduplications, 10);
assert.ok(benchmark.files.length >= 100);
assert.ok(projectionMs < 200, `Detailed File projection should remain below 200 ms; observed ${projectionMs.toFixed(3)} ms.`);
assert.ok(serializedBytes < 500_000);
assert.equal(networkRequests, 0);
assert.equal(storageWrites, 0);
assert.equal(sourceMutations, 0);
assert.deepEqual(detailed, detailedBefore);

console.log("PASS test-vnext-file-projection");
console.log(JSON.stringify({
  fixture: "detailed-file-adapter-benchmark-not-an-unpaginated-endpoint-proposal",
  candidateRecordsScanned: benchmark.diagnostics.candidateRecordsScanned,
  projectedFiles: benchmark.diagnostics.projectedFiles,
  deduplications: benchmark.diagnostics.deduplications,
  projectionMs: Number(projectionMs.toFixed(3)),
  serializedBytes,
  networkRequests,
  storageWrites,
  sourceMutations
}));
