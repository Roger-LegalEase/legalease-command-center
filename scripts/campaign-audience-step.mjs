import { createHash } from "node:crypto";
import { recordVisibleToActor } from "./global-search-service.mjs";
import { buildCampaignWizardView, createCampaignWizardSavePlan } from "./campaign-wizard-service.mjs";

const clean=(value="",maximum=240)=>String(value??"").trim().slice(0,maximum);
const list=(value)=>Array.isArray(value)?value:[];
const lower=(value)=>clean(value).toLocaleLowerCase("en-US");
export const CAMPAIGN_AUDIENCE_LIMITS=Object.freeze({default:25,maximum:50});

function deepFreeze(value){if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
function ref(kind,id){return `${kind}:${id}`;}
function candidateRecords(state,actor){
  const sources=[
    ["partner",list(state.partners)],
    ["customer",list(state.companyContacts).filter((record)=>record.isCustomer===true||record.is_customer===true||lower(record.type)==="customer")],
    ["customer",list(state.reactivationContacts)]
  ];
  const seen=new Set(); const result=[];
  for(const [kind,records] of sources)for(const record of records){
    if(!recordVisibleToActor(record,actor))continue;
    const id=clean(record.id||record.contact_id||record.contactId);if(!id||seen.has(ref(kind,id)))continue;seen.add(ref(kind,id));
    result.push({kind,id,record});
  }
  return result;
}
function selectedRefs(draft,state,actor){
  const selected=list(draft?.audience?.selection).map((item)=>({sourceKind:clean(item?.sourceKind,40),sourceId:clean(item?.sourceId)})).filter((item)=>["partner","customer"].includes(item.sourceKind)&&item.sourceId);
  const segmentId=clean(draft?.audience?.segmentId);
  const segment=list(state.audienceSegments).filter((item)=>recordVisibleToActor(item,actor)).find((item)=>clean(item.id)===segmentId);
  for(const item of list(segment?.memberRefs)){const sourceKind=clean(item.sourceKind,40),sourceId=clean(item.sourceId);if(["partner","customer"].includes(sourceKind)&&sourceId)selected.push({sourceKind,sourceId});}
  return new Set(selected.map((item)=>ref(item.sourceKind,item.sourceId)));
}
function linked(records,id){return list(records).some((item)=>clean(item.contact_id||item.contactId||item.partner_id||item.partnerId)===id);}
function eligibility(candidate,state){
  const record=candidate.record;const reasons=[];
  if(record.do_not_contact===true||record.doNotContact===true)reasons.push("Do not contact");
  if(record.unsubscribed===true||lower(record.status)==="unsubscribed"||linked(state.outreachUnsubscribes,candidate.id))reasons.push("Unsubscribed");
  if(record.suppressed===true||record.manually_suppressed===true||record.manuallySuppressed===true||linked(state.outreachSuppressions,candidate.id))reasons.push("Suppressed");
  if(record.bounced===true||lower(record.status)==="bounced"||linked(state.outreachBounces,candidate.id))reasons.push("Bounced");
  if(record.complained===true||linked(state.outreachComplaints,candidate.id))reasons.push("Complained");
  if(record.campaign_hold===true||record.campaignHold===true||record.held===true)reasons.push("Held");
  const email=clean(record.email||record.primaryContactEmail||record.primary_contact_email,320);
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))reasons.push("Invalid or missing delivery address");
  return [...new Set(reasons)];
}
function label(candidate){const record=candidate.record;return clean(record.organizationName||record.organization||record.name||record.companyName,160)||`${candidate.kind==="partner"?"Partner":"Customer"} record`;}
function facet(candidate,key){const record=candidate.record;if(key==="tag")return list(record.tags).map(lower);return lower(record[key]||record[key.replace(/[A-Z]/g,(letter)=>`_${letter.toLowerCase()}`)]);}
function matches(candidate,filters){for(const key of ["stage","type","geography","owner","status"]){if(filters[key]&&facet(candidate,key)!==filters[key])return false;}if(filters.tag&&!facet(candidate,"tag").includes(filters.tag))return false;return true;}
function filtersOf(input={}){const result={};for(const key of ["stage","type","geography","owner","status","tag"]){const value=lower(input[key]);if(value)result[key]=value;}return result;}
function pageSize(value){if(value===undefined||value===null||value==="")return CAMPAIGN_AUDIENCE_LIMITS.default;const number=Number(value);if(!Number.isSafeInteger(number)||number<1||number>CAMPAIGN_AUDIENCE_LIMITS.maximum)throw new Error("Invalid audience page size.");return number;}
function cursorOffset(cursor,signature){if(!cursor)return 0;const match=/^audience-([a-f0-9]{12})-(\d{1,8})$/.exec(clean(cursor));if(!match||match[1]!==signature)throw new Error("Invalid audience cursor.");return Number(match[2]);}

