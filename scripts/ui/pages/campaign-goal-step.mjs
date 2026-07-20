import { escapeAttribute, escapeHtml } from "../html.mjs";

function errorFor(errors, field) { return errors?.[field] ? `<p class="campaign-field-error" id="campaign-goal-${field}-error">${escapeHtml(errors[field])}</p>` : ""; }
function describedBy(errors, field) { return errors?.[field] ? ` aria-describedby="campaign-goal-${field}-error" aria-invalid="true"` : ""; }

export function renderCampaignGoalStep(view = {}, errors = {}) {
  const fields=view.fields || {}; const types=Array.isArray(view.types)?view.types:[]; const related=Array.isArray(view.relatedOptions)?view.relatedOptions:[]; const owners=Array.isArray(view.owners)?view.owners:[];
  return `<div class="campaign-step-fields" data-campaign-goal-step>
    <label>Campaign name<input name="campaignName" maxlength="160" required value="${escapeAttribute(fields.campaignName||"")}"${describedBy(errors,"campaignName")}></label>${errorFor(errors,"campaignName")}
    <label>Campaign type<select name="campaignType" required${describedBy(errors,"campaignType")}><option value="">Choose a type</option>${types.map((type)=>`<option value="${escapeAttribute(type.key)}"${type.key===fields.campaignType?" selected":""}>${escapeHtml(type.label)}</option>`).join("")}</select></label>${errorFor(errors,"campaignType")}
    <p class="campaign-type-guidance" data-campaign-type-guidance>${escapeHtml(types.find((type)=>type.key===fields.campaignType)?.guidance||"Choose the Campaign type that best matches the founder goal.")}</p>
    <label>Desired outcome<textarea name="desiredOutcome" maxlength="1000" required${describedBy(errors,"desiredOutcome")}>${escapeHtml(fields.desiredOutcome||"")}</textarea></label>${errorFor(errors,"desiredOutcome")}
    <label>Related Partner program or product <span>(when applicable)</span><select name="relatedProgramOrProduct"><option value="">Not selected</option>${related.map((item)=>`<option value="${escapeAttribute(item.id)}"${item.id===fields.relatedProgramOrProduct?" selected":""}>${escapeHtml(item.label)}</option>`).join("")}</select></label>
    <label>Owner<select name="owner" required${describedBy(errors,"owner")}><option value="">Choose an owner</option>${owners.map((item)=>`<option value="${escapeAttribute(item.id)}"${item.id===fields.owner?" selected":""}>${escapeHtml(item.label)}</option>`).join("")}${fields.owner&&!owners.some((item)=>item.id===fields.owner)?`<option value="${escapeAttribute(fields.owner)}" selected>${escapeHtml(fields.owner)}</option>`:""}</select></label>${errorFor(errors,"owner")}
  </div>`;
}
