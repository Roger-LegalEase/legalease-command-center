import { escapeAttribute, escapeHtml } from "../html.mjs";
import { SOCIAL_HOME_ENDPOINT, SOCIAL_HOME_LIMITS, SOCIAL_HOME_VIEWS } from "../../social-home-service.mjs";

export const SOCIAL_HOME_STYLESHEET_PATH = "assets/ui/social-home.css";
export const SOCIAL_HOME_CONTRACT = Object.freeze({
  route:"queue",
  endpoint:SOCIAL_HOME_ENDPOINT,
  views:SOCIAL_HOME_VIEWS,
  pageSize:SOCIAL_HOME_LIMITS.default
});

export function renderSocialHomeLoading() {
  const tabs = SOCIAL_HOME_VIEWS.map((view, index) => `<a class="vnext-social-tab${index === 0 ? " is-selected" : ""}" role="tab" aria-selected="${index === 0 ? "true" : "false"}" tabindex="${index === 0 ? "0" : "-1"}" href="#queue?view=${escapeAttribute(view.key)}" data-social-view="${escapeAttribute(view.key)}">${escapeHtml(view.label)} <span data-social-view-count="${escapeAttribute(view.key)}">0</span></a>`).join("");
  return `<section class="vnext-social-page" data-social-page aria-labelledby="vnext-social-title">
    <header class="vnext-social-header">
      <div><p class="vnext-social-eyebrow">Social</p><h1 id="vnext-social-title">Social</h1><p>Shape ideas, see the calendar, find Posts, and review published results.</p></div>
      <div class="vnext-social-primary-action">
        <button class="vnext-social-create" type="button" data-social-create aria-describedby="vnext-social-create-explanation" aria-busy="true" disabled>Create post</button>
        <p id="vnext-social-create-explanation" data-social-create-explanation role="status">Checking whether this account can create Posts.</p>
      </div>
    </header>
    <nav class="vnext-social-tabs" role="tablist" aria-label="Social views">${tabs}</nav>
    <form class="vnext-social-filters" data-social-filters aria-label="Social filters">
      <label>Status<select name="status" data-social-filter="status"><option value="">All statuses</option></select></label>
      <label>Channel<select name="channel" data-social-filter="channel"><option value="">All channels</option></select></label>
      <label>Topic<select name="topic" data-social-filter="topic"><option value="">All topics</option></select></label>
      <label>Owner<select name="owner" data-social-filter="owner"><option value="">All owners</option></select></label>
      <label>From<input type="date" name="dateFrom" data-social-filter="dateFrom"></label>
      <label>To<input type="date" name="dateTo" data-social-filter="dateTo"></label>
      <button class="vnext-social-clear" type="button" data-social-clear>Clear filters</button>
    </form>
    <div class="vnext-social-summary" data-social-summary role="status" aria-live="polite"></div>
    <div class="vnext-social-content" data-social-content aria-busy="true">
      <div class="vnext-social-loading" data-social-loading role="status"><span aria-hidden="true"></span><div><strong>Loading Social</strong><p>Finding the Posts and ideas this account can view.</p></div></div>
      <div class="vnext-social-source-state" data-social-source-state hidden></div>
      <div class="vnext-social-state" data-social-state hidden></div>
      <ol class="vnext-social-grid" data-social-grid aria-label="Social items"></ol>
      <div class="vnext-social-calendar" data-social-calendar hidden>
        <section class="vnext-social-calendar-section" data-social-calendar-group="scheduled" aria-labelledby="vnext-social-scheduled-title">
          <div class="vnext-social-calendar-heading"><h2 id="vnext-social-scheduled-title">Scheduled</h2><span data-social-calendar-count="scheduled">0 Posts</span></div>
          <ol class="vnext-social-grid" data-social-scheduled-grid aria-label="Scheduled Posts"></ol>
        </section>
        <section class="vnext-social-calendar-section" data-social-calendar-group="unscheduled" aria-labelledby="vnext-social-unscheduled-title">
          <div class="vnext-social-calendar-heading"><h2 id="vnext-social-unscheduled-title">Unscheduled</h2><span data-social-calendar-count="unscheduled">0 Posts</span></div>
          <ol class="vnext-social-grid" data-social-unscheduled-grid aria-label="Unscheduled Posts"></ol>
        </section>
      </div>
      <button class="vnext-social-load-more" type="button" data-social-load-more hidden>Load more</button>
    </div>
  </section>`;
}

