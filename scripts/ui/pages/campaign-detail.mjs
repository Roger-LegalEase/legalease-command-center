import { escapeAttribute, escapeHtml } from "../html.mjs";
import { CAMPAIGN_DETAIL_TABS } from "../../campaign-detail-service.mjs";

export const CAMPAIGN_DETAIL_STYLESHEET_PATH = "assets/ui/campaign-detail.css";
const value = (input) => input === null || input === undefined || input === "" ? '<span class="campaign-detail-unavailable">Unavailable</span>' : escapeHtml(String(input));
const metric = (label, input) => `<div><dt>${escapeHtml(label)}</dt><dd>${value(input)}</dd></div>`;

function panel(view) {
  const overview = view.overview;
  if (view.selectedTab === "messages") return `<section data-detail-panel="messages"><h2>Messages</h2><dl>${metric("Format", view.messages.mode?.label)}${metric("Summary", view.messages.summary)}${metric("Sequence", view.messages.sequenceName)}${metric("Steps", view.messages.stepCount)}${metric("First subject", view.messages.firstSubject)}</dl></section>`;
  if (view.selectedTab === "audience") return `<section data-detail-panel="audience"><h2>Audience</h2><dl>${metric("Summary", view.audience.summary)}${metric("Included", view.audience.includedCount)}${metric("Excluded", view.audience.excluded?.count)}</dl></section>`;
  if (view.selectedTab === "replies") return `<section data-detail-panel="replies"><h2>Replies</h2><dl>${metric("Replies", view.replies.count)}</dl></section>`;
  if (view.selectedTab === "results") return `<section data-detail-panel="results"><h2>Results</h2><dl>${metric("Summary", view.results.summary)}${Object.entries(view.results.metrics || {}).map(([key, input]) => metric(key.replaceAll(/([A-Z])/g, " $1"), input)).join("")}</dl></section>`;
  if (view.selectedTab === "activity") return `<section data-detail-panel="activity"><h2>Activity</h2><ol>${view.activity.map((item) => `<li><strong>${escapeHtml(item.kind)}</strong> ${value(item.status)} <time datetime="${escapeAttribute(item.occurredAt || "")}">${value(item.occurredAt)}</time></li>`).join("") || "<li>Activity unavailable</li>"}</ol></section>`;
  return `<section data-detail-panel="overview"><h2>Overview</h2><dl>${metric("Current status", overview.status?.label)}${metric("Next action", overview.nextAction)}${metric("Progress", overview.progress?.sent === null ? null : `${overview.progress.sent} sent`)}${metric("Schedule", overview.schedule?.scheduledAt)}${metric("Audience", overview.audience?.summary || overview.audience?.includedCount)}${metric("Outcome", overview.outcome?.outcomeSummary)}</dl></section>`;
}

export function renderCampaignDetail(view = {}) {
  if (!view.available) return `<section class="campaign-detail-state"><h1>Campaign not available</h1><p>This Campaign may have been removed or this account may not be allowed to view it.</p></section>`;
  const campaign = view.campaign;
  return `<section class="campaign-detail" data-campaign-detail data-campaign-identity="${escapeAttribute(campaign.stableIdentity)}"><header><p class="campaign-detail-eyebrow">Outreach campaign</p><h1>${escapeHtml(campaign.name || "Unnamed Campaign")}</h1><span class="campaign-detail-status">${escapeHtml(campaign.status.label)}</span></header><nav role="tablist" aria-label="Campaign detail">${CAMPAIGN_DETAIL_TABS.map((tab) => `<a role="tab" href="${escapeAttribute(campaign.href)}?tab=${tab.key}" aria-selected="${tab.key === view.selectedTab}">${escapeHtml(tab.label)}</a>`).join("")}</nav><div class="campaign-detail-content">${panel(view)}</div><div class="campaign-detail-actions">${view.capabilities.pause ? '<button type="button" data-campaign-action="pause">Pause campaign</button>' : ""}${view.capabilities.resume ? '<button type="button" data-campaign-action="resume">Resume campaign</button>' : ""}</div><p>Scheduled is not sent. Approved is not executed. Paused is not completed.</p></section>`;
}
