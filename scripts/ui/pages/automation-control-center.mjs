import { AUTOMATION_CONTROL_CENTER_ENDPOINT } from "../../automation-control-center-api.mjs";

export const AUTOMATION_CONTROL_CENTER_STYLESHEET_PATH = "assets/ui/automation-control-center.css";
export const AUTOMATION_CONTROL_CENTER_CONTRACT = Object.freeze({
  endpoint:AUTOMATION_CONTROL_CENTER_ENDPOINT,
  route:"outreach",
  view:"automation",
  directRoutes:Object.freeze(["automation", "automation-control", "automation-control-center"])
});

export function renderAutomationControlCenterLoading() {
  return `<section class="founder-automation" data-automation-control-center aria-labelledby="founder-automation-title">
    <header class="founder-automation__header">
      <div>
        <div class="founder-automation__heading-line"><p class="founder-automation__eyebrow">Outreach</p><span class="founder-automation__review-badge">Review only</span></div>
        <h1 id="founder-automation-title">Automation Control Center</h1>
        <p>Review audiences, approved copy, replies, safeguards, and readiness. Nothing on this page can start, release, enroll, or send.</p>
      </div>
      <button class="founder-automation__refresh" type="button" data-automation-refresh aria-busy="true" disabled>Refresh</button>
    </header>
    <div class="founder-automation__message" data-automation-message role="status" aria-live="polite" hidden></div>
    <dl class="founder-automation__summary" aria-label="Automation review summary">
      <div data-state="ready"><dt>Ready for review</dt><dd data-automation-count="readyForReview">—</dd></div>
      <div data-state="attention"><dt>Needs attention</dt><dd data-automation-count="needsAttention">—</dd></div>
      <div data-state="unavailable"><dt>Unavailable</dt><dd data-automation-count="unavailable">—</dd></div>
      <div><dt>Last reviewed</dt><dd data-automation-generated>Loading…</dd></div>
    </dl>
    <nav class="founder-automation__tabs" data-automation-tabs aria-label="Automation lanes" role="tablist">
      <button type="button" role="tab" aria-selected="true" aria-controls="founder-automation-panel" data-automation-lane="reactivation">Reactivation <span data-lane-state="reactivation">Loading</span></button>
      <button type="button" role="tab" aria-selected="false" aria-controls="founder-automation-panel" tabindex="-1" data-automation-lane="partner-prospect-outreach">Partner prospects <span data-lane-state="partner-prospect-outreach">Loading</span></button>
      <button type="button" role="tab" aria-selected="false" aria-controls="founder-automation-panel" tabindex="-1" data-automation-lane="press-outreach">Press outreach <span data-lane-state="press-outreach">Loading</span></button>
    </nav>
    <div class="founder-automation__loading" data-automation-loading role="status" aria-label="Loading automation review">
      <span class="founder-automation__sr-only">Loading automation review</span>
      <div class="founder-automation__skeleton founder-automation__skeleton--wide" aria-hidden="true"><span></span><strong></strong><i></i><i></i></div>
      <div class="founder-automation__skeleton-grid" aria-hidden="true">
        ${Array.from({ length:6 }, () => `<div class="founder-automation__skeleton"><span></span><strong></strong><i></i></div>`).join("")}
      </div>
    </div>
    <div class="founder-automation__state" data-automation-state hidden></div>
    <div class="founder-automation__content" id="founder-automation-panel" data-automation-content role="tabpanel" tabindex="0" hidden></div>
  </section>`;
}

