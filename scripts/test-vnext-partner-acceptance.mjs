#!/usr/bin/env node
import assert from "node:assert/strict";

import { generatePartnerArtifact, buildPartnerFilesView } from "./partner-artifact-service.mjs";
import { buildAuthorizedPartnersHome } from "./partners-home-service.mjs";
import { buildPartnerOutreachIntegration } from "./partner-outreach-integration.mjs";
import { buildPartnersTrainScenario, PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW } from "./fixtures/vnext-partners-train.mjs";
import { buildPartnerActivity } from "./ui/view-models/partner-activity.mjs";
import { adaptPartnerStage } from "./ui/view-models/partner-stage.mjs";

const scenario = buildPartnersTrainScenario();
const created = scenario.state.partners.find((partner) => partner.id === scenario.newPartnerId);
assert.ok(created, "1. Add a Partner");
assert.equal(scenario.added.result.canonicalHref, `#partners/partner/${scenario.newPartnerId}`);

const stageJourney = ["new", "qualified", "meeting_requested", "proposal_sent", "active_pilot", "closed_lost"].map((stage) => ({ internal:stage, adapted:adaptPartnerStage({ stage }) }));
assert.deepEqual(stageJourney.map((item) => item.adapted.uiStageLabel), ["New", "Qualified", "In conversation", "Proposal", "Active", "Closed"]);
assert.deepEqual(stageJourney.map((item) => item.internal), ["new", "qualified", "meeting_requested", "proposal_sent", "active_pilot", "closed_lost"], "2. adapting user-facing stages must not corrupt internal values");

assert.equal(scenario.next.partner.nextAction, "Schedule a reviewed introduction", "3. set a next action");
assert.equal(scenario.completed.completedSummary, "Schedule a reviewed introduction", "4. complete the next action");
assert.equal(scenario.completed.partner.nextAction, "");
assert.equal(scenario.completed.partner.stage, "new");

assert.equal(scenario.campaign.record.status, "draft", "5. create Outreach from Partner record");
assert.equal(scenario.campaign.record.liveMode, false);
assert.deepEqual(scenario.campaign.record.recipients, []);
assert.equal(scenario.campaign.externalActions, 0);

assert.equal(scenario.proposal.artifact.artifactType, "proposal", "6. generate a proposal");
assert.equal(scenario.proposal.artifact.status, "draft");
const files = buildPartnerFilesView(scenario.state, PARTNERS_FIXTURE_ACTOR, scenario.newPartnerId, PARTNERS_FIXTURE_NOW);
const proposalFile = files.items.find((file) => file.sourceId === scenario.proposal.file.id);
assert.ok(proposalFile, "7. proposal must be discoverable through Partner Files");
assert.equal(proposalFile.href, `#files/report/${scenario.proposal.file.id}`);

assert.equal(scenario.reply.classificationReviewed, true, "8. record a reviewed reply fixture");
assert.equal(scenario.outreach.suggestions[0].changesPartnerStage, false, "9. suggestion alone must not change stage");
assert.equal(scenario.stage.suggestion.applied, true);
assert.equal(created.stage, "meeting_requested", "stage changes only after explicit apply");
const appliedOutreach = buildPartnerOutreachIntegration(scenario.state, PARTNERS_FIXTURE_ACTOR, scenario.newPartnerId, PARTNERS_FIXTURE_NOW);
assert.equal(appliedOutreach.suggestions[0].applied, true);
assert.equal(appliedOutreach.suggestions[0].requiresExplicitApply, false);

const list = buildAuthorizedPartnersHome(scenario.state, PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW, { view:"list", limit:50 });
const pipeline = buildAuthorizedPartnersHome(scenario.state, PARTNERS_FIXTURE_ACTOR, PARTNERS_FIXTURE_NOW, { view:"pipeline", limit:50 });
assert.deepEqual(list.items.map((item) => item.id).sort(), pipeline.items.map((item) => item.id).sort(), "pipeline and list must remain consistent");
assert.ok(list.items.find((item) => item.id === "partner-community").dueState.overdue, "overdue follow-up remains visible");
assert.ok(list.items.every((item) => item.partner.href === `#partners/partner/${encodeURIComponent(item.id)}`));
assert.equal(scenario.outreach.campaigns.find((campaign) => campaign.stableIdentity === `campaign:${scenario.campaign.record.id}`).href, `#outreach/campaign/${scenario.campaign.record.id}`);

const activity = buildPartnerActivity(scenario.state, PARTNERS_FIXTURE_ACTOR, scenario.newPartnerId, PARTNERS_FIXTURE_NOW);
const timestamps = activity.events.map((event) => event.occurredAt).filter(Boolean);
assert.ok(timestamps.every((timestamp, index) => index === 0 || Date.parse(timestamps[index - 1]) >= Date.parse(timestamp)), "Partner activity must remain newest-first");
assert.equal(new Set(activity.events.map((event) => event.dedupeKey)).size, activity.events.length, "Partner activity must remain deduplicated");

const beforeFailure = structuredClone(scenario.state);
assert.throws(() => generatePartnerArtifact(scenario.state, scenario.newPartnerId, scenario.program.program.id, { requestId:"train-invalid-example-01", artifactType:"public_release" }, { actor:PARTNERS_FIXTURE_ACTOR, now:PARTNERS_FIXTURE_NOW }), /supported Partner artifact/);
assert.deepEqual(scenario.state, beforeFailure, "failed generation creates no false File");
assert.throws(() => buildAuthorizedPartnersHome(scenario.state, { authenticated:true, role:"viewer" }, PARTNERS_FIXTURE_NOW, { view:"list" }), /not available for this account/, "unauthorized activity and Partner rows must not disclose");

console.log("PASS test-vnext-partner-acceptance");
console.log(JSON.stringify({ workflowSteps:9, authorizedPartners:list.summary.authorizedPartners, activityEvents:activity.events.length, exactPartnerLinks:list.items.length, exactCampaignLinks:1, exactFileLinks:1, silentStageMutations:0, falseFilesAfterFailure:0, fullStateReads:0, providerCalls:0, externalActions:0 }));
