import { escapeAttribute, escapeHtml } from "../html.mjs";
import { OUTREACH_HOME_ENDPOINT, OUTREACH_HOME_LIMITS, OUTREACH_HOME_VIEWS } from "../../outreach-home-service.mjs";

export const OUTREACH_HOME_STYLESHEET_PATH = "assets/ui/outreach-home.css";
export const OUTREACH_HOME_CONTRACT = Object.freeze({
  route:"outreach",
  endpoint:OUTREACH_HOME_ENDPOINT,
  views:OUTREACH_HOME_VIEWS,
  automationView:"automation",
  pageSize:OUTREACH_HOME_LIMITS.default
});

export function renderOutreachHomeLoading() {
  const tabs = OUTREACH_HOME_VIEWS.map((view, index) => `<a class="vnext-outreach-tab${index === 0 ? " is-selected" : ""}" role="tab" aria-selected="${index === 0 ? "true" : "false"}" tabindex="${index === 0 ? "0" : "-1"}" href="#outreach?view=${escapeAttribute(view.key)}" data-outreach-view="${escapeAttribute(view.key)}">${escapeHtml(view.label)} <span data-outreach-view-count="${escapeAttribute(view.key)}">—</span></a>`).join("");
  return `<section class="vnext-outreach-page" data-outreach-page aria-labelledby="vnext-outreach-title">
    <header class="vnext-outreach-header">
      <div><p class="vnext-outreach-eyebrow">Outreach</p><h1 id="vnext-outreach-title">Outreach</h1><p>See every campaign, what needs attention, and what happens next.</p></div>
      <div class="vnext-outreach-primary-action">
        <button class="vnext-outreach-create" type="button" data-outreach-create aria-describedby="vnext-outreach-create-explanation" aria-busy="true" disabled>New campaign</button>
        <p id="vnext-outreach-create-explanation" data-outreach-create-explanation role="status">Checking whether this account can create campaigns.</p>
      </div>
    </header>
    <nav class="vnext-outreach-tabs" role="tablist" aria-label="Outreach views">${tabs}</nav>
    <div class="vnext-outreach-summary" data-outreach-summary role="status" aria-live="polite"></div>
    <div class="vnext-outreach-content" data-outreach-content aria-busy="true">
      <div class="vnext-outreach-loading" data-outreach-loading role="status"><span aria-hidden="true"></span><div><strong>Loading Outreach</strong><p>Finding the campaigns this account can view.</p></div></div>
      <div class="vnext-outreach-state" data-outreach-state hidden></div>
      <div class="vnext-outreach-table-wrap" data-outreach-table-wrap hidden>
        <table class="vnext-outreach-table">
          <caption class="sr-only">Outreach campaigns</caption>
          <thead><tr><th>Campaign</th><th>Audience</th><th>Status</th><th>Next action</th><th>Next send</th><th>Replies</th><th>Meetings or outcome</th><th>Owner</th></tr></thead>
          <tbody data-outreach-rows></tbody>
        </table>
      </div>
      <button class="vnext-outreach-load-more" type="button" data-outreach-load-more hidden>Load more</button>
    </div>
  </section>`;
}

