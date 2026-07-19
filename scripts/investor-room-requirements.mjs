const requirement = (value) => Object.freeze({ ...value, sourceRefs:Object.freeze([...value.sourceRefs]), acceptedSourceKinds:Object.freeze([...value.acceptedSourceKinds]) });

export const INVESTOR_ROOM_REQUIREMENTS_VERSION = "v1.1";

// Integration-owned, reviewed registry. Completion is based only on these exact
// source identities; filenames and mutable display titles are never consulted.
export const INVESTOR_ROOM_REQUIREMENTS = Object.freeze([
  requirement({ id:"company-overview", section:"Company", name:"Company overview", acceptedSourceKinds:["data-room-item"], sourceRefs:["data-room-item:company-overview"], ownerRule:"founder", owner:"Founder", required:true, staleAfterDays:365 }),
  requirement({ id:"financial-plan", section:"Financial", name:"Current financial plan", acceptedSourceKinds:["report", "data-room-item"], sourceRefs:["report:current-financial-plan", "data-room-item:current-financial-plan"], ownerRule:"finance-owner", owner:"Finance owner", required:true, staleAfterDays:90 }),
  requirement({ id:"product-overview", section:"Product", name:"Product overview", acceptedSourceKinds:["data-room-item"], sourceRefs:["data-room-item:product-overview"], ownerRule:"product-owner", owner:"Product owner", required:true, staleAfterDays:180 }),
  requirement({ id:"traction-update", section:"Traction", name:"Current traction update", acceptedSourceKinds:["report"], sourceRefs:["report:current-traction-update"], ownerRule:"founder", owner:"Founder", required:true, staleAfterDays:45 }),
  requirement({ id:"legal-compliance", section:"Legal & Compliance", name:"Legal and compliance review", acceptedSourceKinds:["data-room-item", "soc2-evidence", "soc2-policy"], sourceRefs:["data-room-item:legal-compliance-review", "soc2-evidence:legal-compliance-review", "soc2-policy:legal-compliance-review"], ownerRule:"compliance-owner", owner:"Compliance owner", required:true, staleAfterDays:180 }),
  requirement({ id:"team-overview", section:"Team", name:"Team overview", acceptedSourceKinds:["data-room-item"], sourceRefs:["data-room-item:team-overview"], ownerRule:"founder", owner:"Founder", required:true, staleAfterDays:180 }),
  requirement({ id:"partner-impact", section:"Traction", name:"Partner impact report", acceptedSourceKinds:["report"], sourceRefs:["report:partner-impact-report"], ownerRule:"relationship-owner", owner:"Relationship owner", required:false, staleAfterDays:90 })
]);

export function investorRoomRequirementConfiguration() {
  return Object.freeze({ version:INVESTOR_ROOM_REQUIREMENTS_VERSION, requirements:INVESTOR_ROOM_REQUIREMENTS });
}
