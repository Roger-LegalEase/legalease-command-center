import { escapeAttribute, escapeHtml } from "./html.mjs";
import { GLOBAL_UTILITIES } from "./labels.mjs";
import { GLOBAL_SEARCH_GROUPS, GLOBAL_SEARCH_LIMITS } from "./global-search-view-model.mjs";

export const GLOBAL_SEARCH_DIALOG_ID = "vnext-global-search-dialog";
export const GLOBAL_SEARCH_INPUT_ID = "vnext-global-search-input";
export const GLOBAL_SEARCH_RESULTS_ID = "vnext-global-search-results";
export const GLOBAL_SEARCH_TRIGGER_ID = "vnext-global-search-trigger";

export const GLOBAL_SEARCH_CONTRACT = Object.freeze({
  triggerLabel:GLOBAL_UTILITIES.search,
  dialogId:GLOBAL_SEARCH_DIALOG_ID,
  inputId:GLOBAL_SEARCH_INPUT_ID,
  resultsId:GLOBAL_SEARCH_RESULTS_ID,
  endpoint:"/api/ui/search",
  groups:GLOBAL_SEARCH_GROUPS,
  debounceMs:200,
  recentLimit:GLOBAL_SEARCH_LIMITS.recentRecords,
  directRoutes:Object.freeze(["search", "operator-search"])
});

export function renderGlobalSearchTrigger() {
  return `<button class="vnext-search-trigger" id="${GLOBAL_SEARCH_TRIGGER_ID}" type="button" aria-label="${escapeAttribute(GLOBAL_UTILITIES.search)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="${GLOBAL_SEARCH_DIALOG_ID}" data-shell-destination="${escapeAttribute(GLOBAL_UTILITIES.search)}">
    <span class="vnext-topbar-icon" aria-hidden="true">⌕</span>
    <span class="vnext-topbar-label">${escapeHtml(GLOBAL_UTILITIES.search)}</span>
    <kbd class="vnext-search-shortcut" data-global-search-shortcut aria-hidden="true">Ctrl K</kbd>
  </button>`;
}

export function renderGlobalSearchDialog() {
  const filters = GLOBAL_SEARCH_GROUPS.map((group) => `<label><input type="checkbox" value="${escapeAttribute(group.id)}" checked> <span>${escapeHtml(group.label)}</span></label>`).join("");
  return `<div class="vnext-search-backdrop" data-global-search-backdrop hidden></div>
  <section class="vnext-search-dialog" id="${GLOBAL_SEARCH_DIALOG_ID}" role="dialog" aria-modal="true" aria-labelledby="vnext-global-search-title" aria-describedby="vnext-global-search-guidance" hidden tabindex="-1">
    <header class="vnext-search-header">
      <div>
        <h2 id="vnext-global-search-title">Search</h2>
        <p id="vnext-global-search-guidance">Search records by name, keyword, or ID. Use the arrow keys to move and Enter to open.</p>
      </div>
      <button class="vnext-search-close" type="button" data-global-search-close aria-label="Close Search">×</button>
    </header>
    <div class="vnext-search-field">
      <label for="${GLOBAL_SEARCH_INPUT_ID}">Search Command Center</label>
      <input id="${GLOBAL_SEARCH_INPUT_ID}" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${GLOBAL_SEARCH_RESULTS_ID}" maxlength="${GLOBAL_SEARCH_LIMITS.queryLength}" autocomplete="off" spellcheck="false" placeholder="Search Posts, Campaigns, Partners, Files, Tasks, and Reports">
    </div>
    <fieldset class="vnext-search-filters" data-global-search-filters>
      <legend>Record types</legend>
      <div>${filters}</div>
    </fieldset>
    <div class="vnext-search-live sr-only" data-global-search-live aria-live="polite" aria-atomic="true"></div>
    <div class="vnext-search-state" data-global-search-state role="status">Type a name, keyword, or record ID to search.</div>
    <div class="vnext-search-results" id="${GLOBAL_SEARCH_RESULTS_ID}" role="listbox" aria-label="Search results"></div>
    <footer class="vnext-search-footer">
      <span><kbd>↑</kbd><kbd>↓</kbd> Move</span>
      <span><kbd>Enter</kbd> Open</span>
      <span><kbd>Esc</kbd> Close</span>
    </footer>
  </section>`;
}