export function outreachHomeBrowserSource() {
  const contract = JSON.stringify(OUTREACH_HOME_CONTRACT).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderOutreachHomeLoading()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const loadingHtml = ${loadingHtml};
    const metrics = { requests:0, duplicateRequests:0, paginationRequests:0, fullStateRequests:0, renderedItems:0, mutations:0, providerCalls:0, maximumActiveRequests:0, activeRequests:0, lastResponseBytes:0 };
    window.__LE_OUTREACH_METRICS = metrics;
    let pending = null;
    let sequence = 0;
    let nextCursor = null;
    let renderedIds = new Set();
    let sessionEnded = false;
    let loadedKey = "";
    let lastPayload = null;

    function app() { return document.querySelector("main#app #campaigns.page-section.active") || document.querySelector("main#app"); }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function onRoute() { const value = resolution(); return value?.kind === "page" && value.canonicalRoute === contract.route && routeState().view !== contract.automationView; }
    function routeState() {
      const query = new URLSearchParams(String(location.hash || "").split("?")[1] || "");
      const views = contract.views.map((view) => view.key);
      return { view:views.includes(query.get("view")) ? query.get("view") : "all" };
    }
    function routeHash(view) { return "#outreach?view=" + encodeURIComponent(view || "all"); }
    function node(selector) { return app()?.querySelector(selector) || null; }
    function ensureScaffold() {
      const target = app();
      if (!target || sessionEnded || target.querySelector("[data-vnext-shell-state='session_expired']")) return false;
      if (!target.querySelector("[data-outreach-page]")) {
        target.innerHTML = loadingHtml;
        bind();
        if (lastPayload) render(lastPayload, false);
      }
      return true;
    }
    function setBusy(value) {
      const content = node("[data-outreach-content]");
      const loading = node("[data-outreach-loading]");
      if (content) content.setAttribute("aria-busy", value ? "true" : "false");
      if (loading) loading.hidden = !value;
    }
    function setCreate(allowed, reason, busy = false) {
      const button = node("[data-outreach-create]");
      const explanation = node("[data-outreach-create-explanation]");
      if (button) { button.disabled = !allowed; button.setAttribute("aria-busy", busy ? "true" : "false"); }
      if (explanation) { explanation.textContent = reason || ""; explanation.hidden = allowed && !busy; }
    }
    function showState(kind, titleText, messageText, retry = false) {
      const state = node("[data-outreach-state]");
      const table = node("[data-outreach-table-wrap]");
      const loadMore = node("[data-outreach-load-more]");
      if (table) table.hidden = true;
      if (loadMore) loadMore.hidden = true;
      if (!state) return;
      if (kind === "empty" && window.__LE_DISCOVERY_EMPTY_STATES?.render) {
        state.hidden = false;
        window.__LE_DISCOVERY_EMPTY_STATES.render(state, "outreach", routeState().view === "all" ? "empty" : "filtered-empty");
        return;
      }
      state.replaceChildren(); state.dataset.state = kind; state.hidden = false;
      state.setAttribute("role", kind === "error" || kind === "unauthorized" ? "alert" : "status");
      const title = document.createElement("h2"); title.textContent = titleText;
      const message = document.createElement("p"); message.textContent = messageText;
      state.append(title, message);
      if (retry) { const button = document.createElement("button"); button.type = "button"; button.textContent = "Try again"; button.addEventListener("click", () => load({ force:true })); state.append(button); }
    }
    function clearState() { const state = node("[data-outreach-state]"); if (state) { state.hidden = true; state.replaceChildren(); } }
    function unavailable() { const value = document.createElement("span"); value.className = "vnext-outreach-unavailable"; value.textContent = "Unavailable"; return value; }
    function text(value) { const span = document.createElement("span"); span.textContent = String(value); return span; }
    function numeric(value) { return Number.isFinite(value) ? text(value) : unavailable(); }
    function campaignHref(value) {
      const href = String(value || "");
      const resolved = window.__LE_VNEXT_ROUTE_COMPATIBILITY.resolve(href);
      const exactCampaign = resolved.kind === "object" && resolved.objectType === "Campaign" && resolved.safeHash === href;
      const safeFallback = resolved.kind === "page" && resolved.destination === "Outreach";
      return exactCampaign || safeFallback ? href : "";
    }
    function campaignCell(item) {
      const box = document.createElement("div"); box.className = "vnext-outreach-campaign";
      const href = campaignHref(item.href);
      const title = href ? document.createElement("a") : document.createElement("span");
      title.textContent = item.name || "Unnamed campaign";
      if (href) { title.href = href; title.setAttribute("aria-label", "Open campaign: " + (item.name || "Unnamed campaign")); }
      box.append(title);
      const details = [item.campaignType?.label, item.deliveryMode?.label].filter(Boolean);
      if (details.length) { const meta = document.createElement("small"); meta.textContent = details.join(" · "); box.append(meta); }
      return box;
    }
    function audienceCell(item) {
      if (!item.audience?.available) return unavailable();
      const box = document.createElement("span");
      box.textContent = item.audience.summary || (Number.isFinite(item.audience.includedCount) ? item.audience.includedCount + " included" : "Available");
      if (Number.isFinite(item.audience.excludedCount)) { const detail = document.createElement("small"); detail.textContent = item.audience.excludedCount + " excluded"; box.append(document.createElement("br"), detail); }
      return box;
    }
    function dateCell(value) {
      if (!value?.scheduledAt) return unavailable();
      const time = document.createElement("time"); time.dateTime = value.scheduledAt;
      const parsed = Date.parse(value.scheduledAt);
      time.textContent = Number.isFinite(parsed) ? new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit", timeZoneName:"short" }).format(new Date(parsed)) : value.scheduledAt;
      return time;
    }
    function outcomeCell(item) {
      if (item.outcome?.summary) return text(item.outcome.summary);
      const values = [];
      if (Number.isFinite(item.outcome?.meetings)) values.push(item.outcome.meetings + " meeting" + (item.outcome.meetings === 1 ? "" : "s"));
      if (Number.isFinite(item.outcome?.outcomes)) values.push(item.outcome.outcomes + " outcome" + (item.outcome.outcomes === 1 ? "" : "s"));
      return values.length ? text(values.join(" · ")) : unavailable();
    }
    function cell(label, content) { const td = document.createElement("td"); td.dataset.label = label; td.append(content); return td; }
    function row(item) {
      const tr = document.createElement("tr"); tr.dataset.outreachRow = ""; tr.dataset.campaignId = String(item.id || "");
      const status = document.createElement("span"); status.className = "vnext-outreach-status vnext-outreach-status--" + String(item.status?.key || "unknown"); status.textContent = item.status?.label || "Unavailable";
      tr.append(
        cell("Campaign", campaignCell(item)), cell("Audience", audienceCell(item)), cell("Status", status),
        cell("Next action", item.nextAction ? text(item.nextAction) : unavailable()), cell("Next send", dateCell(item.nextSend)),
        cell("Replies", numeric(item.replies)), cell("Meetings or outcome", outcomeCell(item)), cell("Owner", item.owner ? text(item.owner) : unavailable())
      );
      return tr;
    }
    function render(payload, append) {
      clearState(); setBusy(false); setCreate(payload.capabilities?.createsCampaign === true, payload.capabilities?.createCampaignReason || "");
      const selected = payload.selectedView || "all";
      app()?.querySelectorAll("[data-outreach-view]").forEach((tab) => {
        const active = tab.dataset.outreachView === selected; tab.classList.toggle("is-selected", active); tab.setAttribute("aria-selected", active ? "true" : "false"); tab.tabIndex = active ? 0 : -1;
      });
      for (const view of payload.views || []) { const count = node('[data-outreach-view-count="' + view.key + '"]'); if (count) count.textContent = Number.isFinite(view.count) ? String(view.count) : "—"; }
      const rows = node("[data-outreach-rows]");
      if (!append) { rows?.replaceChildren(); renderedIds = new Set(); }
      for (const item of payload.items || []) if (!renderedIds.has(item.id)) { renderedIds.add(item.id); rows?.append(row(item)); }
      metrics.renderedItems = renderedIds.size; nextCursor = payload.nextCursor || null;
      const summary = node("[data-outreach-summary]"); if (summary) summary.textContent = renderedIds.size + " campaign" + (renderedIds.size === 1 ? "" : "s") + " shown";
      const table = node("[data-outreach-table-wrap]"); if (table) table.hidden = renderedIds.size === 0;
      const loadMore = node("[data-outreach-load-more]"); if (loadMore) loadMore.hidden = !nextCursor;
      if (!renderedIds.size) showState("empty", selected === "all" ? "No campaigns yet" : "No campaigns in this view", selected === "all" ? "Create a campaign when you are ready. Nothing will send until the existing safeguards allow it." : "Try another Outreach view.");
    }
    async function load({ cursor = "", force = false } = {}) {
      if (!onRoute() || !ensureScaffold()) return;
      const view = routeState().view;
      const query = new URLSearchParams({ view, limit:String(contract.pageSize) }); if (cursor) query.set("cursor", cursor);
      const key = query.toString();
      if (!force && !cursor && loadedKey === key) return null;
      if (pending) { metrics.duplicateRequests += 1; return pending; }
      const requestId = ++sequence; metrics.requests += 1; if (cursor) metrics.paginationRequests += 1; metrics.activeRequests += 1; metrics.maximumActiveRequests = Math.max(metrics.maximumActiveRequests, metrics.activeRequests);
      if (!cursor) { setBusy(true); setCreate(false, "Checking whether this account can create campaigns.", true); }
      pending = fetch(contract.endpoint + "?" + key, { method:"GET", credentials:"same-origin", headers:{ accept:"application/json" } }).then(async (response) => {
        const body = await response.text(); metrics.lastResponseBytes = new TextEncoder().encode(body).byteLength;
        if (response.status === 401 || response.status === 403) { sessionEnded = response.status === 401; setCreate(false, "This account cannot create campaigns."); showState("unauthorized", "Outreach is not available", "Sign in with an account that can view Outreach."); return; }
        if (!response.ok) throw new Error("request_failed");
        const payload = JSON.parse(body || "{}"); if (payload.ok !== true || payload.authorized !== true) throw new Error("request_failed");
        if (requestId === sequence) { render(payload, Boolean(cursor)); if (!cursor) { loadedKey = key; lastPayload = payload; } }
      }).catch(() => { if (requestId === sequence) { setBusy(false); setCreate(false, "Create campaign availability could not be confirmed."); showState("error", "Outreach could not load", "No records were changed. Try again.", true); } }).finally(() => { metrics.activeRequests = Math.max(0, metrics.activeRequests - 1); pending = null; });
      return pending;
    }
    function bind() {
      app()?.querySelectorAll("[data-outreach-view]").forEach((tab) => tab.addEventListener("click", (event) => { event.preventDefault(); const target = routeHash(tab.dataset.outreachView); if (location.hash === target) load({ force:true }); else location.hash = target.slice(1); }));
      node("[data-outreach-load-more]")?.addEventListener("click", () => { if (nextCursor) load({ cursor:nextCursor }); });
      node("[data-outreach-create]")?.addEventListener("click", () => { if (node("[data-outreach-create]")?.disabled) return; window.__LE_GLOBAL_CREATE?.openWorkflow("outreach-campaign", { returnTarget:node("[data-outreach-create]") }); });
      node("[data-outreach-page]")?.addEventListener("vnext:guided-clear-filters", () => { location.hash = "outreach?view=all"; });
      node("[data-outreach-page]")?.addEventListener("vnext:guided-retry", () => load({ force:true }));
    }
    function routeChanged() { if (onRoute()) load(); }
    window.addEventListener("hashchange", () => setTimeout(routeChanged, 0));
    document.addEventListener("vnext:session-expired", () => { sessionEnded = true; });
    new MutationObserver(() => { if (onRoute() && !app()?.querySelector("[data-outreach-page]") && !sessionEnded) load(); }).observe(document.documentElement, { childList:true, subtree:true });
    setTimeout(routeChanged, 0);
  })();`;
}
