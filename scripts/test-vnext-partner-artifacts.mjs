#!/usr/bin/env node
import assert from "node:assert/strict";

import { addPartnerFileRecord, buildPartnerFilesView, createPartnerProgramRecord, generatePartnerArtifact } from "./partner-artifact-service.mjs";
import { buildPartnerActivity } from "./ui/view-models/partner-activity.mjs";
import { buildPartnerRecordView } from "./ui/view-models/partner-record.mjs";

const OWNER = { authenticated:true, role:"owner", id:"owner-example" };
const NOW = "2026-07-19T12:00:00.000Z";
const state = { partners:[{ id:"partner-files", organizationName:"Files Partner Example", stage:"active_pilot", owner:"Roger", history:[] }], partnerPrograms:[], partnerProgramArtifacts:[], reports:[], dataRoomItems:[], activityEvents:[], auditHistory:[], pilots:[], campaigns:[], outreachCampaigns:[], outreachAttempts:[], outreachReplies:[], tasks:[], evidencePackNotes:[], automationEvents:[], companyEvents:[] };

const programResult = createPartnerProgramRecord(state, "partner-files", { requestId:"partner-program-example-01", name:"Community access program", packageTier:"starter", programGoal:"Expand reviewed access" }, { actor:OWNER, now:NOW });
assert.equal(programResult.program.relatedPartnerId, "partner-files");
assert.equal(programResult.program.status, "lead");
assert.equal(programResult.externalActions, 0);

const generated = generatePartnerArtifact(programResult.state, "partner-files", programResult.program.id, { requestId:"partner-proposal-example1", artifactType:"proposal" }, { actor:OWNER, now:NOW });
assert.equal(generated.artifact.status, "draft");
assert.equal(generated.artifact.reviewRequired, true);
assert.equal(generated.artifact.externalSendAllowed, false);
assert.equal(generated.artifact.publicAccess, false);
assert.equal(generated.file.status, "draft");
assert.equal(generated.file.metadataOnly, true);
assert.equal(generated.file.sourceRef.collection, "partnerProgramArtifacts");
assert.equal(generated.file.sourceRef.itemId, generated.artifact.id);
assert.equal(generated.file.externallyShared, false);
assert.equal(generated.copies, 0);
assert.doesNotMatch(JSON.stringify(generated.file), /<html|markdown|complianceNote|Record-Clearing Access Program/i);
assert.equal(generated.externalActions, 0);

const files = buildPartnerFilesView(generated.state, OWNER, "partner-files", NOW);
assert.equal(files.items.length, 1);
assert.equal(files.items[0].sourceKind, "report");
assert.equal(files.items[0].href, `#files/report/${generated.file.id}`);
assert.ok(files.items[0].relatedObjects.some((related) => related.kind === "Partner" && related.href === "#partners/partner/partner-files"));
assert.equal(files.safety.fileProjectionAuthoritative, true);
assert.equal(files.safety.documentCopies, 0);
const activity = buildPartnerActivity(generated.state, OWNER, "partner-files", NOW);
assert.ok(activity.events.some((event) => event.sourceId === generated.file.id && event.type === "document"));
const record = buildPartnerRecordView(generated.state, OWNER, "partner-files", NOW, { tab:"files" });
assert.equal(record.files.items[0].href, files.items[0].href);

const beforeFailure = structuredClone(programResult.state);
assert.throws(() => generatePartnerArtifact(programResult.state, "partner-files", programResult.program.id, { requestId:"partner-invalid-example1", artifactType:"public_release" }, { actor:OWNER, now:NOW }), /supported Partner artifact/);
assert.deepEqual(programResult.state, beforeFailure, "failed generation must create no false artifact, File, or activity");

const added = addPartnerFileRecord(state, "partner-files", { creationRequestId:"partner-file-example-001", name:"Reviewed planning notes", section:"Partner pipeline", sourceLink:"https://example.com/reviewed-notes", notes:"Synthetic metadata only." }, { actor:OWNER, now:NOW });
assert.equal(added.record.partnerId, "partner-files");
assert.equal(added.record.binaryUploaded, false);
assert.equal(added.record.externallyShared, false);
assert.equal(added.uploads, 0);
assert.equal(added.shares, 0);
assert.equal(added.externalActions, 0);

console.log("PASS test-vnext-partner-artifacts");
console.log(JSON.stringify({ programsCreated:1, artifactsGenerated:1, projectedFiles:files.items.length, activityEvidence:activity.events.length, failedGenerationFalseFiles:0, documentCopies:0, uploads:0, shares:0, externalActions:0 }));
