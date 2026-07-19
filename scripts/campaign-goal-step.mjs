import { recordVisibleToActor } from "./global-search-service.mjs";
import { buildCampaignWizardView, createCampaignWizardSavePlan } from "./campaign-wizard-service.mjs";

const clean = (value = "", maximum = 1000) => String(value ?? "").trim().slice(0, maximum);
export const CAMPAIGN_GOAL_TYPES = Object.freeze([
  Object.freeze({ key:"partner_outreach", label:"Partner outreach", guidance:"Build a thoughtful introduction or follow-up for an eligible Partner audience." }),
  Object.freeze({ key:"customer_reengagement", label:"Customer re-engagement", guidance:"Reconnect with eligible customers without weakening suppression or consent rules." }),
  Object.freeze({ key:"announcement", label:"Announcement", guidance:"Share one clear update with an eligible selected audience." })
]);

function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
function options(records, actor) {
  return (Array.isArray(records) ? records : []).filter((record) => recordVisibleToActor(record, actor)).map((record) => ({ id:clean(record.id, 240), label:clean(record.name || record.title || record.programName || record.productName, 160) })).filter((item) => item.id && item.label).sort((a,b)=>a.label.localeCompare(b.label,"en-US"));
}

export function validateCampaignGoalFields(input = {}) {
  const fields={ campaignName:clean(input.campaignName,160), campaignType:clean(input.campaignType,80), desiredOutcome:clean(input.desiredOutcome,1000), relatedProgramOrProduct:clean(input.relatedProgramOrProduct,240), owner:clean(input.owner,160) };
  const errors={};
  if (!fields.campaignName) errors.campaignName="Enter a Campaign name.";
  if (!CAMPAIGN_GOAL_TYPES.some((type)=>type.key===fields.campaignType)) errors.campaignType="Choose a supported Campaign type.";
  if (!fields.desiredOutcome) errors.desiredOutcome="Describe the desired outcome.";
  if (!fields.owner) errors.owner="Choose an owner.";
  return deepFreeze({ valid:Object.keys(errors).length===0, fields, errors });
}

export function buildCampaignGoalStep(state = {}, actor = {}, stableIdentity = "") {
  const wizard=buildCampaignWizardView(state,actor,stableIdentity);
  if (!wizard.available) return deepFreeze({ ...wizard, step:"goal", fields:null, types:CAMPAIGN_GOAL_TYPES, relatedOptions:[], owners:[] });
  const goal=wizard.draft.goal || {};
  return deepFreeze({
    ok:true, authorized:true, available:true, step:"goal", campaign:wizard.campaign, draftVersion:wizard.draftVersion,
    fields:{ campaignName:clean(goal.campaignName || wizard.campaign.name,160), campaignType:clean(goal.campaignType,80), desiredOutcome:clean(goal.desiredOutcome,1000), relatedProgramOrProduct:clean(goal.relatedProgramOrProduct,240), owner:clean(goal.owner,160) },
    types:CAMPAIGN_GOAL_TYPES,
    relatedOptions:[...options(state.partnerPrograms,actor),...options(state.products,actor)],
    owners:options(state.roleAssignments,actor).map((item)=>({id:item.id,label:item.label})),
    capabilities:wizard.capabilities
  });
}

export function createCampaignGoalSavePlan(state = {}, actor = {}, stableIdentity = "", input = {}, now = "") {
  const validation=validateCampaignGoalFields(input.fields);
  if (!validation.valid) return deepFreeze({ ok:false, status:400, outcome:"validation_error", errors:validation.errors, execution:{sends:false,launches:false} });
  return createCampaignWizardSavePlan(state,actor,stableIdentity,{step:"goal",fields:validation.fields,expectedVersion:input.expectedVersion},now);
}
