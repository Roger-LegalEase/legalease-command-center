export const TODAY_PAGE_STYLESHEET_PATH = "assets/ui/today-page.css";
export const TODAY_PAGE_ENDPOINT = "/api/ui/today";

export const TODAY_PAGE_CONTRACT = Object.freeze({
  route:"today",
  compatibilityRoutes:Object.freeze(["overview", "cockpit"]),
  endpoint:TODAY_PAGE_ENDPOINT,
  answerSections:Object.freeze(["now", "next", "needs-you", "progress"]),
  maximumNextItems:3,
  maximumProgressItems:5
});

export function renderTodayPageLoading() {
  return `<section class="vnext-today-page" data-today-page aria-labelledby="vnext-today-title">
    <header class="vnext-today-header">
      <div>
        <h1 id="vnext-today-title">Today</h1>
        <p>Your clearest path through what matters now.</p>
      </div>
      <p class="vnext-today-date" data-today-date aria-live="polite"></p>
    </header>
    <div class="vnext-today-content" data-today-content aria-busy="true">
      <div class="vnext-today-live" data-today-live role="status" aria-live="polite">Loading Today</div>
      <section class="vnext-today-answer vnext-today-now" data-today-answer="now" aria-labelledby="vnext-today-now-title">
        <p class="vnext-today-section-label">Now</p>
        <h2 id="vnext-today-now-title">Finding your clearest next action</h2>
        <div class="vnext-today-skeleton vnext-today-skeleton-wide" aria-hidden="true"></div>
      </section>
      <div class="vnext-today-middle">
        <section class="vnext-today-answer vnext-today-next" data-today-answer="next" aria-labelledby="vnext-today-next-title">
          <p class="vnext-today-section-label">Next</p>
          <h2 id="vnext-today-next-title">Preparing the next priorities</h2>
          <div class="vnext-today-skeleton" aria-hidden="true"></div>
        </section>
        <section class="vnext-today-answer vnext-today-needs" data-today-answer="needs-you" aria-labelledby="vnext-today-needs-title">
          <p class="vnext-today-section-label">Needs you</p>
          <h2 id="vnext-today-needs-title">Checking what needs attention</h2>
          <div class="vnext-today-skeleton" aria-hidden="true"></div>
        </section>
      </div>
      <section class="vnext-today-answer vnext-today-progress" data-today-answer="progress" aria-labelledby="vnext-today-progress-title">
        <p class="vnext-today-section-label">Progress</p>
        <h2 id="vnext-today-progress-title">Gathering this week’s movement</h2>
        <div class="vnext-today-skeleton" aria-hidden="true"></div>
      </section>
      <div data-today-utility></div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------------------------
// Founder OS Release 2 — the Today operating loop.
// ---------------------------------------------------------------------------------------------
//
// Five sections, one ranking, one action panel. The panel itself is not built here: an item
// renders the trigger attributes the already-built task workbench and communication composer
// bind to ([data-task-open] / [data-compose-source-kind]), both of which the shell's lazy asset
// loader already fetches on the Today route. Today draws the queue; it never sends anything.

export const FOUNDER_TODAY_PAGE_CONTRACT = Object.freeze({
  route:"today",
  endpoint:TODAY_PAGE_ENDPOINT,
  sections:Object.freeze(["now", "next", "communications", "meetings", "needs-attention"]),
  maximumNextItems:5,
  maximumSectionItems:6
});

const FOUNDER_SECTION_COPY = Object.freeze({
  now:Object.freeze({ label:"Now", empty:"Nothing needs you right now." }),
  next:Object.freeze({ label:"Next", empty:"No other work is due today." }),
  communications:Object.freeze({ label:"Communications", empty:"No one is waiting on a reply." }),
  meetings:Object.freeze({ label:"Meetings", empty:"Nothing on today's agenda." }),
  "needs-attention":Object.freeze({ label:"Needs attention", empty:"Nothing has stopped or escalated." })
});

// The concept's Today is two columns: the ranked queue on the left, and the three typed lanes
// on the right. The sections themselves are unchanged — Release 2 built all five — so this is a
// wrapper around each stack and a stylesheet, not a second renderer. Every section keeps its
// data-today-answer hook, and renderSection still finds it by attribute wherever it sits.
const FOUNDER_TODAY_COLUMNS = Object.freeze({
  main:Object.freeze(["now", "next"]),
  side:Object.freeze(["communications", "meetings", "needs-attention"])
});

export function renderFounderTodayLoading() {
  const section = (slot) => `        <section class="vnext-today-answer vnext-today-${slot}" data-today-answer="${slot}" aria-labelledby="vnext-today-${slot}-title">
          <p class="vnext-today-section-label">${FOUNDER_SECTION_COPY[slot].label}</p>
          <h2 id="vnext-today-${slot}-title">Loading ${FOUNDER_SECTION_COPY[slot].label.toLowerCase()}</h2>
          <div class="vnext-today-skeleton" aria-hidden="true"></div>
        </section>`;
  return `<section class="vnext-today-page vnext-founder-today" data-today-page data-founder-today aria-labelledby="vnext-today-title">
    <header class="vnext-today-header">
      <div>
        <p class="vnext-today-date" data-today-date aria-live="polite"></p>
        <h1 id="vnext-today-title" data-today-greeting>Today</h1>
        <p data-today-summary>Everything that needs you today, in the order it needs you.</p>
      </div>
      <div class="vnext-today-header-actions" data-today-header-actions></div>
    </header>
    <div class="vnext-today-content" data-today-content aria-busy="true">
      <div class="vnext-today-live" data-today-live role="status" aria-live="polite">Loading Today</div>
      <div class="vnext-today-column vnext-today-column-main">
${FOUNDER_TODAY_COLUMNS.main.map(section).join("\n")}
        <div data-today-utility></div>
      </div>
      <aside class="vnext-today-column vnext-today-column-side" aria-label="Today's lanes">
${FOUNDER_TODAY_COLUMNS.side.map(section).join("\n")}
      </aside>
    </div>
  </section>`;
}

function founderTodayBrowserSource() {
  const contract = JSON.stringify(FOUNDER_TODAY_PAGE_CONTRACT).replaceAll("<", "\\u003c");
  const copy = JSON.stringify(FOUNDER_SECTION_COPY).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderFounderTodayLoading()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const sectionCopy = ${copy};
    const loadingHtml = ${loadingHtml};
    const payloadKeys = { "now":"now", "next":"next", "communications":"communications", "meetings":"meetings", "needs-attention":"needsAttention" };
    const metrics = { requests:0, suppressedDuplicateLoads:0, readErrors:0, errorRenders:0, sends:0, publications:0, lastResponseMs:0, lastResponseBytes:0, skeletonToContentMs:0 };
    window.__LE_TODAY_METRICS = metrics;
    let pending = null;
    let requestSequence = 0;
    let currentPayload = null;
    let sessionEnded = false;
    let observerQueued = false;
    let loadingStartedAt = 0;
    let bootWaitTimer = null;
    let settledPageState = "";
    let currentOverflow = 0;
    let currentOverflowHref = "";

    function app() { return document.querySelector("main#app"); }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function onTodayRoute() { return resolution()?.kind === "page" && resolution()?.canonicalRoute === contract.route; }
    function node(selector) { return app()?.querySelector(selector) || null; }
    function ensureScaffold() {
      const target = app();
      if (!target || target.querySelector("[data-vnext-shell-state='session_expired']")) return false;
      if (!target.querySelector("[data-today-page]")) {
        const lee = target.querySelector(".lee-bubble-wrap");
        target.innerHTML = loadingHtml;
        if (lee) target.append(lee);
        loadingStartedAt = performance.now();
      }
      return true;
    }
    function text(tag, value, className = "") {
      const element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = String(value || "");
      return element;
    }
    function safeHref(value) {
      const href = String(value || "").trim();
      const checked = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(href);
      return checked && checked.kind !== "unsafe" && checked.kind !== "unknown" && checked.safeHash === href ? href : "";
    }
    function routeLink(label, href, className = "") {
      const safe = safeHref(href);
      if (!safe) return null;
      const link = document.createElement("a");
      if (className) link.className = className;
      link.href = safe;
      link.textContent = label;
      return link;
    }
    function formatDate(value, includeTime = false) {
      const parsed = Date.parse(value || "");
      if (!Number.isFinite(parsed)) return "";
      return new Intl.DateTimeFormat("en-US", includeTime
        ? { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZone:"America/New_York" }
        : { month:"short", day:"numeric", year:"numeric", timeZone:"America/New_York" }
      ).format(new Date(parsed));
    }
    // The universal action panel. A task opens the task workbench; a communication lane opens the
    // composer. Both runtimes bind these attributes themselves, so Today only has to name them.
    function panelTrigger(item, className) {
      if (item.taskId) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.dataset.taskOpen = "true";
        button.dataset.taskId = item.taskId;
        button.dataset.todayItem = item.id;
        button.textContent = item.actionLabel || "Open";
        return button;
      }
      if (item.composeSourceKind && item.composeSourceId) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.dataset.composeSourceKind = item.composeSourceKind;
        button.dataset.composeSourceId = item.composeSourceId;
        button.dataset.todayItem = item.id;
        button.textContent = item.actionLabel || "Draft reply";
        return button;
      }
      return routeLink(item.actionLabel || "Open", item.href, className);
    }
    function ranking(item) {
      const row = document.createElement("div");
      row.className = "vnext-today-meta";
      row.dataset.todayRank = String(item.rankTier || "");
      const values = [item.objectType, item.rankReason, item.urgencyLabel, item.priorityLabel, item.dueAt ? "Due " + formatDate(item.dueAt, true) : ""];
      for (const value of values.filter(Boolean)) row.append(text("span", value));
      return row;
    }
    function itemNode(item, tag) {
      const row = document.createElement(tag);
      row.dataset.todayItem = item.id;
      row.dataset.todayRankTier = String(item.rankTier || "");
      const body = document.createElement("div");
      body.className = "vnext-today-item-body";
      body.append(text("h3", item.title));
      if (item.whyNow) body.append(text("p", item.whyNow, "vnext-today-why"));
      if (item.summary && item.summary !== item.whyNow) body.append(text("p", item.summary, "vnext-today-summary"));
      body.append(ranking(item));
      row.append(body);
      const action = panelTrigger(item, "vnext-today-item-action");
      if (action) {
        action.setAttribute("aria-label", (item.actionLabel || "Open") + " " + item.title);
        row.append(action);
      }
      const record = routeLink("Open full record", item.href, "vnext-today-text-action");
      if (record && action) row.append(record);
      return row;
    }
    function renderSection(slot, items, total) {
      const section = node('[data-today-answer="' + slot + '"]');
      if (!section) return;
      const copy = sectionCopy[slot] || { label:slot, empty:"Nothing here." };
      // The concept's card head is the label and the lane's size. The count is the total the
      // server reported for the lane, so a lane with nothing in it draws no count rather than a
      // zero. Sections whose size is not reported draw no count either.
      const label = text("p", copy.label, "vnext-today-section-label");
      const laneTotal = Number(total || 0) || items.length;
      // Now is a single card, not a lane, so it carries no size.
      if (slot !== "now" && laneTotal > 0) label.append(text("span", String(laneTotal), "vnext-today-section-count"));
      const children = [label];
      const heading = text("h2", items.length ? copy.label : copy.empty);
      heading.id = "vnext-today-" + slot + "-title";
      // When the lane has work, the heading repeats the label directly above it. It stays in the
      // DOM because it is this section's accessible name, and is hidden from sight only in that
      // case; the empty-state wording is always visible.
      heading.dataset.todayHeading = items.length ? "label" : "empty";
      children.push(heading);
      const hidden = Math.max(0, Number(total || 0) - items.length);
      if (hidden > 0) children.push(text("p", hidden + " more " + (hidden === 1 ? "item is" : "items are") + " already ranked above.", "vnext-today-period"));
      if (slot === "next" && Number(currentOverflow || 0) > 0) {
        const overflow = Number(currentOverflow);
        const line = text("p", overflow + " further ranked " + (overflow === 1 ? "item is" : "items are") + " open but not needed today. ", "vnext-today-period");
        // The count used to be the end of the sentence: a number with nowhere to go. The
        // destination is the server's, vetted there, so the browser never builds a route.
        const rest = routeLink("See the rest of the open work", currentOverflowHref, "vnext-today-text-action");
        if (rest) line.append(rest);
        children.push(line);
      }
      if (!items.length) {
        children.push(text("p", copy.empty, "vnext-today-empty-copy"));
      } else if (slot === "now") {
        const item = items[0];
        children.push(text("p", item.objectType, "vnext-today-context"));
        children.push(text("h3", item.title));
        children.push(text("p", item.whyNow, "vnext-today-why"));
        if (item.summary && item.summary !== item.whyNow) children.push(text("p", item.summary, "vnext-today-summary"));
        children.push(ranking(item));
        const action = panelTrigger(item, "vnext-today-primary-action");
        if (action) {
          action.setAttribute("aria-label", (item.actionLabel || "Open") + " " + item.title);
          action.dataset.todayNow = "true";
          children.push(action);
        }
        const record = routeLink("Open full record", item.href, "vnext-today-text-action");
        if (record) children.push(record);
      } else {
        const listTag = slot === "next" ? "ol" : "ul";
        const container = document.createElement(listTag);
        container.className = "vnext-today-next-list";
        for (const item of items.slice(0, contract.maximumSectionItems)) container.append(itemNode(item, "li"));
        children.push(container);
      }
      section.replaceChildren(...children);
    }
    function renderUtility(payload) {
      const host = node("[data-today-utility]");
      if (!host) return;
      host.replaceChildren();
      if (!payload.utilities?.quickCaptureAvailable) return;
      const aside = document.createElement("aside");
      aside.className = "vnext-today-quick-capture";
      aside.setAttribute("aria-label", "Quick Capture");
      const copy = document.createElement("div");
      copy.append(text("h2", "Quick Capture"), text("p", "Choose a clear intent and confirm where it will be saved."));
      const action = document.createElement("button");
      action.type = "button";
      action.className = "vnext-today-text-action";
      action.textContent = "Open Quick Capture";
      action.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("vnext:open-quick-capture", { detail:{ returnTarget:action } }));
      });
      aside.append(copy, action);
      host.append(aside);
    }
    function renderPayload(payload) {
      settledPageState = "";
      currentPayload = payload;
      const content = node("[data-today-content]");
      if (content) content.setAttribute("aria-busy", "false");
      const date = node("[data-today-date]");
      if (date) date.textContent = payload.dateLabel || "";
      // Greeting and summary come from the server, which reads the same Eastern clock as the
      // date and the same ranked count as the sections. A payload without them leaves the
      // scaffold's own words in place rather than blanking the heading.
      const greeting = node("[data-today-greeting]");
      if (greeting && payload.greeting) greeting.textContent = payload.greeting;
      const summary = node("[data-today-summary]");
      if (summary && payload.summary) summary.textContent = payload.summary;
      // "View full queue" is the concept's one header action. It is drawn only when the server
      // supplied a route for it, so it is never a control that goes nowhere.
      const headerActions = node("[data-today-header-actions]");
      if (headerActions) {
        const queue = routeLink("View full queue", payload.overflowHref || "", "vnext-today-header-action");
        headerActions.replaceChildren(...(queue ? [queue] : []));
      }
      const sections = payload.sections || {};
      const totals = payload.totals || {};
      currentOverflow = Number(payload.overflow || 0);
      currentOverflowHref = payload.overflowHref || "";
      for (const slot of contract.sections) {
        const key = payloadKeys[slot];
        renderSection(slot, Array.isArray(sections[key]) ? sections[key] : [], totals[key]);
      }
      renderUtility(payload);
      const live = node("[data-today-live]");
      if (live) live.textContent = "Today is ready";
      metrics.skeletonToContentMs = Math.round((performance.now() - loadingStartedAt) * 10) / 10;
    }
    function stateAction(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vnext-today-secondary-action";
      button.textContent = label;
      button.addEventListener("click", action);
      return button;
    }
    function resetLoadingScaffold() {
      const target = app();
      if (!target) return false;
      const lee = target.querySelector(".lee-bubble-wrap");
      target.innerHTML = loadingHtml;
      if (lee) target.append(lee);
      loadingStartedAt = performance.now();
      return true;
    }
    function renderPageState(kind, titleText, messageText, actions = []) {
      const target = app();
      if (!target) return;
      const section = target.querySelector("[data-today-page]") || document.createElement("section");
      section.replaceChildren();
      section.className = "vnext-today-page vnext-today-page-state";
      section.dataset.todayPage = "";
      section.dataset.founderToday = "";
      section.dataset.todayPageState = kind;
      section.setAttribute("role", kind === "error" || kind === "unauthorized" ? "alert" : "status");
      const title = text("h1", titleText);
      title.tabIndex = -1;
      section.append(title, text("p", messageText));
      const row = document.createElement("div");
      row.className = "vnext-today-actions";
      row.append(...actions.filter(Boolean));
      if (row.children.length) section.append(row);
      if (!section.isConnected) {
        const lee = target.querySelector(".lee-bubble-wrap");
        target.replaceChildren(section);
        if (lee) target.append(lee);
      }
      setTimeout(() => title.focus(), 0);
    }
    function renderError() {
      settledPageState = "error";
      renderPageState("error", "Today could not load", "No records were changed. Try again.", [
        stateAction("Try again", () => { settledPageState = ""; resetLoadingScaffold(); load({ force:true }); })
      ]);
    }
    function renderUnauthorized() {
      settledPageState = "unauthorized";
      renderPageState("unauthorized", "Today needs additional access", "This account does not have permission to view this work. No protected details were loaded.", [
        routeLink("Open Help", "#operator-manual", "vnext-today-secondary-action")
      ]);
    }
    async function load({ force = false } = {}) {
      if (!onTodayRoute() || sessionEnded || !ensureScaffold()) return null;
      if (pending) { metrics.suppressedDuplicateLoads += 1; return pending; }
      if (!force && currentPayload) { renderPayload(currentPayload); return currentPayload; }
      const sequence = ++requestSequence;
      const startedAt = performance.now();
      metrics.requests += 1;
      const promise = fetch(contract.endpoint, { method:"GET", credentials:"same-origin", headers:{ accept:"application/json" } }).then(async (response) => {
        const body = await response.text();
        metrics.lastResponseBytes = new TextEncoder().encode(body).byteLength;
        metrics.lastResponseMs = Math.round((performance.now() - startedAt) * 10) / 10;
        let payload = {};
        try { payload = JSON.parse(body || "{}"); } catch {}
        if (response.status === 401) { sessionEnded = true; currentPayload = null; return null; }
        if (response.status === 403) { currentPayload = null; renderUnauthorized(); return null; }
        if (!response.ok || payload.ok !== true) throw new Error("Today unavailable");
        if (sequence !== requestSequence || !onTodayRoute()) return null;
        renderPayload(payload);
        return payload;
      }).catch(() => {
        metrics.readErrors += 1;
        if (sequence === requestSequence && onTodayRoute() && !sessionEnded) {
          try { renderError(); metrics.errorRenders += 1; } catch {}
        }
        return null;
      }).finally(() => { if (pending === promise) pending = null; });
      pending = promise;
      return promise;
    }
    function activate() {
      if (!onTodayRoute() || sessionEnded || settledPageState || !ensureScaffold()) return;
      if (window.__LE_BOOT && window.__LE_BOOT.ready !== true) {
        if (bootWaitTimer === null) bootWaitTimer = setTimeout(() => { bootWaitTimer = null; activate(); }, 20);
        return;
      }
      load();
    }
    function observeApp() {
      const target = app();
      if (!target) return;
      new MutationObserver(() => {
        if (!onTodayRoute() || observerQueued || sessionEnded || target.querySelector("[data-today-page], [data-today-page-state]")) return;
        observerQueued = true;
        queueMicrotask(() => {
          observerQueued = false;
          if (target.querySelector("[data-today-page-state]")) return;
          if (settledPageState === "error") renderError();
          else if (settledPageState === "unauthorized") renderUnauthorized();
          else activate();
        });
      }).observe(target, { childList:true });
    }
    window.addEventListener("hashchange", () => {
      currentPayload = null;
      settledPageState = "";
      if (onTodayRoute()) activate();
    });
    // Completing the business outcome removes the item and promotes the next one. Both panels
    // already announce their own completion, so Today only has to re-read the ranking.
    document.addEventListener("vnext:communication-sent-recorded", () => { load({ force:true }); });
    document.addEventListener("vnext:task-updated", () => { load({ force:true }); });
    document.addEventListener("vnext:session-expired", () => {
      sessionEnded = true;
      currentPayload = null;
      settledPageState = "session-ended";
      requestSequence += 1;
      if (bootWaitTimer !== null) clearTimeout(bootWaitTimer);
      bootWaitTimer = null;
    });
    document.addEventListener("vnext:recovery-mode", () => { currentPayload = null; settledPageState = "recovery"; requestSequence += 1; });
    window.__LE_TODAY_PAGE = Object.freeze({ activate, refresh:() => load({ force:true }) });
    observeApp();
    activate();
  })();`;
}

