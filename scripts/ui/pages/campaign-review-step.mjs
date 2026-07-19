import { escapeHtml } from "../html.mjs";

export function renderCampaignLaunchConfirmation(view = {}) {
  const label = view.policy?.primaryLabel || "Campaign action";
  return `<dialog class="campaign-launch-dialog" data-campaign-launch-dialog aria-labelledby="campaign-launch-dialog-title"><h3 id="campaign-launch-dialog-title">Confirm ${escapeHtml(label)}</h3><p>${escapeHtml(view.summary?.who || "Audience unavailable")} will receive ${escapeHtml(view.summary?.what || "the reviewed message")} ${escapeHtml(view.summary?.when || "at the reviewed time")}.</p><p>Safety, suppression, approval, connection, and environment checks run again on the server.</p><div><button type="button" data-launch-cancel>Go back</button><button type="button" data-launch-confirm>Confirm ${escapeHtml(label)}</button></div></dialog>`;
}

export function renderCampaignReviewStep(view = {}) {
  return `<div class="campaign-review-step" data-campaign-review-step><section class="campaign-review-summary" aria-label="Campaign summary"><h3>Who receives what and when</h3><dl><div><dt>Who</dt><dd>${escapeHtml(view.summary?.who || "Unavailable")}</dd></div><div><dt>What</dt><dd>${escapeHtml(view.summary?.what || "Unavailable")}</dd></div><div><dt>When</dt><dd>${escapeHtml(view.summary?.when || "Unavailable")}</dd></div></dl></section><ul class="campaign-review-checklist" aria-label="Launch checklist">${(view.checks || []).map((item) => `<li data-check-state="${escapeHtml(item.state)}"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail || item.state)}</span></li>`).join("")}</ul><div class="campaign-review-actions"><button type="button" data-review-test${view.capabilities?.sendTest ? "" : " disabled"}>Send test</button><button type="button" data-review-primary${view.ready ? "" : " disabled"}>${escapeHtml(view.policy?.primaryLabel || "Launch unavailable")}</button></div><p>Approval does not execute the Campaign. Current safety checks run again on the server before any send.</p>${renderCampaignLaunchConfirmation(view)}</div>`;
}

export function campaignReviewBrowserSource() {
  return `(()=>{"use strict";const root=document.querySelector("[data-campaign-review-step]"),dialog=root?.querySelector("[data-campaign-launch-dialog]"),open=root?.querySelector("[data-review-primary]"),cancel=dialog?.querySelector("[data-launch-cancel]"),confirm=dialog?.querySelector("[data-launch-confirm]");open?.addEventListener("click",()=>{if(!open.disabled){dialog.showModal();cancel?.focus();}});cancel?.addEventListener("click",()=>dialog.close());confirm?.addEventListener("click",()=>{dialog.close();root.dispatchEvent(new CustomEvent("campaign:review-action",{bubbles:true,detail:{action:"primary"}}));});})();`;
}