export function automationControlCenterBrowserSource() {
  const contract = JSON.stringify(AUTOMATION_CONTROL_CENTER_CONTRACT).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderAutomationControlCenterLoading()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const loadingHtml = ${loadingHtml};
    const selectionKey = "legalease-founder-automation-lane";
    const metrics = { requests:0, duplicateRequests:0, staleRequestsAborted:0, renderedLanes:0, mutations:0, externalActions:0, providerCalls:0, fullStateRequests:0, lastResponseBytes:0 };
    window.__LE_AUTOMATION_CONTROL_CENTER_METRICS = metrics;
    let currentView = null;
    let activeRequest = null;
    let requestSequence = 0;
    let selectedLane = "reactivation";
    let sessionEnded = false;
    let observerQueued = false;
    let bootWaitTimer = null;

    function main() { return document.querySelector("main#app"); }
    function rawRoute() { return String(location.hash || "#today").slice(1).split(/[/?]/)[0].toLocaleLowerCase("en-US"); }
    function routeQuery() { return new URLSearchParams(String(location.hash || "").split("?")[1] || ""); }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function onRoute() {
      if (contract.directRoutes.includes(rawRoute())) return true;
      const resolved = resolution();
      return resolved?.kind === "page" && resolved.canonicalRoute === contract.route && routeQuery().get("view") === contract.view;
    }
    function host() { return main()?.querySelector("#campaigns.page-section.active,#outreach.page-section.active,#automation.page-section.active") || main(); }
    function root() { return host()?.querySelector("[data-automation-control-center]") || null; }
    function node(selector) { return root()?.querySelector(selector) || null; }
    function bounded(value, maximum = 500) { return String(value ?? "").replace(/[\\u0000-\\u001f\\u007f]/g, " ").replace(/\\s+/g, " ").trim().slice(0, maximum); }
    function text(tag, value, className = "") { const element = document.createElement(tag); element.textContent = bounded(value); if (className) element.className = className; return element; }
    function numeric(value) { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString("en-US") : "Unavailable"; }
    function percent(value) { const number = Number(value); return Number.isFinite(number) ? new Intl.NumberFormat("en-US", { style:"percent", maximumFractionDigits:1 }).format(number) : "Unavailable"; }
    function dateTime(value, fallback = "Unavailable") { const date = new Date(value || ""); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }).format(date) : fallback; }
    function cleanState(value) { const state = bounded(value, 60).toLocaleLowerCase("en-US"); if (state === "ready for review" || state === "ready") return "ready"; if (state === "needs attention" || state === "needs review" || state === "changes requested") return "attention"; if (state === "approved" || state === "within limits" || state === "monitoring") return "approved"; if (state === "unavailable") return "unavailable"; if (state.includes("pause") || state.includes("hold")) return "paused"; if (state.includes("active")) return "active"; return "neutral"; }
    function chip(value, className = "") { const element = text("span", value || "Unavailable", "founder-automation__chip" + (className ? " " + className : "")); element.dataset.state = cleanState(value); return element; }
    function loadSelection() { try { const saved = sessionStorage.getItem(selectionKey); if (["reactivation", "partner-prospect-outreach", "press-outreach"].includes(saved)) selectedLane = saved; } catch {} }
    function saveSelection() { try { sessionStorage.setItem(selectionKey, selectedLane); } catch {} }
    function ensureScaffold() {
      const target = host();
      if (!target || sessionEnded || main()?.querySelector("[data-vnext-shell-state='session_expired']")) return false;
      if (!target.querySelector("[data-automation-control-center]")) {
        const lee = target === main() ? target.querySelector(".lee-bubble-wrap") : null;
        target.innerHTML = loadingHtml;
        if (lee) target.append(lee);
        loadSelection();
        bindScaffold();
      }
      return true;
    }
    function setMessage(message = "", kind = "status") { const target = node("[data-automation-message]"); if (!target) return; target.hidden = !message; target.textContent = bounded(message, 240); target.dataset.kind = kind; target.setAttribute("role", kind === "error" ? "alert" : "status"); }
    function setRefreshBusy(busy) { const button = node("[data-automation-refresh]"); if (!button) return; button.disabled = busy; button.setAttribute("aria-busy", busy ? "true" : "false"); button.textContent = busy ? "Refreshing…" : "Refresh"; }
    function showLoading() { node("[data-automation-loading]")?.removeAttribute("hidden"); node("[data-automation-state]")?.setAttribute("hidden", ""); node("[data-automation-content]")?.setAttribute("hidden", ""); setRefreshBusy(true); }
    function actionButton(label, action) { const button = text("button", label); button.type = "button"; button.addEventListener("click", action); return button; }
    function renderState(kind, titleValue, messageValue, retry = false) {
      node("[data-automation-loading]")?.setAttribute("hidden", ""); node("[data-automation-content]")?.setAttribute("hidden", "");
      const target = node("[data-automation-state]"); if (!target) return;
      target.replaceChildren(); target.dataset.kind = kind; target.setAttribute("role", kind === "error" || kind === "unauthorized" ? "alert" : "status");
      const heading = text("h2", titleValue); if (kind === "error" || kind === "unauthorized") heading.tabIndex = -1;
      target.append(heading, text("p", messageValue)); if (retry) target.append(actionButton("Try again", () => load({ force:true })));
      target.hidden = false; setRefreshBusy(false); if (heading.tabIndex === -1) setTimeout(() => heading.focus(), 0);
    }
    function metricValue(value) { const number = Number(value); if (typeof value === "number" && Number.isFinite(number)) return number.toLocaleString("en-US"); return bounded(value, 80) || "Unavailable"; }
    function metricCard(label, value, detail = "") {
      const card = document.createElement("article"); card.className = "founder-automation__metric";
      card.append(text("p", label), text("strong", metricValue(value))); if (detail) card.append(text("span", detail)); return card;
    }
    function metricsGrid(items) { const grid = document.createElement("div"); grid.className = "founder-automation__metrics"; for (const item of items) grid.append(metricCard(item[0], item[1], item[2])); return grid; }
    function sectionHeading(kicker, titleValue, detail = "") { const wrapper = document.createElement("div"); wrapper.className = "founder-automation__section-heading"; const copy = document.createElement("div"); copy.append(text("p", kicker, "founder-automation__section-kicker"), text("h3", titleValue)); wrapper.append(copy); if (detail) wrapper.append(text("p", detail)); return wrapper; }
    function definition(label, value, { className = "", state = "" } = {}) { const wrapper = document.createElement("div"); if (className) wrapper.className = className; wrapper.append(text("dt", label)); const dd = document.createElement("dd"); if (state) dd.append(chip(value, state)); else dd.textContent = bounded(value || "Unavailable"); wrapper.append(dd); return wrapper; }
    function countLine(summary = {}) { return bounded([summary.total ? summary.total + " total" : "", summary.byStatus ? Object.entries(summary.byStatus).map(([key, value]) => numeric(value) + " " + key.replaceAll("_", " ")).join(" · ") : ""].filter(Boolean).join(" · "), 260) || "None recorded"; }
    function readinessPanel(lane) {
      const section = document.createElement("section"); section.className = "founder-automation__readiness"; section.dataset.state = cleanState(lane?.readiness?.state);
      const top = document.createElement("div"); top.className = "founder-automation__readiness-top";
      const heading = document.createElement("div"); heading.append(text("p", "Review readiness"), text("h2", lane?.label || "Automation lane")); top.append(heading, chip(lane?.readiness?.state || "Unavailable"));
      const facts = document.createElement("dl"); facts.className = "founder-automation__readiness-facts"; facts.append(definition("Current state", lane?.storedState || "Unavailable", { state:"record" }), definition("Information", lane?.availability || "Unavailable", { state:"availability" }));
      section.append(top, facts);
      const blockers = Array.isArray(lane?.readiness?.blockers) ? lane.readiness.blockers : [];
      const warnings = Array.isArray(lane?.readiness?.warnings) ? lane.readiness.warnings : [];
      if (blockers.length || warnings.length) {
        const notes = document.createElement("div"); notes.className = "founder-automation__readiness-notes";
        if (blockers.length) { const group = document.createElement("div"); group.append(text("h3", "Before this is ready")); const list = document.createElement("ul"); blockers.forEach((item) => { const li = document.createElement("li"); li.textContent = bounded(item, 240); list.append(li); }); group.append(list); notes.append(group); }
        if (warnings.length) { const group = document.createElement("div"); group.append(text("h3", "Worth reviewing")); const list = document.createElement("ul"); warnings.forEach((item) => { const li = document.createElement("li"); li.textContent = bounded(item, 240); list.append(li); }); group.append(list); notes.append(group); }
        section.append(notes);
      }
      return section;
    }
    function emptyReview(message) { const box = document.createElement("div"); box.className = "founder-automation__empty"; box.append(text("h3", "Nothing to review yet"), text("p", message)); return box; }
    function contactStatus(contact) {
      if (contact?.suppression?.suppressed) return contact.suppression.reason || "Not eligible";
      if (contact?.held) return "On hold";
      if (contact?.pausedSignals?.replied) return "Replied";
      if (contact?.eligible) return "Eligible";
      return "Not eligible";
    }
    function reactivationContact(contact) {
      const card = document.createElement("article"); card.className = "founder-automation__record";
      const top = document.createElement("div"); top.className = "founder-automation__record-top"; const identity = document.createElement("div"); identity.append(text("h4", contact?.name || "Customer"), text("p", contact?.email || "Contact information unavailable")); top.append(identity, chip(contactStatus(contact)));
      const facts = document.createElement("dl"); facts.className = "founder-automation__record-facts";
      facts.append(definition("Sequence", contact?.sequence?.id ? String(contact.sequence.id).replace("reactivation_", "").replaceAll("_", " ") : "Unavailable"), definition("Next touch", contact?.sequence?.nextTouch ? "Touch " + contact.sequence.nextTouch : "Unavailable"), definition("Next due", contact?.nextDueAt ? dateTime(contact.nextDueAt) : "Not scheduled"), definition("Attempts", countLine(contact?.attempts)));
      card.append(top, facts); return card;
    }
    function sequenceDetails(sequence) {
      const details = document.createElement("details"); details.className = "founder-automation__details";
      const summary = document.createElement("summary"); summary.append(text("strong", sequence?.label || "Sequence"), text("span", (sequence?.touches?.length || 0) + " touches · days " + (sequence?.cadenceDays || []).join(", "))); details.append(summary);
      const list = document.createElement("ol"); list.className = "founder-automation__touches";
      for (const touch of sequence?.touches || []) { const item = document.createElement("li"); const copy = document.createElement("div"); copy.append(text("strong", "Touch " + touch.touch + " · Day " + touch.day), text("span", touch.subject || "Subject unavailable")); if (touch.bodyPreview) copy.append(text("p", touch.bodyPreview, "founder-automation__touch-preview")); item.append(copy, chip(touch.approval || "Needs review")); list.append(item); }
      details.append(list); return details;
    }
    function renderReactivation(lane, target) {
      target.append(metricsGrid([
        ["Audience", lane?.audience?.total], ["Eligible", lane?.audience?.eligible], ["Due now", lane?.audience?.dueNow], ["Suppressed", lane?.audience?.suppressed], ["Attempts", lane?.activity?.attempts?.total], ["Replies", lane?.activity?.replies], ["Bounces", lane?.activity?.bounces], ["Complaints", lane?.activity?.complaints], ["Unsubscribes", lane?.activity?.unsubscribes], ["Delivery records", lane?.activity?.claims?.total], ["Unconfirmed delivery", lane?.activity?.claims?.unconfirmed]
      ]));
      const threshold = document.createElement("section"); threshold.className = "founder-automation__threshold"; threshold.dataset.state = cleanState(lane?.threshold?.state);
      threshold.append(sectionHeading("Safety thresholds", "Delivery guardrails", "Thresholds stay visible here so activation can be reviewed safely."));
      const top = document.createElement("div"); top.className = "founder-automation__threshold-top"; top.append(chip(lane?.threshold?.state || "Unavailable"));
      if (lane?.threshold?.belowSample) top.append(text("span", "Still gathering enough activity for a reliable comparison.")); threshold.append(top);
      threshold.append(metricsGrid([
        ["Sent in window", lane?.threshold?.rates?.sent], ["Hard bounce rate", percent(lane?.threshold?.rates?.hardBounce)], ["Complaint rate", percent(lane?.threshold?.rates?.spamComplaint)], ["Unsubscribe rate", percent(lane?.threshold?.rates?.unsubscribe)]
      ]));
      if (lane?.threshold?.reasons?.length) { const list = document.createElement("ul"); lane.threshold.reasons.forEach((reason) => { const li = document.createElement("li"); li.textContent = bounded(reason); list.append(li); }); threshold.append(list); }
      target.append(threshold);
      const sequenceSection = document.createElement("section"); sequenceSection.className = "founder-automation__section"; sequenceSection.append(sectionHeading("Approved content", "Current reactivation sequences", numeric(lane?.sequence?.approvedTouches) + " approved touches across the saved sequence variants."));
      const sequences = document.createElement("div"); sequences.className = "founder-automation__details-list"; for (const sequence of lane?.sequence?.variants || []) sequences.append(sequenceDetails(sequence)); sequenceSection.append(sequences); target.append(sequenceSection);
      const records = document.createElement("section"); records.className = "founder-automation__section"; records.append(sectionHeading("Audience review", "Customers and next touches", "Review eligibility, replies, holds, and due timing before any future activation."));
      const grid = document.createElement("div"); grid.className = "founder-automation__records"; (lane?.contacts || []).slice(0, 50).forEach((contact) => grid.append(reactivationContact(contact))); records.append(grid.childElementCount ? grid : emptyReview("No reactivation audience is available.")); target.append(records);
    }
    function replySummary(replies = []) { if (!replies.length) return "No reply recorded"; const latest = replies[0]; return bounded(latest.summary || latest.state || "Reply received", 220); }
    function partnerCandidate(candidate) {
      const card = document.createElement("article"); card.className = "founder-automation__record founder-automation__record--large";
      const top = document.createElement("div"); top.className = "founder-automation__record-top"; const identity = document.createElement("div"); identity.append(text("h4", candidate?.organization || "Organization"), text("p", candidate?.fitReason || "No fit reason recorded.")); top.append(identity, chip(Number.isFinite(Number(candidate?.score)) ? "Score " + candidate.score : "Score unavailable"));
      const facts = document.createElement("dl"); facts.className = "founder-automation__record-facts founder-automation__record-facts--wide";
      const duplicate = candidate?.duplicateOrExisting?.clear ? "No match found" : candidate?.duplicateOrExisting?.duplicate ? "Duplicate" : "Existing relationship";
      facts.append(definition("Contact", [candidate?.contact?.name, candidate?.contact?.email].filter(Boolean).join(" · ") || "Unavailable"), definition("Duplicate check", duplicate, { state:"duplicate" }), definition("Eligibility", candidate?.suppression?.suppressed ? candidate.suppression.reason || "Not eligible" : "Eligible", { state:"eligibility" }), definition("First touch", candidate?.firstTouch?.status || "Unavailable", { state:"approval" }), definition("Campaign", candidate?.campaign?.name || "Unavailable"), definition("Attempts", countLine(candidate?.attempts)), definition("Latest reply", replySummary(candidate?.replies)));
      const next = document.createElement("div"); next.className = "founder-automation__next-action"; next.append(text("span", "Suggested next action"), text("strong", candidate?.nextAction || "Review this prospect."));
      card.append(top, facts, next);
      if (candidate?.firstTouch?.subject || candidate?.firstTouch?.body || candidate?.firstTouch?.draftPreview) { const details = document.createElement("details"); details.className = "founder-automation__details"; const summary = document.createElement("summary"); summary.append(text("strong", "First-touch copy"), chip(candidate?.firstTouch?.status || "Unavailable")); details.append(summary); if (candidate.firstTouch.subject) details.append(text("p", candidate.firstTouch.subject, "founder-automation__copy-subject")); details.append(text("p", candidate.firstTouch.body || candidate.firstTouch.draftPreview || "Copy unavailable", "founder-automation__copy-body")); card.append(details); }
      if (candidate?.sequence?.length) { const details = document.createElement("details"); details.className = "founder-automation__details"; const summary = document.createElement("summary"); summary.append(text("strong", "Follow-up sequence"), text("span", candidate.sequence.length + " touches")); details.append(summary); const list = document.createElement("ol"); list.className = "founder-automation__touches"; candidate.sequence.forEach((step) => { const item = document.createElement("li"); const copy = document.createElement("div"); copy.append(text("strong", "Touch " + (step.touch || "—") + " · " + step.delayDays + " day delay"), text("span", step.subject || "Subject unavailable")); item.append(copy, chip(step.approval || "Needs review")); list.append(item); }); details.append(list); card.append(details); }
      return card;
    }
    function renderPartners(lane, target) {
      target.append(metricsGrid([
        ["Candidates", lane?.summary?.candidates], ["Pending review", lane?.summary?.pendingReview], ["Contactable", lane?.summary?.contactable], ["Duplicates or existing", lane?.summary?.duplicatesOrExisting], ["Suppressed or ineligible", lane?.summary?.suppressedOrIneligible], ["Replies", lane?.summary?.replies], ["Delivery records", lane?.summary?.claims?.total], ["Unconfirmed delivery", lane?.summary?.claims?.unconfirmed]
      ]));
      const records = document.createElement("section"); records.className = "founder-automation__section"; records.append(sectionHeading("Prospect review", "Partner prospect readiness", "Fit, contact quality, duplicate checks, approved copy, replies, and the recommended next move."));
      const grid = document.createElement("div"); grid.className = "founder-automation__records founder-automation__records--single"; (lane?.candidates || []).slice(0, 80).forEach((candidate) => grid.append(partnerCandidate(candidate))); records.append(grid.childElementCount ? grid : emptyReview("No Partner prospects are available.")); target.append(records);
    }
    function pressContact(contact) {
      const card = document.createElement("article"); card.className = "founder-automation__record founder-automation__record--large";
      const top = document.createElement("div"); top.className = "founder-automation__record-top"; const identity = document.createElement("div"); identity.append(text("p", contact?.publication || "Publication unavailable", "founder-automation__publication"), text("h4", contact?.journalist || "Journalist unavailable"), text("p", [contact?.email, contact?.beat].filter(Boolean).join(" · ") || "Contact context unavailable")); top.append(identity, chip(contact?.suppression?.suppressed ? contact.suppression.reason || "Not eligible" : contact?.pitch?.status || "Needs review"));
      const facts = document.createElement("dl"); facts.className = "founder-automation__record-facts founder-automation__record-facts--wide";
      facts.append(definition("Story angle", contact?.storyAngle || "Unavailable"), definition("Recent relevant coverage", contact?.recentRelevantCoverage || "Unavailable"), definition("Campaign", contact?.campaign?.name || "Unavailable"), definition("Attempts", countLine(contact?.attempts)), definition("Latest reply", replySummary(contact?.replies)), definition("Coverage result", contact?.coverageResult || "No result recorded"));
      const next = document.createElement("div"); next.className = "founder-automation__next-action"; next.append(text("span", "Suggested next action"), text("strong", contact?.nextAction || "Review this press relationship."));
      card.append(top, facts, next);
      const factsList = document.createElement("details"); factsList.className = "founder-automation__details"; const factsSummary = document.createElement("summary"); factsSummary.append(text("strong", "Approved facts"), text("span", numeric(contact?.approvedFacts?.length || 0) + " recorded")); factsList.append(factsSummary); if (contact?.approvedFacts?.length) { const list = document.createElement("ul"); contact.approvedFacts.forEach((fact) => { const li = document.createElement("li"); li.textContent = bounded(fact, 500); list.append(li); }); factsList.append(list); } else factsList.append(text("p", "No approved facts are recorded.")); card.append(factsList);
      const pitch = document.createElement("details"); pitch.className = "founder-automation__details"; const pitchSummary = document.createElement("summary"); pitchSummary.append(text("strong", "Pitch"), chip(contact?.pitch?.status || "Unavailable")); pitch.append(pitchSummary); if (contact?.pitch?.subject) pitch.append(text("p", contact.pitch.subject, "founder-automation__copy-subject")); pitch.append(text("p", contact?.pitch?.body || "Pitch copy unavailable", "founder-automation__copy-body")); card.append(pitch);
      if (contact?.followUpSequence?.length) { const sequence = document.createElement("details"); sequence.className = "founder-automation__details"; const summary = document.createElement("summary"); summary.append(text("strong", "Follow-up sequence"), text("span", contact.followUpSequence.length + " touches")); sequence.append(summary); const list = document.createElement("ol"); list.className = "founder-automation__touches"; contact.followUpSequence.forEach((step) => { const item = document.createElement("li"); const copy = document.createElement("div"); copy.append(text("strong", "Touch " + (step.touch || "—") + " · " + step.delayDays + " day delay"), text("span", step.subject || "Subject unavailable")); item.append(copy, chip(step.approval || "Needs review")); list.append(item); }); sequence.append(list); card.append(sequence); }
      return card;
    }
    function renderPress(lane, target) {
      target.append(metricsGrid([
        ["Press contacts", lane?.summary?.contacts], ["Approved pitches", lane?.summary?.pitchesApproved], ["Pitches needing review", lane?.summary?.pitchesNeedingReview], ["Suppressed or ineligible", lane?.summary?.suppressedOrIneligible], ["Replies", lane?.summary?.replies], ["Coverage recorded", lane?.summary?.coverageRecorded], ["Delivery records", lane?.summary?.claims?.total], ["Unconfirmed delivery", lane?.summary?.claims?.unconfirmed]
      ]));
      const records = document.createElement("section"); records.className = "founder-automation__section"; records.append(sectionHeading("Press review", "Journalists and pitches", "Review recent coverage, angles, approved facts, pitch copy, replies, follow-up timing, and coverage results."));
      const grid = document.createElement("div"); grid.className = "founder-automation__records founder-automation__records--single"; (lane?.contacts || []).slice(0, 80).forEach((contact) => grid.append(pressContact(contact))); records.append(grid.childElementCount ? grid : emptyReview("No press contacts are available.")); target.append(records);
    }
    function updateTabs() {
      root()?.querySelectorAll("[data-automation-lane]").forEach((button) => { const active = button.dataset.automationLane === selectedLane; button.setAttribute("aria-selected", active ? "true" : "false"); button.tabIndex = active ? 0 : -1; });
    }
    function renderLane() {
      if (!currentView) return; const lane = (currentView.lanes || []).find((item) => item.id === selectedLane) || currentView.lanes?.[0]; if (!lane) return;
      selectedLane = lane.id; saveSelection(); updateTabs(); const target = node("[data-automation-content]"); if (!target) return; target.replaceChildren(readinessPanel(lane));
      if (lane.id === "reactivation") renderReactivation(lane, target); else if (lane.id === "partner-prospect-outreach") renderPartners(lane, target); else renderPress(lane, target);
      target.hidden = false; target.setAttribute("aria-label", lane.label + " review"); metrics.renderedLanes += 1;
    }
    function render(view, { preserveScroll = false } = {}) {
      const scroll = preserveScroll ? window.scrollY : null; currentView = view;
      node("[data-automation-loading]")?.setAttribute("hidden", ""); node("[data-automation-state]")?.setAttribute("hidden", "");
      for (const [key, value] of Object.entries(view?.summary || {})) { const target = node('[data-automation-count="' + key + '"]'); if (target) target.textContent = numeric(value); }
      const generated = node("[data-automation-generated]"); if (generated) generated.textContent = dateTime(view?.generatedAt, "Time unavailable");
      for (const lane of view?.lanes || []) { const target = node('[data-lane-state="' + lane.id + '"]'); if (target) { target.textContent = bounded(lane?.readiness?.state || "Unavailable", 40); target.dataset.state = cleanState(lane?.readiness?.state); } }
      renderLane(); setRefreshBusy(false); if (scroll !== null) requestAnimationFrame(() => window.scrollTo({ top:scroll, behavior:"instant" }));
    }
    async function load({ force = false, preserveScroll = false } = {}) {
      if (!onRoute() || !ensureScaffold()) return null;
      if (activeRequest && !force) { metrics.duplicateRequests += 1; return activeRequest.promise; }
      if (activeRequest) { activeRequest.controller.abort(); metrics.staleRequestsAborted += 1; }
      const controller = new AbortController(); const sequence = ++requestSequence; const scroll = preserveScroll ? window.scrollY : null; metrics.requests += 1;
      if (!currentView) showLoading(); else setRefreshBusy(true); setMessage("");
      const promise = fetch(contract.endpoint, { method:"GET", credentials:"same-origin", headers:{ accept:"application/json" }, signal:controller.signal }).then(async (response) => {
        const raw = await response.text(); metrics.lastResponseBytes = new TextEncoder().encode(raw).byteLength;
        let body = {}; try { body = JSON.parse(raw || "{}"); } catch {}
        if (response.status === 401 || response.status === 403) { sessionEnded = response.status === 401; renderState("unauthorized", "Automation review is not available", "Sign in as the owner to review sensitive outreach information."); return null; }
        if (!response.ok || body.ok !== true || body.controlCenter?.available !== true) throw new Error(bounded(body.message, 200) || "Automation review could not load.");
        if (sequence !== requestSequence) return null; metrics.mutations += Number(body.mutations || 0); metrics.externalActions += Number(body.externalActions || 0); metrics.providerCalls += Number(body.providerCalls || 0);
        render(body.controlCenter, { preserveScroll }); if (currentView && force) setMessage("Automation review refreshed. No settings were changed."); if (scroll !== null) requestAnimationFrame(() => window.scrollTo({ top:scroll, behavior:"instant" })); return body.controlCenter;
      }).catch((error) => { if (error?.name === "AbortError" || sequence !== requestSequence) return null; if (currentView) { setRefreshBusy(false); setMessage("Automation review could not refresh. Existing results remain unchanged.", "error"); } else renderState("error", "Automation review could not load", "No settings were changed. Try again.", true); return null; }).finally(() => { if (activeRequest?.sequence === sequence) activeRequest = null; });
      activeRequest = { controller, sequence, promise }; return promise;
    }
    function bindScaffold() {
      const hostRoot = root(); if (!hostRoot || hostRoot.dataset.automationBound === "true") return; hostRoot.dataset.automationBound = "true";
      node("[data-automation-refresh]")?.addEventListener("click", () => load({ force:true, preserveScroll:true }));
      node("[data-automation-tabs]")?.addEventListener("click", (event) => { const button = event.target.closest("[data-automation-lane]"); if (!button || !currentView) return; selectedLane = button.dataset.automationLane; renderLane(); });
      node("[data-automation-tabs]")?.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; const buttons = [...root().querySelectorAll("[data-automation-lane]")]; if (!buttons.length) return; event.preventDefault(); const current = buttons.indexOf(document.activeElement); let next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length; buttons[next].focus(); buttons[next].click(); });
    }
    function routeChanged() { if (onRoute()) load(); else if (activeRequest) { activeRequest.controller.abort(); activeRequest = null; } }
    window.addEventListener("hashchange", () => setTimeout(routeChanged, 0));
    document.addEventListener("vnext:session-expired", () => { sessionEnded = true; activeRequest?.controller.abort(); activeRequest = null; });
    new MutationObserver(() => { if (observerQueued) return; observerQueued = true; requestAnimationFrame(() => { observerQueued = false; if (onRoute() && !root() && !sessionEnded) load(); }); }).observe(document.documentElement, { childList:true, subtree:true });
    function boot() { if (window.__LE_VNEXT_ROUTE_COMPATIBILITY) routeChanged(); else { clearTimeout(bootWaitTimer); bootWaitTimer = setTimeout(boot, 40); } }
    boot();
  })();`;
}
