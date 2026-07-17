import { escapeAttribute, escapeHtml } from "../html.mjs";
import {
  INBOX_PAGE_DUE_CONTRACT,
  INBOX_PAGE_ENDPOINT,
  INBOX_PAGE_GROUPS,
  INBOX_PAGE_LIMITS
} from "../view-models/inbox-page-view.mjs";

export const INBOX_PAGE_STYLESHEET_PATH = "assets/ui/inbox-page.css";

export const INBOX_PAGE_CONTRACT = Object.freeze({
  route:"inbox",
  endpoint:INBOX_PAGE_ENDPOINT,
  groups:INBOX_PAGE_GROUPS,
  dueStates:INBOX_PAGE_DUE_CONTRACT,
  pageSize:INBOX_PAGE_LIMITS.default,
  maxPageSize:INBOX_PAGE_LIMITS.maximum
});

export function renderInboxPageLoading() {
  const groups = INBOX_PAGE_GROUPS.map((group, index) => `<a class="vnext-inbox-tab${index === 0 ? " is-selected" : ""}" role="tab" href="#inbox?group=${escapeAttribute(group.routeValue)}" aria-selected="${index === 0 ? "true" : "false"}" tabindex="${index === 0 ? "0" : "-1"}" data-inbox-group="${escapeAttribute(group.routeValue)}"><span>${escapeHtml(group.label)}</span><span class="vnext-inbox-tab-count" data-inbox-group-count="${escapeAttribute(group.key)}">0</span></a>`).join("");
  return `<section class="vnext-inbox-page" data-inbox-page aria-labelledby="vnext-inbox-title">
    <header class="vnext-inbox-header">
      <div>
        <p class="vnext-inbox-eyebrow">Command Center</p>
        <h1 id="vnext-inbox-title">Inbox</h1>
        <p>Work that needs your attention, items waiting on others, and meaningful updates.</p>
      </div>
      <a class="vnext-inbox-orientation" href="#inbox?group=needs-me" data-inbox-needs-me-link>View Needs me</a>
    </header>
    <nav class="vnext-inbox-tabs" role="tablist" aria-label="Inbox groups">${groups}</nav>
    <form class="vnext-inbox-filters" data-inbox-filters aria-label="Inbox filters">
      <label>Type<select name="type" data-inbox-filter="type"><option value="">All types</option></select></label>
      <label>Priority<select name="priority" data-inbox-filter="priority"><option value="">All priorities</option></select></label>
      <label>Owner<select name="owner" data-inbox-filter="owner"><option value="">All owners</option></select></label>
      <label>Due state<select name="due" data-inbox-filter="due"><option value="">Any due state</option></select></label>
      <button type="button" class="vnext-inbox-clear" data-inbox-clear>Clear filters</button>
    </form>
    <div class="vnext-inbox-result-summary" data-inbox-result-summary role="status" aria-live="polite"></div>
    <div class="vnext-inbox-content" data-inbox-content aria-busy="true">
      <div class="vnext-inbox-loading" data-inbox-loading role="status">
        <span class="vnext-inbox-loading-mark" aria-hidden="true"></span>
        <div><strong>Loading Inbox</strong><p>Finding the work this account can view.</p></div>
      </div>
      <div class="vnext-inbox-state" data-inbox-state hidden></div>
      <ol class="vnext-inbox-list" data-inbox-list aria-label="Inbox items"></ol>
      <button class="vnext-inbox-load-more" type="button" data-inbox-load-more hidden>Load more</button>
    </div>
  </section>`;
}