export function buildCampaignAudienceStep(state={},actor={},stableIdentity="",options={}){
  const wizard=buildCampaignWizardView(state,actor,stableIdentity);if(!wizard.available)return deepFreeze({...wizard,step:"audience",items:[],counts:{included:null,excluded:null},executionInput:[]});
  const selected=selectedRefs(wizard.draft,state,actor);const filters=filtersOf(options.filters||wizard.draft.audience?.filters);const candidates=candidateRecords(state,actor).filter((candidate)=>selected.size?selected.has(ref(candidate.kind,candidate.id)):false).filter((candidate)=>matches(candidate,filters));
  const projected=candidates.map((candidate)=>{const reasons=eligibility(candidate,state);return{sourceKind:candidate.kind,sourceId:candidate.id,label:label(candidate),eligible:reasons.length===0,exclusionReasons:reasons};}).sort((a,b)=>a.label.localeCompare(b.label,"en-US")||a.sourceId.localeCompare(b.sourceId,"en-US"));
  const included=projected.filter((item)=>item.eligible);const excluded=projected.filter((item)=>!item.eligible);const executionInput=included.map((item)=>({sourceKind:item.sourceKind,sourceId:item.sourceId}));
  const signature=createHash("sha256").update(JSON.stringify({stableIdentity,filters,selected:[...selected].sort()})).digest("hex").slice(0,12);const limit=pageSize(options.limit);const offset=cursorOffset(options.cursor,signature);const items=projected.slice(offset,offset+limit);const next=offset+items.length;
  return deepFreeze({ok:true,authorized:true,available:true,step:"audience",campaign:wizard.campaign,draftVersion:wizard.draftVersion,filters,segments:list(state.audienceSegments).filter((item)=>recordVisibleToActor(item,actor)).map((item)=>({id:clean(item.id),label:clean(item.name||item.label,160)})).filter((item)=>item.id&&item.label),items,counts:{selected:projected.length,included:included.length,excluded:excluded.length},executionInput,executionFingerprint:createHash("sha256").update(JSON.stringify(executionInput)).digest("hex"),nextCursor:next<projected.length?`audience-${signature}-${next}`:null,capabilities:{...wizard.capabilities,restoresExcluded:false,overridesEligibility:false}});
}

export function createCampaignAudienceSavePlan(state={},actor={},stableIdentity="",input={},now=""){
  const selection=list(input.selection).map((item)=>({sourceKind:clean(item?.sourceKind,40),sourceId:clean(item?.sourceId)})).filter((item)=>["partner","customer"].includes(item.sourceKind)&&item.sourceId);
  const unique=[...new Map(selection.map((item)=>[ref(item.sourceKind,item.sourceId),item])).values()];
  return createCampaignWizardSavePlan(state,actor,stableIdentity,{step:"audience",expectedVersion:input.expectedVersion,fields:{selection:unique,segmentId:clean(input.segmentId),filters:filtersOf(input.filters),selectionConfirmed:input.selectionConfirmed===true}},now);
}