export function socialHomeBrowserSource() {
  const contract = JSON.stringify(SOCIAL_HOME_CONTRACT).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderSocialHomeLoading()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const loadingHtml = ${loadingHtml};
    const metrics = { requests:0, duplicateRequests:0, suppressedDuplicateLoads:0, paginationRequests:0, fullStateRequests:0, renderedItems:0, sourceMutations:0, storageWrites:0, sends:0, schedules:0, approvals:0, publications:0, regenerations:0, providerCalls:0, lastResponseBytes:0 };
    window.__LE_SOCIAL_METRICS = metrics;
    let pending = null;
    let pendingQuery = "";
    let queuedRouteReload = false;
    let requestSequence = 0;
    let nextCursor = null;
    let renderedKeys = new Set();
    let currentPayload = null;
    let sessionEnded = false;
    let observerQueued = false;
    let bootWaitTimer = null;
    let settledPageState = "";

    function app() { return document.querySelector("main#app"); }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function onSocialRoute() { const value = resolution(); return value?.kind === "page" && value?.canonicalRoute === contract.route; }
    function safe(value, maximum = 120) { const text = String(value || "").trim(); return text.length <= maximum && !/[\\u0000-\\u001f\\u007f<>"'\\x60\\\\]/.test(text) ? text : ""; }
    function routeState() {
      const query = new URLSearchParams(String(location.hash || "").split("?")[1] || "");
      const views = contract.views.map((view) => view.key);
      return { view:views.includes(query.get("view")) ? query.get("view") : "ideas", status:safe(query.get("status"), 80), channel:safe(query.get("channel"), 80), topic:safe(query.get("topic")), owner:safe(query.get("owner")), dateFrom:safe(query.get("dateFrom"), 10), dateTo:safe(query.get("dateTo"), 10) };
    }
    function queryString(cursor = "") {
      const state = routeState();
      const query = new URLSearchParams({ view:state.view, limit:String(contract.pageSize) });
      for (const key of ["status", "channel", "topic", "owner", "dateFrom", "dateTo"]) if (state[key]) query.set(key, state[key]);
      if (cursor) query.set("cursor", cursor);
      return query.toString();
    }
    function routeHash(next = {}) {
      const state = { ...routeState(), ...next };
      const query = new URLSearchParams({ view:state.view || "ideas" });
      for (const key of ["status", "channel", "topic", "owner", "dateFrom", "dateTo"]) if (state[key]) query.set(key, state[key]);
      return "#queue?" + query.toString();
    }
    function navigate(next) { const target = routeHash(next); if (location.hash === target) load({ force:true }); else location.hash = target.slice(1); }
    function ensureScaffold() {
      const target = app();
      if (!target || sessionEnded || target.querySelector("[data-vnext-shell-state='session_expired']")) return false;
      if (!target.querySelector("[data-social-page]")) { const lee = target.querySelector(".lee-bubble-wrap"); target.innerHTML = loadingHtml; if (lee) target.append(lee); bindScaffold(); }
      return true;
    }
    function node(selector) { return app()?.querySelector(selector) || null; }
    function setBusy(busy) { const content = node("[data-social-content]"); const loading = node("[data-social-loading]"); if (content) content.setAttribute("aria-busy", busy ? "true" : "false"); if (loading) loading.hidden = !busy; }
    function clearItems() { app()?.querySelectorAll("[data-social-grid],[data-social-scheduled-grid],[data-social-unscheduled-grid]").forEach((grid) => grid.replaceChildren()); renderedKeys = new Set(); nextCursor = null; metrics.renderedItems = 0; }
    function showItemSurface(view) { const calendar = node("[data-social-calendar]"); const grid = node("[data-social-grid]"); if (calendar) calendar.hidden = view !== "calendar"; if (grid) grid.hidden = view === "calendar"; }
    function hideItemSurfaces() { const calendar = node("[data-social-calendar]"); const grid = node("[data-social-grid]"); if (calendar) calendar.hidden = true; if (grid) grid.hidden = true; }
    function clearState() { const state = node("[data-social-state]"); if (state) { state.hidden = true; state.replaceChildren(); } }
    function control(label, action) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.addEventListener("click", action); return button; }
    function anchor(label, href) { const link = document.createElement("a"); link.textContent = label; link.href = href; return link; }
    function renderState(kind, titleText, messageText, actions = []) {
      clearItems(); hideItemSurfaces(); setBusy(false); const state = node("[data-social-state]"); if (!state) return;
      state.replaceChildren(); state.dataset.state = kind; state.setAttribute("role", kind === "error" || kind === "unauthorized" ? "alert" : "status");
      const shouldFocus = kind === "error" || kind === "unauthorized";
      const title = document.createElement("h2"); title.textContent = titleText; if (shouldFocus) title.tabIndex = -1;
      const message = document.createElement("p"); message.textContent = messageText; state.append(title, message);
      if (actions.length) { const row = document.createElement("div"); row.className = "vnext-social-state-actions"; row.append(...actions); state.append(row); }
      state.hidden = false; if (shouldFocus) setTimeout(() => title.focus(), 0);
    }
    function setCreateAvailability(allowed, reason, busy = false) { const button = node("[data-social-create]"); const explanation = node("[data-social-create-explanation]"); if (button) { button.disabled = !allowed; button.setAttribute("aria-busy", busy ? "true" : "false"); } if (explanation) { explanation.textContent = reason || ""; explanation.hidden = allowed && !busy; } }
    function renderError() { setCreateAvailability(false, "Create Post availability could not be confirmed."); renderState("error", "Social could not load", "No records were changed. Try again.", [control("Try again", () => { settledPageState = ""; load({ force:true }); }), anchor("Go to Today", "#today")]); }
    function renderUnauthorized() { setCreateAvailability(false, "This account cannot create Posts here."); renderState("unauthorized", "Social needs additional access", "This account cannot view Social work. No protected details were loaded.", [anchor("Go to Today", "#today")]); }
    function activeFilters(payload) { return Object.values(payload?.activeFilters || {}).some(Boolean); }
    function renderEmpty(payload) { const filtered=activeFilters(payload);const state=node("[data-social-state]");if(state&&window.__LE_DISCOVERY_EMPTY_STATES?.render){clearItems();hideItemSurfaces();setBusy(false);state.hidden=false;window.__LE_DISCOVERY_EMPTY_STATES.render(state,"social",filtered?"filtered-empty":"empty");return;}renderState(filtered ? "filtered-empty" : "empty", filtered ? "No matching Social work" : "Nothing here yet", filtered ? "Try changing or clearing the filters." : "Create a Post when you are ready. Nothing has been inferred or duplicated.", filtered ? [control("Clear filters", () => navigate({ status:"", channel:"", topic:"", owner:"", dateFrom:"", dateTo:"" }))] : []); }
    function renderSourceState(payload) {
      const target = node("[data-social-source-state]"); if (!target) return;
      const missingPosts = payload.sourceAvailability?.posts !== true; const missingIdeas = payload.sourceAvailability?.contentBank !== true && payload.selectedView === "ideas";
      target.hidden = !(missingPosts || missingIdeas); target.textContent = missingPosts ? "Post source unavailable. Available source ideas remain read-only." : missingIdeas ? "Source ideas are unavailable. Canonical Posts are still shown." : "";
    }
    function textNode(tag, text, className = "") { const value = document.createElement(tag); value.textContent = text; if (className) value.className = className; return value; }
    function metric(label, value) { const item = document.createElement("div"); item.append(textNode("dt", label), textNode("dd", value === null || value === undefined ? "Unavailable" : Number(value).toLocaleString("en-US"))); return item; }
    function itemCard(item, view) {
      const row = document.createElement("li"); row.className = "vnext-social-card"; row.dataset.socialItem = item.stableKey; row.dataset.socialKind = item.kind;
      const top = document.createElement("div"); top.className = "vnext-social-card-top"; top.append(textNode("span", item.status?.label || "Unavailable", "vnext-social-status"));
      if (item.kind === "source_idea") top.append(textNode("span", "Unconverted source", "vnext-social-source-label"));
      const title = textNode(view === "calendar" ? "h3" : "h2", item.title); const summary = textNode("p", item.summary || "No summary available.", "vnext-social-card-summary");
      const meta = document.createElement("div"); meta.className = "vnext-social-card-meta";
      if (view === "calendar") meta.append(textNode("span", item.schedule?.display || (item.schedule?.scheduled ? "Timing unavailable" : "Unscheduled"), "vnext-social-calendar-time"));
      if (item.readiness?.headline) meta.append(textNode("span", item.readiness.headline));
      for (const channel of item.channels?.selectedChannels || []) meta.append(textNode("span", channel.label + (channel.customized ? " · Customized" : "")));
      if (view === "results") { const results = document.createElement("dl"); results.className = "vnext-social-results"; const values = item.result?.metrics || {}; results.append(metric("Impressions", values.impressions), metric("Likes", values.likes), metric("Comments", values.comments), metric("Clicks", values.clicks)); meta.append(results); }
      const link = anchor(item.kind === "post" ? "Open Post" : "Open source idea", item.href); link.className = "vnext-social-open"; link.setAttribute("aria-label", (item.kind === "post" ? "Open Post " : "Open source idea ") + item.title);
      row.append(top, title, summary, meta, link); return row;
    }
    function renderTabs(payload) {
      node("[data-social-page]")?.setAttribute("data-social-current-view", payload.selectedView);
      app()?.querySelectorAll("[data-social-view]").forEach((tab) => { const selected = tab.dataset.socialView === payload.selectedView; tab.classList.toggle("is-selected", selected); tab.setAttribute("aria-selected", selected ? "true" : "false"); tab.tabIndex = selected ? 0 : -1; });
      for (const view of payload.views || []) { const count = node('[data-social-view-count="' + CSS.escape(view.key) + '"]'); if (count) count.textContent = String(view.count); }
    }
    function option(value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; }
    function replaceOptions(name, values, firstLabel) { const select = node('[data-social-filter="' + name + '"]'); if (!select) return; select.replaceChildren(option("", firstLabel), ...values.map((value) => typeof value === "string" ? option(value.toLocaleLowerCase("en-US"), value) : option(value.key, value.label))); select.value = routeState()[name] || ""; }
    function renderFilters(payload) {
      replaceOptions("status", payload.filters?.statuses || [], "All statuses"); replaceOptions("channel", payload.filters?.channels || [], "All channels"); replaceOptions("topic", payload.filters?.topics || [], "All topics"); replaceOptions("owner", payload.filters?.owners || [], "All owners");
      for (const key of ["dateFrom", "dateTo"]) { const input = node('[data-social-filter="' + key + '"]'); if (input) input.value = routeState()[key] || ""; }
    }
    function renderCalendarCounts(payload) { for (const group of ["scheduled", "unscheduled"]) { const count = Number(payload.calendarGroups?.[group] || 0); const target = node('[data-social-calendar-count="' + group + '"]'); if (target) target.textContent = count + " " + (count === 1 ? "Post" : "Posts"); } }
    function appendItems(payload) { for (const item of payload.items || []) { if (renderedKeys.has(item.stableKey)) continue; const grid = payload.selectedView === "calendar" ? node(item.schedule?.scheduled ? "[data-social-scheduled-grid]" : "[data-social-unscheduled-grid]") : node("[data-social-grid]"); if (!grid) continue; renderedKeys.add(item.stableKey); grid.append(itemCard(item, payload.selectedView)); } metrics.renderedItems = renderedKeys.size; }
    function renderPayload(payload, append) {
      currentPayload = payload; clearState(); setBusy(false); renderTabs(payload); renderFilters(payload); renderSourceState(payload); renderCalendarCounts(payload); setCreateAvailability(payload.capabilities?.createsPost === true, payload.capabilities?.createPostReason || "This account cannot create Posts here."); if (!append) clearItems(); showItemSurface(payload.selectedView); appendItems(payload);
      nextCursor = payload.nextCursor || null; const more = node("[data-social-load-more]"); if (more) more.hidden = !nextCursor;
      const summary = node("[data-social-summary]"); if (summary) summary.textContent = payload.counts.filtered + " " + (payload.counts.filtered === 1 ? "item" : "items") + (activeFilters(payload) ? " match the selected filters." : ".");
      if (!payload.items?.length && !append) renderEmpty(payload);
    }
    async function load({ append = false, force = false } = {}) {
      if (!onSocialRoute() || sessionEnded || routeState().view === "results" || !ensureScaffold()) return;
      const requestedQuery = queryString(append ? nextCursor : "");
      if (pending) { metrics.suppressedDuplicateLoads += 1; if (requestedQuery !== pendingQuery) queuedRouteReload = true; return pending; }
      if (!append && !force && currentPayload && currentPayload.selectedView === routeState().view && !activeFilters(currentPayload)) { renderPayload(currentPayload, false); return currentPayload; }
      if (!append) { clearItems(); clearState(); setBusy(true); }
      const sequence = ++requestSequence; metrics.requests += 1; if (append) metrics.paginationRequests += 1;
      const requestHash = location.hash;
      pendingQuery = requestedQuery;
      pending = fetch(contract.endpoint + "?" + requestedQuery, { method:"GET", credentials:"same-origin", headers:{ accept:"application/json" } }).then(async (response) => {
        const text = await response.text(); metrics.lastResponseBytes = new TextEncoder().encode(text).byteLength; const payload = JSON.parse(text || "{}");
        if (response.status === 401) { sessionEnded = true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return null; }
        if (response.status === 403) { settledPageState = "unauthorized"; renderUnauthorized(); return null; }
        if (!response.ok || payload.ok !== true) throw new Error(payload.error || "Social could not load.");
        if (sequence === requestSequence && location.hash === requestHash) { settledPageState = "loaded"; renderPayload(payload, append); } return payload;
      }).catch(() => { if (sequence === requestSequence && location.hash === requestHash) { settledPageState = "error"; renderError(); } return null; }).finally(() => { pending = null; pendingQuery = ""; if (queuedRouteReload) { queuedRouteReload = false; activate(); } });
      return pending;
    }
    function bindScaffold() {
      const root = node("[data-social-page]"); if (!root || root.dataset.bound === "true") return; root.dataset.bound = "true";
      node("[data-social-create]")?.addEventListener("click", (event) => { const button = event.currentTarget; if (button.disabled || currentPayload?.capabilities?.createsPost !== true) return; button.setAttribute("aria-busy", "true"); try { window.__LE_GLOBAL_CREATE?.openWorkflow("social-post", { returnTarget:button }); } finally { button.setAttribute("aria-busy", "false"); } });
      node("[data-social-filters]")?.addEventListener("change", (event) => { const target = event.target.closest("[data-social-filter]"); if (target) navigate({ [target.dataset.socialFilter]:target.value }); });
      node("[data-social-clear]")?.addEventListener("click", () => navigate({ status:"", channel:"", topic:"", owner:"", dateFrom:"", dateTo:"" }));
      root.addEventListener("vnext:guided-clear-filters", () => navigate({ status:"", channel:"", topic:"", owner:"", dateFrom:"", dateTo:"" }));
      root.addEventListener("vnext:guided-retry", () => load({ force:true }));
      node("[data-social-load-more]")?.addEventListener("click", () => { if (nextCursor) load({ append:true }); });
      node("[data-social-page]")?.addEventListener("keydown", (event) => { const tab = event.target.closest("[data-social-view]"); if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const tabs = [...app().querySelectorAll("[data-social-view]")]; const index = tabs.indexOf(tab); const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]; next.focus(); next.click(); });
    }
    function activate() {
      if (!onSocialRoute() || sessionEnded || routeState().view === "results") return;
      if (window.__LE_BOOT && window.__LE_BOOT.ready !== true) {
        if (bootWaitTimer === null) bootWaitTimer = setTimeout(() => { bootWaitTimer = null; activate(); }, 20);
        return;
      }
      if (!ensureScaffold()) return;
      if (settledPageState === "error") { renderError(); return; }
      if (settledPageState === "unauthorized") { renderUnauthorized(); return; }
      if (settledPageState === "loaded" && currentPayload) { renderPayload(currentPayload, false); return; }
      load({ force:true });
    }
    function routeChanged() { if (!onSocialRoute() || sessionEnded || routeState().view === "results") return; currentPayload = null; settledPageState = ""; activate(); }
    window.addEventListener("hashchange", routeChanged);
    document.addEventListener("vnext:session-expired", () => { sessionEnded = true; pending = null; pendingQuery = ""; queuedRouteReload = false; currentPayload = null; renderedKeys.clear(); if (bootWaitTimer !== null) clearTimeout(bootWaitTimer); bootWaitTimer = null; });
    const observedApp = app();
    if (observedApp) new MutationObserver(() => { if (observerQueued || !onSocialRoute() || sessionEnded || observedApp.querySelector("[data-social-page]")) return; observerQueued = true; queueMicrotask(() => { observerQueued = false; activate(); }); }).observe(observedApp, { childList:true });
    window.__LE_SOCIAL_PAGE = Object.freeze({ activate, refresh:() => load({ force:true }) });
    activate();
  })();`;
}