export function inboxPageBrowserSource() {
  const contract = JSON.stringify(INBOX_PAGE_CONTRACT).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderInboxPageLoading()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const loadingHtml = ${loadingHtml};
    const metrics = {
      requests:0,
      duplicateRequests:0,
      suppressedDuplicateLoads:0,
      fullStateRequests:0,
      badgeRequests:0,
      paginationRequests:0,
      sourceMutations:0,
      storageWrites:0,
      actionExecutions:0,
      lastResponseMs:0,
      lastResponseBytes:0,
      counts:{ needsMe:0, waiting:0, updates:0, total:0 }
    };
    window.__LE_INBOX_METRICS = metrics;
    let pending = null;
    let requestSequence = 0;
    let nextCursor = null;
    let renderedIds = new Set();
    let currentPayload = null;
    let sessionEnded = false;
    let observerQueued = false;

    function app() { return document.querySelector("main#app"); }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function onInboxRoute() { return resolution()?.kind === "page" && resolution()?.canonicalRoute === contract.route; }
    function safeValue(value, maximum = 120) {
      const text = String(value || "").trim();
      return text.length <= maximum && !/[\\u0000-\\u001f\\u007f<>"'\x60\\\\]/.test(text) ? text : "";
    }
    function routeState() {
      const query = new URLSearchParams(String(location.hash || "").split("?")[1] || "");
      const group = ["needs-me", "waiting", "updates"].includes(query.get("group")) ? query.get("group") : "needs-me";
      return {
        group,
        type:safeValue(query.get("type"), 40),
        priority:safeValue(query.get("priority"), 16),
        owner:safeValue(query.get("owner"), 120),
        due:safeValue(query.get("due"), 20)
      };
    }
    function routeFilters() {
      const { type, priority, owner, due } = routeState();
      return { type, priority, owner, due };
    }
    function queryString(cursor = "") {
      const state = routeState();
      const query = new URLSearchParams({ group:state.group, limit:String(contract.pageSize) });
      for (const key of ["type", "priority", "owner", "due"]) if (state[key]) query.set(key, state[key]);
      if (cursor) query.set("cursor", cursor);
      return query.toString();
    }
    function routeHash(next = {}) {
      const state = { ...routeState(), ...next };
      const query = new URLSearchParams({ group:state.group || "needs-me" });
      for (const key of ["type", "priority", "owner", "due"]) if (state[key]) query.set(key, state[key]);
      return "#inbox?" + query.toString();
    }
    function navigate(next) {
      const target = routeHash(next);
      if (location.hash === target) {
        load({ force:true });
        return;
      }
      location.hash = target.slice(1);
    }
    function ensureScaffold() {
      const target = app();
      if (!target || target.querySelector("[data-vnext-shell-state='session_expired']")) return false;
      if (!target.querySelector("[data-inbox-page]")) {
        const lee = target.querySelector(".lee-bubble-wrap");
        target.innerHTML = loadingHtml;
        if (lee) target.append(lee);
      }
      return true;
    }
    function node(selector) { return app()?.querySelector(selector) || null; }
    function setBusy(busy) {
      const content = node("[data-inbox-content]");
      const loading = node("[data-inbox-loading]");
      if (content) content.setAttribute("aria-busy", busy ? "true" : "false");
      if (loading) loading.hidden = !busy;
    }
    function clearItems() {
      node("[data-inbox-list]")?.replaceChildren();
      renderedIds = new Set();
      nextCursor = null;
    }
    function clearState() {
      const state = node("[data-inbox-state]");
      if (!state) return;
      state.hidden = true;
      state.replaceChildren();
    }
    function button(label, attribute, action) {
      const control = document.createElement("button");
      control.type = "button";
      control.textContent = label;
      control.dataset[attribute] = "true";
      control.addEventListener("click", action);
      return control;
    }
    function link(label, href) {
      const control = document.createElement("a");
      control.textContent = label;
      control.href = href;
      return control;
    }
    function renderState(kind, titleText, messageText, actions = []) {
      clearItems();
      setBusy(false);
      const state = node("[data-inbox-state]");
      if (!state) return;
      state.replaceChildren();
      state.dataset.state = kind;
      state.setAttribute("role", kind === "error" || kind === "unauthorized" ? "alert" : "status");
      const title = document.createElement("h2");
      title.textContent = titleText;
      const message = document.createElement("p");
      message.textContent = messageText;
      state.append(title, message);
      if (actions.length) {
        const row = document.createElement("div");
        row.className = "vnext-inbox-state-actions";
        row.append(...actions);
        state.append(row);
      }
      state.hidden = false;
      setTimeout(() => title.focus(), 0);
      title.tabIndex = -1;
    }
    function renderError() {
      renderState("error", "Inbox could not load", "No records were changed. Try again.", [
        button("Try again", "inboxRetry", () => load({ force:true })),
        link("Go to Today", "#today")
      ]);
    }
    function renderUnauthorized() {
      window.__LE_INBOX_BADGE?.clear();
      renderState("unauthorized", "Inbox needs additional access", "This account does not have permission to view this work. No protected details were loaded.", [link("Go to Today", "#today")]);
    }
    function renderEmpty(payload) {
      const active = Object.values(payload.activeFilters || {}).some(Boolean);
      if (active) {
        renderState("empty", "No matching items", "Try changing or clearing the filters.", [button("Clear filters", "inboxClearState", clearFilters)]);
        return;
      }
      if (payload.selectedGroup === "needs_me") {
        renderState("empty", "You’re caught up", "Nothing needs your attention right now.", [
          link("Go to Today", "#today"), link("Open Social", "#queue"), link("Open Outreach", "#campaigns")
        ]);
      } else if (payload.selectedGroup === "waiting") {
        renderState("empty", "Nothing is waiting", "There are no items currently waiting on another person or future date.");
      } else {
        renderState("empty", "No recent updates", "Meaningful progress will appear here as work moves forward.");
      }
    }
    function formatDate(value, includeTime = false) {
      const parsed = Date.parse(value || "");
      if (!Number.isFinite(parsed)) return "";
      return new Intl.DateTimeFormat("en-US", includeTime
        ? { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZone:"America/New_York" }
        : { month:"short", day:"numeric", year:"numeric", timeZone:"America/New_York" }
      ).format(new Date(parsed));
    }
    function priorityLabel(value) { return value ? value[0].toUpperCase() + value.slice(1) : "Normal"; }
    function createMetadata(label, value, className = "") {
      if (!value) return null;
      const item = document.createElement("span");
      if (className) item.className = className;
      const strong = document.createElement("strong");
      strong.textContent = label + ": ";
      item.append(strong, document.createTextNode(value));
      return item;
    }
    function createItem(item, index) {
      const row = document.createElement("li");
      row.className = "vnext-inbox-item";
      row.dataset.inboxItem = "true";
      row.dataset.inboxItemId = item.id;
      const body = document.createElement("div");
      body.className = "vnext-inbox-item-body";
      const badges = document.createElement("div");
      badges.className = "vnext-inbox-item-badges";
      const type = document.createElement("span");
      type.className = "vnext-inbox-type";
      type.textContent = item.type.label;
      const priority = document.createElement("span");
      priority.className = "vnext-inbox-priority priority-" + item.priority;
      priority.textContent = priorityLabel(item.priority);
      badges.append(type, priority);
      const title = document.createElement("h2");
      title.textContent = item.title;
      const summary = document.createElement("p");
      summary.className = "vnext-inbox-item-summary";
      summary.textContent = item.summary;
      const metadata = document.createElement("div");
      metadata.className = "vnext-inbox-item-meta";
      const owner = createMetadata("Owner", item.owner || "Unassigned");
      const due = createMetadata(item.dueState === "overdue" ? "Overdue" : item.dueState === "today" ? "Due today" : "Due", formatDate(item.dueAt), item.dueState === "overdue" ? "is-overdue" : "");
      const updated = createMetadata("Updated", formatDate(item.updatedAt, true));
      const approval = item.requiresApproval ? createMetadata("Attention", "Approval required") : null;
      metadata.append(...[owner, due, updated, approval].filter(Boolean));
      body.append(badges, title, summary, metadata);
      if (item.availableInSource) {
        const context = document.createElement("p");
        context.className = "vnext-inbox-source-context";
        context.textContent = item.availableInSource;
        body.append(context);
      }
      const actions = document.createElement("div");
      actions.className = "vnext-inbox-item-actions";
      const open = document.createElement("a");
      open.className = "vnext-inbox-open" + (index === 0 ? " is-primary" : "");
      open.href = item.href;
      open.textContent = "Open";
      open.setAttribute("aria-label", "Open " + item.title + " in " + item.type.label);
      actions.append(open);
      row.append(body, actions);
      return row;
    }
    function populateSelect(select, options, firstLabel, selected) {
      if (!select) return;
      select.replaceChildren();
      const first = document.createElement("option");
      first.value = "";
      first.textContent = firstLabel;
      select.append(first);
      for (const option of options || []) {
        const node = document.createElement("option");
        node.value = option.key;
        node.textContent = option.label;
        node.selected = option.key === selected;
        select.append(node);
      }
      select.value = selected || "";
    }
    function syncTabs(payload) {
      node("[data-inbox-needs-me-link]")?.toggleAttribute("hidden", payload.selectedGroup === "needs_me" && !Object.values(payload.activeFilters || {}).some(Boolean));
      for (const group of payload.groups || []) {
        const tab = node('[data-inbox-group="' + group.routeValue + '"]');
        if (!tab) continue;
        const selected = group.key === payload.selectedGroup;
        tab.classList.toggle("is-selected", selected);
        tab.setAttribute("aria-selected", selected ? "true" : "false");
        tab.tabIndex = selected ? 0 : -1;
        tab.href = routeHash({ group:group.routeValue });
        const count = tab.querySelector("[data-inbox-group-count]");
        if (count) count.textContent = String(group.count);
      }
    }
    function syncFilters(payload) {
      const active = payload.activeFilters || {};
      populateSelect(node('[data-inbox-filter="type"]'), payload.filters?.types, "All types", active.type);
      populateSelect(node('[data-inbox-filter="priority"]'), payload.filters?.priorities, "All priorities", active.priority);
      populateSelect(node('[data-inbox-filter="owner"]'), payload.filters?.owners, "All owners", active.owner);
      populateSelect(node('[data-inbox-filter="due"]'), payload.filters?.dueStates, "Any due state", active.due);
      const clear = node("[data-inbox-clear]");
      if (clear) clear.disabled = !Object.values(active).some(Boolean);
    }
    function appendItems(items) {
      const list = node("[data-inbox-list]");
      if (!list) return;
      for (const item of items || []) {
        if (!item?.id || renderedIds.has(item.id)) continue;
        const index = renderedIds.size;
        renderedIds.add(item.id);
        list.append(createItem(item, index));
      }
    }
    function renderPayload(payload, { append = false } = {}) {
      currentPayload = payload;
      metrics.counts = { ...payload.counts };
      document.dispatchEvent(new CustomEvent("vnext:inbox-count", { detail:{ count:payload.counts.needsMe } }));
      clearState();
      setBusy(false);
      syncTabs(payload);
      syncFilters(payload);
      if (!append) clearItems();
      appendItems(payload.items);
      nextCursor = payload.nextCursor || null;
      const more = node("[data-inbox-load-more]");
      if (more) {
        more.hidden = !nextCursor;
        more.disabled = false;
        more.textContent = nextCursor ? "Load more" : "";
      }
      const summary = node("[data-inbox-result-summary]");
      const active = Object.values(payload.activeFilters || {}).some(Boolean);
      if (summary) summary.textContent = active
        ? payload.filteredCount + (payload.filteredCount === 1 ? " matching item" : " matching items")
        : payload.filteredCount + (payload.filteredCount === 1 ? " item" : " items");
      if (!append && !payload.items.length) renderEmpty(payload);
    }
    async function load({ force = false, cursor = "", append = false } = {}) {
      if (!onInboxRoute() || sessionEnded || !ensureScaffold()) return;
      const key = queryString(cursor);
      if (pending?.key === key) {
        metrics.suppressedDuplicateLoads += 1;
        return pending.promise;
      }
      if (!force && !cursor && currentPayload && currentPayload.selectedGroupRoute === routeState().group
        && JSON.stringify(currentPayload.activeFilters) === JSON.stringify(routeFilters())) {
        renderPayload(currentPayload);
        return;
      }
      const sequence = ++requestSequence;
      if (!append) {
        clearState();
        clearItems();
        setBusy(true);
      }
      const startedAt = performance.now();
      metrics.requests += 1;
      if (cursor) metrics.paginationRequests += 1;
      const promise = fetch(contract.endpoint + "?" + key, {
        method:"GET",
        credentials:"same-origin",
        headers:{ accept:"application/json" }
      }).then(async (response) => {
        const text = await response.text();
        metrics.lastResponseBytes = new TextEncoder().encode(text).byteLength;
        metrics.lastResponseMs = Math.round((performance.now() - startedAt) * 10) / 10;
        let payload = {};
        try { payload = JSON.parse(text || "{}"); } catch {}
        if (response.status === 401) {
          sessionEnded = true;
          window.__LE_INBOX_BADGE?.clear();
          return null;
        }
        if (response.status === 403) {
          renderUnauthorized();
          return null;
        }
        if (!response.ok || payload.ok !== true) throw new Error("Inbox unavailable");
        if (sequence !== requestSequence || !onInboxRoute()) return null;
        renderPayload(payload, { append });
        return payload;
      }).catch(() => {
        if (sequence === requestSequence && onInboxRoute() && !sessionEnded) renderError();
        return null;
      }).finally(() => {
        if (pending?.key === key) pending = null;
      });
      pending = { key, promise };
      return promise;
    }
    function clearFilters() { navigate({ type:"", priority:"", owner:"", due:"" }); }
    function bind() {
      const target = app();
      if (!target || target.dataset.inboxBound === "true") return;
      target.dataset.inboxBound = "true";
      target.addEventListener("change", (event) => {
        const select = event.target.closest?.("[data-inbox-filter]");
        if (!select) return;
        navigate({ [select.dataset.inboxFilter]:select.value });
      });
      target.addEventListener("click", (event) => {
        if (event.target.closest?.("[data-inbox-clear]")) clearFilters();
        const more = event.target.closest?.("[data-inbox-load-more]");
        if (more && nextCursor && !more.disabled) {
          more.disabled = true;
          more.textContent = "Loading more…";
          load({ cursor:nextCursor, append:true });
        }
      });
      target.addEventListener("keydown", (event) => {
        const tab = event.target.closest?.("[role='tab']");
        if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...target.querySelectorAll("[role='tab']")];
        const index = tabs.indexOf(tab);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next]?.focus();
        tabs[next]?.click();
      });
    }
    function activate() {
      if (!onInboxRoute() || sessionEnded) return;
      if (!ensureScaffold()) return;
      bind();
      load();
    }
    function observeApp() {
      const target = app();
      if (!target) return;
      new MutationObserver(() => {
        if (!onInboxRoute() || observerQueued || sessionEnded || target.querySelector("[data-inbox-page]")) return;
        observerQueued = true;
        queueMicrotask(() => { observerQueued = false; activate(); });
      }).observe(target, { childList:true });
    }
    window.addEventListener("hashchange", () => {
      currentPayload = null;
      if (onInboxRoute()) activate();
    });
    document.addEventListener("vnext:session-expired", () => {
      sessionEnded = true;
      currentPayload = null;
      renderedIds.clear();
      window.__LE_INBOX_BADGE?.clear();
    });
    document.addEventListener("vnext:recovery-mode", () => window.__LE_INBOX_BADGE?.clear());
    window.__LE_INBOX_PAGE = Object.freeze({ activate, refresh:() => load({ force:true }), clearFilters });
    observeApp();
    activate();
  })();`;
}