export function globalSearchBrowserSource() {
  const contract = JSON.stringify(GLOBAL_SEARCH_CONTRACT).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const trigger = document.getElementById(${JSON.stringify(GLOBAL_SEARCH_TRIGGER_ID)});
    const dialog = document.getElementById(${JSON.stringify(GLOBAL_SEARCH_DIALOG_ID)});
    const input = document.getElementById(${JSON.stringify(GLOBAL_SEARCH_INPUT_ID)});
    const results = document.getElementById(${JSON.stringify(GLOBAL_SEARCH_RESULTS_ID)});
    const backdrop = document.querySelector("[data-global-search-backdrop]");
    const stateNode = dialog?.querySelector("[data-global-search-state]");
    const liveNode = dialog?.querySelector("[data-global-search-live]");
    const filters = dialog ? [...dialog.querySelectorAll("[data-global-search-filters] input")] : [];
    if (!trigger || !dialog || !input || !results || !backdrop || !stateNode || !liveNode) return;

    const metrics = {
      requests:0,
      abortedRequests:0,
      ignoredStaleResponses:0,
      duplicateRequests:0,
      fullStateRequests:0,
      lastResponseBytes:0,
      lastResponseMs:0,
      resultCounts:{},
      recentCount:0
    };
    window.__LE_GLOBAL_SEARCH_METRICS = metrics;
    let recentRecords = [];
    let activeRows = [];
    let activeIndex = -1;
    let debounceTimer = 0;
    let requestSequence = 0;
    let pendingController = null;
    let pendingKey = "";
    let lastCompletedKey = "";
    let lastPayload = null;
    let nextCursor = null;
    let routeOpened = false;
    let safePreviousHash = /^#(?:search|operator-search)(?:\\?|$)/.test(location.hash) ? "#today" : (location.hash || "#today");
    const resultByHref = new Map();
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

    function isMac() {
      return /mac|iphone|ipad|ipod/i.test(String(navigator.userAgentData?.platform || navigator.platform || ""));
    }

    function syncShortcutLabel() {
      const node = trigger.querySelector("[data-global-search-shortcut]");
      if (node) node.textContent = isMac() ? "⌘ K" : "Ctrl K";
    }

    function enabledTypes() {
      return filters.filter((filter) => filter.checked).map((filter) => filter.value);
    }

    function requestKey(query, cursor = "") {
      return JSON.stringify([query.trim(), enabledTypes(), cursor]);
    }

    function resetSelection() {
      activeRows = [...results.querySelectorAll("[data-global-search-result]")];
      activeRows.forEach((row) => row.setAttribute("aria-selected", "false"));
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");
    }

    function selectIndex(index) {
      if (!activeRows.length) return;
      const bounded = Math.max(0, Math.min(index, activeRows.length - 1));
      activeRows.forEach((row, rowIndex) => row.setAttribute("aria-selected", rowIndex === bounded ? "true" : "false"));
      activeIndex = bounded;
      const row = activeRows[bounded];
      input.setAttribute("aria-activedescendant", row.id);
      row.scrollIntoView({ block:"nearest" });
      liveNode.textContent = row.getAttribute("aria-label") || "";
    }

    function setState(kind, message) {
      stateNode.dataset.state = kind;
      stateNode.textContent = message;
      stateNode.hidden = false;
    }

    function clearResults() {
      results.replaceChildren();
      resultByHref.clear();
      resetSelection();
      nextCursor = null;
    }

    function metadataText(result) {
      const dateValue = Date.parse(result.updatedAt || "");
      return [result.objectType, result.status, Number.isFinite(dateValue) ? new Date(dateValue).toLocaleDateString() : "", result.destination]
        .filter(Boolean)
        .join(" · ");
    }

    function createResultRow(result, index) {
      const row = document.createElement("button");
      row.type = "button";
      row.id = "vnext-global-search-result-" + index;
      row.className = "vnext-search-result";
      row.dataset.globalSearchResult = "true";
      row.dataset.href = result.canonicalHref;
      resultByHref.set(result.canonicalHref, result);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      row.setAttribute("aria-label", "Open " + result.title + " in " + result.destination);
      const title = document.createElement("strong");
      title.textContent = result.title;
      const context = document.createElement("span");
      context.className = "vnext-search-result-context";
      context.textContent = result.context || "";
      context.hidden = !result.context;
      const metadata = document.createElement("span");
      metadata.className = "vnext-search-result-meta";
      metadata.textContent = metadataText(result);
      metadata.hidden = !metadata.textContent;
      row.append(title, context, metadata);
      row.addEventListener("mouseenter", () => {
        activeRows = [...results.querySelectorAll("[data-global-search-result]")];
        selectIndex(activeRows.indexOf(row));
      });
      row.addEventListener("click", () => openResult(result));
      return row;
    }

    function appendGroup(group, startIndex) {
      let section = results.querySelector('[data-global-search-group="' + CSS.escape(group.id) + '"]');
      if (!section) {
        section = document.createElement("section");
        section.className = "vnext-search-group";
        section.dataset.globalSearchGroup = group.id;
        const heading = document.createElement("h3");
        heading.id = "vnext-global-search-group-" + group.id;
        heading.textContent = group.label;
        section.setAttribute("aria-labelledby", heading.id);
        section.append(heading);
        results.append(section);
      }
      group.results.forEach((result, offset) => section.append(createResultRow(result, startIndex + offset)));
      return group.results.length;
    }

    function renderInstruction() {
      clearResults();
      setState("instruction", "Type a name, keyword, or record ID to search.");
      input.setAttribute("aria-expanded", "false");
      liveNode.textContent = "Search is ready.";
    }

    function renderNoResults() {
      clearResults();
      stateNode.replaceChildren();
      stateNode.dataset.state = "empty";
      const title = document.createElement("strong");
      title.textContent = "No results found";
      const explanation = document.createElement("p");
      explanation.textContent = "Try a different name, keyword, or record type.";
      const actions = document.createElement("div");
      const clearFilters = document.createElement("button");
      clearFilters.type = "button";
      clearFilters.textContent = "Clear filters";
      clearFilters.dataset.globalSearchClearFilters = "true";
      const clearSearch = document.createElement("button");
      clearSearch.type = "button";
      clearSearch.textContent = "Clear search";
      clearSearch.dataset.globalSearchClear = "true";
      actions.append(clearFilters, clearSearch);
      stateNode.append(title, explanation, actions);
      stateNode.hidden = false;
      input.setAttribute("aria-expanded", "false");
      liveNode.textContent = "No results found.";
    }

    function renderError() {
      clearResults();
      stateNode.replaceChildren();
      stateNode.dataset.state = "error";
      const message = document.createElement("p");
      message.textContent = "Search could not load. No records were changed. Try again.";
      const actions = document.createElement("div");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Retry";
      retry.dataset.globalSearchRetry = "true";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.dataset.globalSearchClose = "true";
      actions.append(retry, close);
      stateNode.append(message, actions);
      stateNode.hidden = false;
      input.setAttribute("aria-expanded", "false");
      liveNode.textContent = "Search could not load.";
    }

    function renderRecent(payload) {
      clearResults();
      const recents = Array.isArray(payload.recentResults) ? payload.recentResults : [];
      if (!recents.length) {
        renderInstruction();
        return;
      }
      stateNode.hidden = true;
      const group = { id:"recent", label:"Recently opened", results:recents };
      appendGroup(group, 0);
      resetSelection();
      input.setAttribute("aria-expanded", "true");
      liveNode.textContent = recents.length + (recents.length === 1 ? " recently opened record." : " recently opened records.");
    }

    function renderPayload(payload, { append = false } = {}) {
      if (!append) clearResults();
      else results.querySelector("[data-global-search-more]")?.remove();
      stateNode.hidden = true;
      let index = results.querySelectorAll("[data-global-search-result]").length;
      for (const group of payload.groups || []) index += appendGroup(group, index);
      nextCursor = payload.nextCursor || null;
      if (nextCursor) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "vnext-search-more";
        more.dataset.globalSearchMore = "true";
        more.textContent = "Show more";
        results.append(more);
      }
      resetSelection();
      const count = Number(payload.total || 0);
      input.setAttribute("aria-expanded", activeRows.length ? "true" : "false");
      liveNode.textContent = count + (count === 1 ? " result." : " results.") + (payload.truncated ? " More results are available." : "");
      metrics.resultCounts = Object.fromEntries((payload.groups || []).map((group) => [group.label, group.results.length]));
      if (!activeRows.length) renderNoResults();
    }

    async function search({ force = false, cursor = "", append = false, recent = false } = {}) {
      const query = input.value.trim();
      if (!query && !recentRecords.length) {
        renderInstruction();
        return;
      }
      const key = recent ? JSON.stringify(["recent", recentRecords.map((item) => item.canonicalHref)]) : requestKey(query, cursor);
      if (!force && key === pendingKey) {
        metrics.duplicateRequests += 1;
        return;
      }
      if (!force && !cursor && key === lastCompletedKey && lastPayload) {
        metrics.duplicateRequests += 1;
        query ? renderPayload(lastPayload) : renderRecent(lastPayload);
        return;
      }
      if (pendingController) {
        pendingController.abort();
        metrics.abortedRequests += 1;
      }
      pendingController = new AbortController();
      pendingKey = key;
      const sequence = ++requestSequence;
      const parameters = new URLSearchParams();
      parameters.set("q", query);
      parameters.set("limit", String(contract.groups.length * 6));
      if (cursor) parameters.set("cursor", cursor);
      const selectedTypes = enabledTypes();
      (selectedTypes.length ? selectedTypes : ["none"]).forEach((type) => parameters.append("types", type));
      if (recent) recentRecords.forEach((item) => parameters.append("recent", item.canonicalHref));
      setState("loading", "Loading Search results…");
      input.setAttribute("aria-busy", "true");
      const startedAt = performance.now();
      metrics.requests += 1;
      try {
        const response = await fetch("/api/ui/search?" + parameters.toString(), {
          method:"GET",
          credentials:"same-origin",
          headers:{ accept:"application/json" },
          signal:pendingController.signal
        });
        const text = await response.text();
        metrics.lastResponseBytes = new TextEncoder().encode(text).byteLength;
        metrics.lastResponseMs = Math.round((performance.now() - startedAt) * 10) / 10;
        const payload = JSON.parse(text || "{}");
        if (!response.ok || !payload.ok) throw new Error("Search could not load.");
        if (sequence !== requestSequence) {
          metrics.ignoredStaleResponses += 1;
          return;
        }
        lastCompletedKey = key;
        lastPayload = payload;
        if (!query) renderRecent(payload);
        else renderPayload(payload, { append });
      } catch (error) {
        if (error?.name === "AbortError") return;
        if (sequence !== requestSequence) {
          metrics.ignoredStaleResponses += 1;
          return;
        }
        renderError();
      } finally {
        if (sequence === requestSequence) {
          pendingController = null;
          pendingKey = "";
          input.removeAttribute("aria-busy");
        }
      }
    }

    function scheduleSearch() {
      clearTimeout(debounceTimer);
      clearResults();
      setState("loading", "Loading Search results…");
      debounceTimer = setTimeout(() => search({ recent:!input.value.trim() }), contract.debounceMs);
    }

    function remember(result) {
      recentRecords = [result, ...recentRecords.filter((item) => item.canonicalHref !== result.canonicalHref)].slice(0, contract.recentLimit);
      metrics.recentCount = recentRecords.length;
    }

    function resultForRow(row) {
      const href = row?.dataset.href;
      return resultByHref.get(href) || recentRecords.find((item) => item.canonicalHref === href);
    }

    function closeSearch({ returnFocus = true, preserveRoute = false } = {}) {
      if (dialog.hidden) return;
      clearTimeout(debounceTimer);
      if (pendingController) {
        pendingController.abort();
        pendingController = null;
        pendingKey = "";
        metrics.abortedRequests += 1;
      }
      dialog.hidden = true;
      backdrop.hidden = true;
      document.body.classList.remove("vnext-search-open");
      trigger.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      const shouldSyncRoute = routeOpened && !preserveRoute;
      if (shouldSyncRoute) {
        history.replaceState(null, "", safePreviousHash || "#today");
        window.__LE_VNEXT_ACTIVE_ROUTE = window.__LE_VNEXT_ROUTE_COMPATIBILITY.resolve(location.hash);
      }
      routeOpened = false;
      if (shouldSyncRoute) window.dispatchEvent(new Event("hashchange"));
      if (returnFocus) trigger.focus();
    }

    function openResult(result) {
      if (!result?.canonicalHref) return;
      remember(result);
      input.value = "";
      lastCompletedKey = "";
      lastPayload = null;
      closeSearch({ returnFocus:false, preserveRoute:true });
      location.hash = String(result.canonicalHref).replace(/^#/, "");
    }

    function requestLayerClosure() {
      document.dispatchEvent(new CustomEvent("vnext:close-navigation"));
      document.dispatchEvent(new CustomEvent("vnext:close-shell-popovers"));
      document.querySelector(".lee-panel:not([hidden]) .lee-panel-close")?.click();
      return document.dispatchEvent(new CustomEvent("vnext:request-close-global-create", { cancelable:true }));
    }

    function openSearch({ fromRoute = false } = {}) {
      if (!requestLayerClosure()) return;
      routeOpened = fromRoute;
      dialog.hidden = false;
      backdrop.hidden = false;
      document.body.classList.add("vnext-search-open");
      trigger.setAttribute("aria-expanded", "true");
      setTimeout(() => input.focus(), 0);
      if (!input.value.trim()) search({ recent:true });
      else search();
    }

    function directSearchRoute() {
      return /^#(?:search|operator-search)(?:\\?|$)/.test(location.hash);
    }

    function syncRoute() {
      if (directSearchRoute()) {
        if (dialog.hidden) openSearch({ fromRoute:true });
        return;
      }
      if (!dialog.hidden && routeOpened) closeSearch({ returnFocus:false, preserveRoute:true });
      safePreviousHash = location.hash || "#today";
    }

    trigger.addEventListener("click", () => openSearch());
    input.addEventListener("input", scheduleSearch);
    filters.forEach((filter) => filter.addEventListener("change", () => {
      lastCompletedKey = "";
      lastPayload = null;
      input.value.trim() ? scheduleSearch() : search({ recent:true });
    }));
    results.addEventListener("click", (event) => {
      if (event.target.closest("[data-global-search-more]")) search({ cursor:nextCursor, append:true });
    });
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-global-search-close]")) closeSearch();
      if (event.target.closest("[data-global-search-retry]")) search({ force:true, recent:!input.value.trim() });
      if (event.target.closest("[data-global-search-clear]")) {
        input.value = "";
        input.focus();
        search({ recent:true });
      }
      if (event.target.closest("[data-global-search-clear-filters]")) {
        filters.forEach((filter) => { filter.checked = true; });
        input.focus();
        input.value.trim() ? search({ force:true }) : search({ force:true, recent:true });
      }
    });
    backdrop.addEventListener("click", () => closeSearch());
    input.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) return;
      if (!activeRows.length) return;
      event.preventDefault();
      if (event.key === "ArrowDown") selectIndex(activeIndex < 0 ? 0 : (activeIndex + 1) % activeRows.length);
      if (event.key === "ArrowUp") selectIndex(activeIndex < 0 ? activeRows.length - 1 : (activeIndex - 1 + activeRows.length) % activeRows.length);
      if (event.key === "Home") selectIndex(0);
      if (event.key === "End") selectIndex(activeRows.length - 1);
      if (event.key === "Enter") openResult(resultForRow(activeRows[activeIndex < 0 ? 0 : activeIndex]));
    });
    document.addEventListener("vnext:request-close-global-search", () => closeSearch({ returnFocus:false }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dialog.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeSearch();
        return;
      }
      if (event.key !== "Tab" || dialog.hidden) return;
      const controls = [...dialog.querySelectorAll(focusableSelector)].filter((control) => !control.closest("[hidden]") && getComputedStyle(control).display !== "none");
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, true);
    window.addEventListener("keydown", (event) => {
      const keyK = String(event.key || "").toLocaleLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (!keyK || !document.hasFocus()) return;
      const shortcut = isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!shortcut) {
        event.stopImmediatePropagation();
        return;
      }
      const active = document.activeElement;
      const typing = active?.matches?.("input, textarea, select, [contenteditable=true]") || active?.closest?.("dialog, [role=dialog] form");
      if (typing && dialog.hidden) {
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (dialog.hidden) openSearch();
      else input.focus();
    }, true);
    window.addEventListener("hashchange", () => setTimeout(syncRoute, 0));
    syncShortcutLabel();
    setTimeout(syncRoute, 0);
  })();`;
}
