#!/usr/bin/env node
import assert from "node:assert/strict";
import { CAMPAIGN_WIZARD_STEPS, CampaignWizardError, buildCampaignWizardView, campaignWizardHasUnsavedChanges, createCampaignWizardSavePlan, persistCampaignWizardDraft } from "./campaign-wizard-service.mjs";
import { campaignWizardBrowserSource, renderCampaignWizardShell } from "./ui/pages/campaign-wizard.mjs";

const actor={ authenticated:true, role:"owner", id:"wizard-owner" };
const state={ campaigns:[{ id:"campaign-1", name:"Synthetic campaign", status:"draft", _version:3 }], outreachCampaigns:[], reactivationCampaign:null };
assert.deepEqual(CAMPAIGN_WIZARD_STEPS.map((step)=>step.label),["Goal","Audience","Message","Schedule","Review"]);
const view=buildCampaignWizardView(state,actor,"campaign:campaign-1");
assert.equal(view.available,true); assert.equal(view.campaign.stableIdentity,"campaign:campaign-1"); assert.equal(view.draftVersion,0); assert.equal(view.capabilities.savesDraft,true); assert.equal(view.capabilities.launches,false);
assert.equal(buildCampaignWizardView(state,actor,"campaign-1").campaign.stableIdentity,"campaign:campaign-1","Exact Campaign routes must resolve their canonical source ID without browser reconstruction.");
assert.equal(campaignWizardHasUnsavedChanges(view.draft,structuredClone(view.draft)),false);
const changed=structuredClone(view.draft); changed.goal.campaignName="Synthetic update"; assert.equal(campaignWizardHasUnsavedChanges(view.draft,changed),true);
const plan=createCampaignWizardSavePlan(state,actor,"campaign:campaign-1",{step:"goal",fields:{campaignName:"Synthetic update"},expectedVersion:0},"2026-07-19T16:00:00.000Z");
assert.deepEqual(plan.scope,{collection:"campaigns",id:"campaign-1",expectedVersion:0}); assert.equal(plan.fields.campaignWizardDraft.goal.campaignName,"Synthetic update"); assert.equal(plan.execution.sends,false); assert.equal(plan.execution.providerCalls,false);
assert.throws(()=>createCampaignWizardSavePlan(state,actor,"campaign:campaign-1",{step:"goal",fields:{launch:true},expectedVersion:0}),CampaignWizardError);
assert.throws(()=>createCampaignWizardSavePlan(state,actor,"campaign:campaign-1",{step:"goal",fields:{campaignName:"x"},expectedVersion:2}),/changed elsewhere/);
assert.equal(buildCampaignWizardView({campaigns:[]},actor,"campaign:missing").available,false);
assert.equal(buildCampaignWizardView(state,{authenticated:false,role:"owner"},"campaign:campaign-1").authorized,false);
const calls=[];const response=await persistCampaignWizardDraft({state,actor,stableIdentity:"campaign:campaign-1",input:{step:"goal",fields:{campaignName:"Saved"},expectedVersion:0},now:"2026-07-19T16:10:00.000Z",persistScoped:async(...args)=>calls.push(["persist",...args]),appendAudit:async(...args)=>calls.push(["audit",...args])});
assert.equal(response.saved,true);assert.deepEqual(calls.map((call)=>call[0]),["persist","audit"]);assert.equal(calls[0][1].collection,"campaigns");
const html=renderCampaignWizardShell({stableIdentity:"campaign:campaign-1"});const browser=campaignWizardBrowserSource();
assert.match(html,/Goal[\s\S]*Audience[\s\S]*Message[\s\S]*Schedule[\s\S]*Review/);assert.match(html,/Save draft/);assert.match(browser,/beforeunload/);assert.match(browser,/popstate/);assert.match(browser,/expectedVersion/);assert.doesNotMatch(browser,/sendCampaign|launchCampaign|approveCampaign|provider\./);
console.log("PASS test-vnext-campaign-wizard");
