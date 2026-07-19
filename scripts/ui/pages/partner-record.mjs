import { escapeAttribute, escapeHtml } from "../html.mjs";

const clean = (value = "") => String(value ?? "").trim();
const display = (value, fallback = "Unavailable") => escapeHtml(clean(value) || fallback);
const date = (value) => value ? escapeHtml(new Intl.DateTimeFormat("en-US", { timeZone:"UTC", month:"short", day:"numeric", year:"numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`))) : "Unavailable";

function overview(view) {
  const relationship = view.overview.relationship;
  const contacts = view.overview.contacts.available
    ? view.overview.contacts.items.length ? `<ul>${view.overview.contacts.items.map((item) => `<li><strong>${display(item.name, "Contact")}</strong><span>${display(item.title, "Role unavailable")}</span>${item.email ? `<span>${escapeHtml(item.email)}</span>` : ""}</li>`).join("")}</ul>` : "<p>No contacts recorded.</p>"
    : "<p>Contact details require additional access.</p>";
  const notes = view.overview.notes.available
    ? view.overview.notes.items.length ? `<ul>${view.overview.notes.items.map((item) => `<li>${escapeHtml(item.summary)}</li>`).join("")}</ul>` : "<p>No relationship notes recorded.</p>"
    : "<p>Relationship notes require additional access.</p>";
  return `<div class="partner-record-grid"><section><h2>Relationship</h2><dl><div><dt>Type</dt><dd>${display(relationship.type)}</dd></div><div><dt>Geography</dt><dd>${display(relationship.geography)}</dd></div><div><dt>Opportunity</dt><dd>${display(relationship.opportunity)}</dd></div><div><dt>Blocker</dt><dd>${display(relationship.blocker)}</dd></div></dl></section><section><h2>Contacts</h2>${contacts}</section><section><h2>Notes</h2>${notes}</section><section><h2>Programs</h2>${view.overview.programs.length ? `<ul>${view.overview.programs.map((program) => `<li><strong>${display(program.name, "Program")}</strong><span>${display(program.status)}</span></li>`).join("")}</ul>` : "<p>No programs recorded.</p>"}</section></div>`;
}

function activity(view) {
  if (!view.activity.available) return "<div class=partner-record-state><h2>Activity unavailable</h2><p>This account cannot read Partner activity.</p></div>";
  if (!view.activity.events.length) return "<div class=partner-record-state><h2>No activity yet</h2><p>Log a reviewed interaction when one occurs.</p></div>";
  return `<ol class="partner-activity-list">${view.activity.events.map((event) => `<li><span>${escapeHtml(event.label)}</span><strong>${escapeHtml(event.summary)}</strong><time>${date(event.occurredAt)}</time>${event.sourceHref ? `<a href="${escapeAttribute(event.sourceHref)}">Open source</a>` : ""}</li>`).join("")}</ol>`;
}

function outreach(view) {
  if (!view.outreach.available) return `<div class="partner-record-state"><h2>Outreach unavailable</h2><p>This account cannot read related Campaigns.</p></div>`;
  const campaigns = view.outreach.campaigns.length ? `<ul class="partner-related-list">${view.outreach.campaigns.map((campaign) => `<li><div><strong>${escapeHtml(campaign.name)}</strong><span>${escapeHtml(campaign.status.label)}</span></div>${campaign.href ? `<a href="${escapeAttribute(campaign.href)}" aria-label="Open Campaign: ${escapeAttribute(campaign.name)}">Open Campaign</a>` : ""}</li>`).join("")}</ul>` : `<div class="partner-record-state"><h2>No Campaigns yet</h2><p>Create a draft when outreach is ready for review.</p></div>`;
  const suggestions = view.outreach.suggestions.length ? `<section class="partner-suggestions"><h2>Reviewed reply suggestions</h2>${view.outreach.suggestions.map((item) => `<article><p>${escapeHtml(item.evidence.summary)}</p><strong>${item.applied ? "Applied stage" : "Suggested stage"}: ${escapeHtml(item.proposedUiStage.label)}</strong>${item.applied ? '<span class="suggestion-applied">Applied</span>' : `<button type="button" data-stage-suggestion="${escapeAttribute(item.id)}">Review and apply</button>`}</article>`).join("")}</section>` : "";
  return `${campaigns}${suggestions}`;
}

function files(view) {
  if (!view.files.available) return `<div class="partner-record-state"><h2>Files unavailable</h2><p>This account cannot read Partner Files.</p></div>`;
  const actions = `<div class="partner-file-actions"><button type="button" data-partner-artifact="proposal">Create proposal</button><button type="button" data-partner-artifact="landing_page">Create co-branded landing page</button><button type="button" data-partner-artifact="weekly_report">Create weekly report</button><button type="button" data-partner-artifact="final_report">Create final impact report</button><button type="button" data-partner-artifact="program">Create program record</button></div>`;
  const items = view.files.items.length ? `<ul class="partner-file-list">${view.files.items.map((file) => `<li><div><strong>${display(file.name, "File")}</strong><span>${display(file.status?.label)} · ${display(file.fileType?.label)}</span></div><a href="${escapeAttribute(file.href)}" aria-label="Open File: ${escapeAttribute(file.name || "File")}">Open File</a></li>`).join("")}</ul>` : `<div class="partner-record-state"><h2>No Files yet</h2><p>Add a File record or create a reviewed program artifact.</p></div>`;
  return `${actions}${items}`;
}

function deferred(title, action) { return `<div class="partner-record-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(action)} integration is ready for shared-shell registration. No external action has occurred.</p></div>`; }

export function partnerRecordPageHtml(view = null) {
  if (!view) return `<section class="partner-record-page" data-partner-record aria-busy="true"><div role="status">Loading Partner record</div></section>`;
  if (!view.available) return `<section class="partner-record-page" data-partner-record><div class="partner-record-state" role="alert"><h1>Partner not available</h1><p>The record was not found or this account cannot view it.</p></div></section>`;
  const tabContent = view.selectedTab === "activity" ? activity(view) : view.selectedTab === "outreach" ? outreach(view) : view.selectedTab === "files" ? files(view) : overview(view);
  return `<section class="partner-record-page" data-partner-record aria-labelledby="partner-record-title" aria-busy="false">
    <a class="partner-record-back" href="#partners">← All Partners</a>
    <header class="partner-record-header"><div><p class="eyebrow">Partner</p><h1 id="partner-record-title">${escapeHtml(view.header.name)}</h1><div class="partner-record-badges"><span>${escapeHtml(view.header.stage.label)}</span><span>${escapeHtml(view.header.health.label)}</span><span>${display(view.header.owner)}</span></div></div><div class="partner-next-action"><p>Next action</p><strong>${display(view.header.nextAction.summary, "No next action recorded")}</strong><span>Due ${date(view.header.nextAction.dueAt)}</span>${view.header.nextAction.available ? `<button type="button" data-partner-action="complete_next_action" data-endpoint="${escapeAttribute(view.header.nextAction.completeEndpoint)}">Complete next action</button>` : ""}</div></header>
    <div class="partner-record-actions"><button type="button" data-partner-action="log_activity">Log activity</button><button type="button" data-partner-action="create_outreach">Create outreach</button><button type="button" data-partner-action="add_file">Add file</button></div>
    <nav class="partner-record-tabs" aria-label="Partner record sections">${view.tabs.map((tab) => `<a href="${escapeAttribute(view.href)}?tab=${tab.key}"${view.selectedTab === tab.key ? ' aria-current="page"' : ""}>${escapeHtml(tab.label)}</a>`).join("")}</nav>
    <div class="partner-record-content">${tabContent}</div><div class="partner-record-announcement" role="status" aria-live="polite"></div>
  </section>`;
}
