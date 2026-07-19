#!/usr/bin/env node
import assert from "node:assert/strict";
import { CAMPAIGN_GOAL_TYPES, buildCampaignGoalStep, createCampaignGoalSavePlan, validateCampaignGoalFields } from "./campaign-goal-step.mjs";
import { renderCampaignGoalStep } from "./ui/pages/campaign-goal-step.mjs";
const actor={authenticated:true,role:"owner",id:"owner"};
const state={campaigns:[{id:"goal-1",name:"Saved name",status:"draft",campaignWizardDraft:{goal:{campaignName:"Saved name",campaignType:"announcement",desiredOutcome:"Share a synthetic update.",owner:"owner"}}}],partnerPrograms:[{id:"program-1",name:"Community program"},{id:"hidden-program",name:"Hidden",allowedRoles:["admin"]}],products:[{id:"product-1",name:"RecordShield"}],roleAssignments:[{id:"owner",name:"Founder"}]};
assert.deepEqual(CAMPAIGN_GOAL_TYPES.map((type)=>type.label),["Partner outreach","Customer re-engagement","Announcement"]);
const view=buildCampaignGoalStep(state,actor,"campaign:goal-1");assert.equal(view.fields.campaignName,"Saved name");assert.equal(view.relatedOptions.some((item)=>item.id==="hidden-program"),false);assert.equal(view.relatedOptions.length,2);
const invalid=validateCampaignGoalFields({campaignType:"internal_engine"});assert.equal(invalid.valid,false);assert.deepEqual(Object.keys(invalid.errors).sort(),["campaignName","campaignType","desiredOutcome","owner"]);
const plan=createCampaignGoalSavePlan(state,actor,"campaign:goal-1",{expectedVersion:0,fields:{campaignName:"Updated",campaignType:"partner_outreach",desiredOutcome:"Invite eligible synthetic Partners.",owner:"owner",relatedProgramOrProduct:"program-1"}},"2026-07-19T17:00:00.000Z");assert.equal(plan.ok,true);assert.equal(plan.fields.campaignWizardDraft.goal.campaignType,"partner_outreach");assert.equal(plan.execution.sends,false);
const html=renderCampaignGoalStep(view,{campaignName:"Enter a Campaign name."});assert.match(html,/aria-invalid="true"/);assert.match(html,/aria-describedby="campaign-goal-campaignName-error"/);assert.match(html,/Partner outreach/);assert.doesNotMatch(html,/internal_engine|outreachCampaigns|reactivationCampaign/);
console.log("PASS test-vnext-campaign-goal-step");