export function todayPageBrowserSource(options = {}) {
  // With FOUNDER_OS_TODAY on, the legacy Today renderer is never sent to the browser: the
  // Founder OS loop replaces it outright, so only one of the two ever costs client bytes.
  if (options.founderOsToday === true) return founderTodayBrowserSource();
  const contract = JSON.stringify(TODAY_PAGE_CONTRACT).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderTodayPageLoading()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const loadingHtml = ${loadingHtml};
    const metrics = {
      requests:0,
      duplicateRequests:0,
      suppressedDuplicateLoads:0,
      fullStateRequests:0,
      quickCaptureRequests:0,
      searchRequestsWhileClosed:0,
      createRequestsWhileClosed:0,
      sourceMutations:0,
      storageWrites:0,
      actionExecutions:0,
      sends:0,
      publications:0,
      inboxActions:0,
      campaignExecutions:0,
      providerCalls:0,
      partnerStageChanges:0,
      fileStatusChanges:0,
      suppressionChanges:0,
      liveGateChanges:0,
      readErrors:0,
      errorRenders:0,
      errorRenderFailures:0,
      lastResponseMs:0,
      lastResponseBytes:0,
      skeletonToContentMs:0
    };
    window.__LE_TODAY_METRICS = metrics;
    let pending = null;
    let requestSequence = 0;
    let currentPayload = null;
    let sessionEnded = false;
    let observerQueued = false;
    let loadingStartedAt = 0;
    let bootWaitTimer = null;
    let settledPageState = "";

    function app() { return document.querySelector("main#app"); }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function onTodayRoute() { return resolution()?.kind === "page" && resolution()?.canonicalRoute === contract.route; }
    function ensureScaffold() {
      const target = app();
      if (!target || target.querySelector("[data-vnext-shell-state='session_expired']")) return false;
      if (!target.querySelector("[data-today-page]")) {
        const lee = target.querySelector(".lee-bubble-wrap");
        target.innerHTML = loadingHtml;
        if (lee) target.append(lee);
        loadingStartedAt = performance.now();
      }
      return true;
    }
    function node(selector) { return app()?.querySelector(selector) || null; }
    function safeHref(value) {
      const href = String(value || "").trim();
      const checked = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(href);
      return checked && checked.kind !== "unsafe" && checked.kind !== "unknown" && checked.safeHash === href ? href : "";
    }
    function routeLink(label, href, className = "") {
      const safe = safeHref(href);
      if (!safe) return null;
      const link = document.createElement("a");
      if (className) link.className = className;
      link.href = safe;
      link.textContent = label;
      return link;
    }
    function itemAction(item, className = "") {
      if (item?.taskId) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.dataset.taskOpen = "true";
        button.dataset.taskId = item.taskId;
        button.textContent = item.actionLabel || "Open";
        return button;
      }
      return routeLink(item?.actionLabel || "Open", item?.href, className);
    }
    function text(tag, value, className = "") {
      const element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = String(value || "");
      return element;
    }
    function formatDate(value, includeTime = false) {
      const parsed = Date.parse(value || "");
      if (!Number.isFinite(parsed)) return "";
      return new Intl.DateTimeFormat("en-US", includeTime
        ? { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZone:"America/New_York" }
        : { month:"short", day:"numeric", year:"numeric", timeZone:"America/New_York" }
      ).format(new Date(parsed));
    }
    function priorityLabel(value) {
      const normalized = String(value || "").toLowerCase();
      if (!["urgent", "high", "normal", "low"].includes(normalized)) return "";
      return normalized[0].toUpperCase() + normalized.slice(1) + " priority";
    }
    function metadata(item, { progress = false } = {}) {
      const row = document.createElement("div");
      row.className = "vnext-today-meta";
      const values = progress
        ? [item.destination, item.updatedAt ? "Moved " + formatDate(item.updatedAt, true) : ""]
        : [item.objectType || item.destination, priorityLabel(item.priority), item.dueAt ? "Due " + formatDate(item.dueAt) : "", item.owner ? "Owner: " + item.owner : ""];
      for (const value of values.filter(Boolean)) row.append(text("span", value));
      return row;
    }
    function replaceAnswer(kind, children) {
      const section = node('[data-today-answer="' + kind + '"]');
      if (section) section.replaceChildren(...children);
      return section;
    }
    function answerHeading(kind, titleText) {
      const id = "vnext-today-" + kind + "-title";
      const label = text("p", kind === "needs-you" ? "Needs you" : kind, "vnext-today-section-label");
      const title = text("h2", titleText);
      title.id = id;
      return [label, title];
    }
    function renderNow(payload) {
      const item = payload.nowItem;
      if (!item) {
        const guided = document.createElement("div");
        if (window.__LE_DISCOVERY_EMPTY_STATES?.render?.(guided, "today", "empty")) {
          replaceAnswer("now", [...guided.children]);
          return;
        }
        const children = answerHeading("now", "You’re clear to plan the day");
        children.push(text("p", "Nothing is currently ranked as your next action.", "vnext-today-empty-copy"));
        const actions = document.createElement("div");
        actions.className = "vnext-today-actions";
        actions.append(routeLink("Open Inbox", "#inbox?group=needs-me", "vnext-today-secondary-action"));
        const plan = routeLink("Review today’s plan", payload.utilities?.reviewPlanHref, "vnext-today-text-action");
        if (plan) actions.append(plan);
        children.push(actions);
        replaceAnswer("now", children);
        return;
      }
      const children = [
        text("p", "Now", "vnext-today-section-label"),
        text("p", item.objectType || item.destination, "vnext-today-context"),
        text("h2", item.title),
        text("p", item.whyNow, "vnext-today-why")
      ];
      if (item.summary && item.summary !== item.whyNow) children.push(text("p", item.summary, "vnext-today-summary"));
      children.push(metadata(item));
      const action = itemAction(item, "vnext-today-primary-action");
      if (action) {
        action.setAttribute("aria-label", item.actionAccessibleName || item.actionLabel + " " + item.title);
        children.push(action);
      }
      replaceAnswer("now", children);
    }
    function renderNext(payload) {
      const items = Array.isArray(payload.nextItems) ? payload.nextItems.slice(0, contract.maximumNextItems) : [];
      if (!items.length) {
        replaceAnswer("next", [
          ...answerHeading("next", "No additional priorities"),
          text("p", "There are no other ranked actions right now.", "vnext-today-empty-copy")
        ]);
        return;
      }
      const children = answerHeading("next", "Your next three things");
      const list = document.createElement("ol");
      list.className = "vnext-today-next-list";
      items.forEach((item) => {
        const row = document.createElement("li");
        const body = document.createElement("div");
        body.className = "vnext-today-item-body";
        body.append(text("p", item.objectType || item.destination, "vnext-today-context"), text("h3", item.title));
        if (item.whyNow) body.append(text("p", item.whyNow, "vnext-today-summary"));
        body.append(metadata(item));
        const action = itemAction(item, "vnext-today-item-action");
        if (action) action.setAttribute("aria-label", (item.actionLabel || "Open") + " " + item.title);
        row.append(body);
        if (action) row.append(action);
        list.append(row);
      });
      children.push(list);
      replaceAnswer("next", children);
    }
    function renderNeedsYou(payload) {
      const summary = payload.needsMeSummary || {};
      const count = Number(summary.count || 0);
      const children = answerHeading("needs-you", count ? "Your attention is needed" : "Nothing needs you");
      if (!count) {
        children.push(text("p", "You’re caught up on items requiring your attention.", "vnext-today-empty-copy"));
      } else {
        const counts = document.createElement("div");
        counts.className = "vnext-today-counts";
        const primary = document.createElement("p");
        primary.append(text("strong", String(count)), document.createTextNode(count === 1 ? " item needs you" : " items need you"));
        counts.append(primary);
        if (Number(summary.urgentCount) > 0) counts.append(text("p", summary.urgentCount + " urgent", "is-urgent"));
        if (Number(summary.highCount) > 0) counts.append(text("p", summary.highCount + " high priority"));
        children.push(counts);
        const items = document.createElement("ul");
        items.className = "vnext-today-compact-list";
        for (const item of (summary.topItems || []).slice(0, 3)) {
          const row = document.createElement("li");
          const link = item.taskId
            ? itemAction({ ...item, actionLabel:item.title }, "vnext-today-compact-task")
            : routeLink(item.title, item.href);
          if (!link) continue;
          row.append(link, text("span", item.destination));
          items.append(row);
        }
        if (items.children.length) children.push(items);
      }
      const inbox = routeLink("Open Inbox", summary.href || "#inbox?group=needs-me", "vnext-today-secondary-action");
      if (inbox) children.push(inbox);
      replaceAnswer("needs-you", children);
    }
    function renderProgress(payload) {
      const summary = payload.progressSummary || {};
      const children = [text("p", "Progress", "vnext-today-section-label")];
      if (summary.available === false) {
        children.push(text("h2", "Progress is unavailable"));
        children.push(text("p", "This week’s authorized progress source could not be read. No work totals are shown.", "vnext-today-empty-copy"));
      } else if (!Number(summary.count || 0)) {
        children.push(text("h2", "No progress recorded this week"));
        children.push(text("p", "Meaningful movement will appear here as work moves forward.", "vnext-today-empty-copy"));
      } else {
        children.push(text("h2", summary.count + (summary.count === 1 ? " meaningful move" : " meaningful moves")));
        children.push(text("p", summary.periodLabel || "This week", "vnext-today-period"));
        const list = document.createElement("ul");
        list.className = "vnext-today-progress-list";
        for (const item of (summary.items || []).slice(0, contract.maximumProgressItems)) {
          const row = document.createElement("li");
          const body = document.createElement("div");
          const link = routeLink(item.title, item.href);
          if (!link) continue;
          link.className = "vnext-today-progress-link";
          body.append(link);
          if (item.summary) body.append(text("p", item.summary, "vnext-today-summary"));
          body.append(metadata(item, { progress:true }));
          row.append(body);
          list.append(row);
        }
        children.push(list);
      }
      const updates = routeLink("View updates", summary.href || "#inbox?group=updates", "vnext-today-secondary-action");
      if (updates) children.push(updates);
      replaceAnswer("progress", children);
    }
    function renderUtility(payload) {
      const host = node("[data-today-utility]");
      if (!host) return;
      host.replaceChildren();
      if (!payload.utilities?.quickCaptureAvailable) return;
      const aside = document.createElement("aside");
      aside.className = "vnext-today-quick-capture";
      aside.setAttribute("aria-label", "Quick Capture");
      const copy = document.createElement("div");
      copy.append(text("h2", "Quick Capture"), text("p", "Choose a clear intent and confirm where it will be saved."));
      const action = document.createElement("button");
      action.type = "button";
      action.className = "vnext-today-text-action";
      action.textContent = "Open Quick Capture";
      action.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("vnext:open-quick-capture", { detail:{ returnTarget:action } }));
      });
      aside.append(copy);
      aside.append(action);
      host.append(aside);
    }
    function renderPayload(payload) {
      settledPageState = "";
      currentPayload = payload;
      const content = node("[data-today-content]");
      if (content) content.setAttribute("aria-busy", "false");
      const date = node("[data-today-date]");
      if (date) date.textContent = payload.dateLabel || "";
      renderNow(payload);
      renderNext(payload);
      renderNeedsYou(payload);
      renderProgress(payload);
      renderUtility(payload);
      const live = node("[data-today-live]");
      if (live) live.textContent = "Today is ready";
      metrics.skeletonToContentMs = Math.round((performance.now() - loadingStartedAt) * 10) / 10;
    }
    function stateAction(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vnext-today-secondary-action";
      button.textContent = label;
      button.addEventListener("click", action);
      return button;
    }
    function resetLoadingScaffold() {
      const target = app();
      if (!target) return false;
      const lee = target.querySelector(".lee-bubble-wrap");
      target.innerHTML = loadingHtml;
      if (lee) target.append(lee);
      loadingStartedAt = performance.now();
      return true;
    }
    function renderPageState(kind, titleText, messageText, actions = []) {
      const target = app();
      if (!target) return;
      const section = target.querySelector("[data-today-page]") || document.createElement("section");
      section.replaceChildren();
      section.className = "vnext-today-page vnext-today-page-state";
      section.dataset.todayPage = "";
      section.dataset.todayPageState = kind;
      section.setAttribute("role", kind === "error" || kind === "unauthorized" ? "alert" : "status");
      const title = text("h1", titleText);
      title.tabIndex = -1;
      section.append(title, text("p", messageText));
      const row = document.createElement("div");
      row.className = "vnext-today-actions";
      row.append(...actions.filter(Boolean));
      if (row.children.length) section.append(row);
      if (!section.isConnected) {
        const lee = target.querySelector(".lee-bubble-wrap");
        target.replaceChildren(section);
        if (lee) target.append(lee);
      }
      setTimeout(() => title.focus(), 0);
    }
    function renderError() {
      settledPageState = "error";
      renderPageState("error", "Today could not load", "No records were changed. Try again.", [
        stateAction("Try again", () => {
          settledPageState = "";
          resetLoadingScaffold();
          load({ force:true });
        }),
        routeLink("Open Inbox", "#inbox?group=needs-me", "vnext-today-secondary-action")
      ]);
    }
    function renderUnauthorized() {
      settledPageState = "unauthorized";
      renderPageState("unauthorized", "Today needs additional access", "This account does not have permission to view this work. No protected details were loaded.", [
        routeLink("Open Help", "#operator-manual", "vnext-today-secondary-action")
      ]);
    }
    async function load({ force = false } = {}) {
      if (!onTodayRoute() || sessionEnded || !ensureScaffold()) return null;
      if (pending) {
        metrics.suppressedDuplicateLoads += 1;
        return pending;
      }
      if (!force && currentPayload) {
        renderPayload(currentPayload);
        return currentPayload;
      }
      const sequence = ++requestSequence;
      const startedAt = performance.now();
      metrics.requests += 1;
      const promise = fetch(contract.endpoint, {
        method:"GET",
        credentials:"same-origin",
        headers:{ accept:"application/json" }
      }).then(async (response) => {
        const body = await response.text();
        metrics.lastResponseBytes = new TextEncoder().encode(body).byteLength;
        metrics.lastResponseMs = Math.round((performance.now() - startedAt) * 10) / 10;
        let payload = {};
        try { payload = JSON.parse(body || "{}"); } catch {}
        if (response.status === 401) {
          sessionEnded = true;
          currentPayload = null;
          return null;
        }
        if (response.status === 403) {
          currentPayload = null;
          renderUnauthorized();
          return null;
        }
        if (!response.ok || payload.ok !== true) throw new Error("Today unavailable");
        if (sequence !== requestSequence || !onTodayRoute()) return null;
        renderPayload(payload);
        return payload;
      }).catch(() => {
        metrics.readErrors += 1;
        if (sequence === requestSequence && onTodayRoute() && !sessionEnded) {
          try {
            renderError();
            metrics.errorRenders += 1;
          } catch {
            metrics.errorRenderFailures += 1;
          }
        }
        return null;
      }).finally(() => {
        if (pending === promise) pending = null;
      });
      pending = promise;
      return promise;
    }
    function activate() {
      if (!onTodayRoute() || sessionEnded || settledPageState || !ensureScaffold()) return;
      if (window.__LE_BOOT && window.__LE_BOOT.ready !== true) {
        if (bootWaitTimer === null) {
          bootWaitTimer = setTimeout(() => {
            bootWaitTimer = null;
            activate();
          }, 20);
        }
        return;
      }
      load();
    }
    function observeApp() {
      const target = app();
      if (!target) return;
      new MutationObserver(() => {
        if (!onTodayRoute() || observerQueued || sessionEnded || target.querySelector("[data-today-page], [data-today-page-state]")) return;
        observerQueued = true;
        queueMicrotask(() => {
          observerQueued = false;
          if (target.querySelector("[data-today-page-state]")) return;
          if (settledPageState === "error") renderError();
          else if (settledPageState === "unauthorized") renderUnauthorized();
          else activate();
        });
      }).observe(target, { childList:true });
    }
    window.addEventListener("hashchange", () => {
      currentPayload = null;
      settledPageState = "";
      if (onTodayRoute()) activate();
    });
    document.addEventListener("vnext:session-expired", () => {
      sessionEnded = true;
      currentPayload = null;
      settledPageState = "session-ended";
      requestSequence += 1;
      if (bootWaitTimer !== null) clearTimeout(bootWaitTimer);
      bootWaitTimer = null;
    });
    document.addEventListener("vnext:recovery-mode", () => {
      currentPayload = null;
      settledPageState = "recovery";
      requestSequence += 1;
    });
    window.__LE_TODAY_PAGE = Object.freeze({ activate, refresh:() => load({ force:true }) });
    observeApp();
    activate();
  })();`;
}
