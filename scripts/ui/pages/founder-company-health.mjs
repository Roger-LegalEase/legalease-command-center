import { FOUNDER_COMPANY_HEALTH_ENDPOINT } from "../../founder-company-health-service.mjs";

export const FOUNDER_COMPANY_HEALTH_STYLESHEET_PATH = "assets/ui/founder-company-health.css";
export const FOUNDER_COMPANY_HEALTH_CONTRACT = Object.freeze({
  endpoint:FOUNDER_COMPANY_HEALTH_ENDPOINT,
  routes:Object.freeze(["company-health", "os-health", "health", "app-status", "system"]),
  canonicalRoutes:Object.freeze(["company-health", "os-health"])
});

export function renderFounderCompanyHealthLoading() {
  return `<section class="founder-health" data-founder-company-health aria-labelledby="founder-health-title">
    <header class="founder-health__header">
      <div>
        <p class="founder-health__eyebrow">Company overview</p>
        <h1 id="founder-health-title">Company Health</h1>
        <p>A calm view of the connections and checks LegalEase relies on. Detailed system information stays out of this view.</p>
      </div>
      <button class="founder-health__refresh" type="button" data-health-refresh aria-busy="true" disabled>Refresh</button>
    </header>
    <div class="founder-health__message" data-health-message role="status" aria-live="polite" hidden></div>
    <div class="founder-health__loading" data-health-loading role="status" aria-label="Loading Company Health">
      <span class="founder-health__sr-only">Loading Company Health</span>
      <div class="founder-health__overall-skeleton" aria-hidden="true"><span></span><strong></strong><i></i></div>
      <div class="founder-health__skeleton-grid" aria-hidden="true">
        ${Array.from({ length:9 }, () => `<div class="founder-health__card-skeleton"><span></span><strong></strong><i></i><i></i></div>`).join("")}
      </div>
    </div>
    <div class="founder-health__state" data-health-state hidden></div>
    <div class="founder-health__content" data-health-content hidden>
      <section class="founder-health__overall" data-health-overall aria-labelledby="founder-health-overall-title">
        <div class="founder-health__overall-main">
          <span class="founder-health__signal" data-health-overall-signal aria-hidden="true"></span>
          <div>
            <div class="founder-health__overall-label"><p>Overall status</p><span class="founder-health__badge" data-health-overall-badge>Unavailable</span></div>
            <h2 id="founder-health-overall-title" data-health-overall-summary>Company Health is unavailable.</h2>
            <p class="founder-health__generated" data-health-generated>Last checked time unavailable</p>
          </div>
        </div>
        <dl class="founder-health__counts" aria-label="Company Health summary">
          <div data-status="healthy"><dt>Healthy</dt><dd data-health-count="healthy">0</dd></div>
          <div data-status="needs_attention"><dt>Needs attention</dt><dd data-health-count="needsAttention">0</dd></div>
          <div data-status="unavailable"><dt>Unavailable</dt><dd data-health-count="unavailable">0</dd></div>
        </dl>
        <div class="founder-health__last-success" data-health-last-success>
          <p>Last successful operation</p>
          <strong>No recent successful operation is recorded.</strong>
          <span></span>
        </div>
      </section>
      <section class="founder-health__areas" aria-labelledby="founder-health-areas-title">
        <div class="founder-health__section-heading"><div><p class="founder-health__section-kicker">Nine essential areas</p><h2 id="founder-health-areas-title">What LegalEase relies on</h2></div><p>Unavailable means there is not enough recent evidence to report a result—it does not mean healthy or broken.</p></div>
        <div class="founder-health__grid" data-health-components></div>
      </section>
      <section class="founder-health__advanced" aria-labelledby="founder-health-advanced-title">
        <div class="founder-health__advanced-heading">
          <div><p class="founder-health__section-kicker">Secondary detail</p><h2 id="founder-health-advanced-title">Advanced checks</h2><p>See bounded check results without exposing sensitive system information.</p></div>
          <button type="button" data-health-advanced-toggle aria-expanded="false" aria-controls="founder-health-advanced-panel">Show advanced checks</button>
        </div>
        <div id="founder-health-advanced-panel" class="founder-health__advanced-panel" data-health-advanced-panel aria-labelledby="founder-health-advanced-title" hidden></div>
      </section>
    </div>
  </section>`;
}

export function founderCompanyHealthBrowserSource() {
  const contract = JSON.stringify(FOUNDER_COMPANY_HEALTH_CONTRACT).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderFounderCompanyHealthLoading()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const loadingHtml = ${loadingHtml};
    const metrics = { requests:0, advancedRequests:0, duplicateRequests:0, staleRequestsAborted:0, renderedAreas:0, mutations:0, externalActions:0, providerCalls:0, fullStateRequests:0, rawLogsRendered:0, lastResponseBytes:0 };
    window.__LE_FOUNDER_COMPANY_HEALTH_METRICS = metrics;
    let activeRequest = null;
    let advancedRequest = null;
    let requestSequence = 0;
    let advancedSequence = 0;
    let currentView = null;
    let advancedView = null;
    let advancedExpanded = false;
    let sessionEnded = false;
    let observerQueued = false;
    let bootWaitTimer = null;

    function app() { return document.querySelector("main#app"); }
    function rawRoute() { return String(location.hash || "#today").slice(1).split(/[/?]/)[0].toLocaleLowerCase("en-US"); }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function onRoute() {
      if (contract.routes.includes(rawRoute())) return true;
      const resolved = resolution();
      return resolved?.kind === "page" && contract.canonicalRoutes.includes(resolved.canonicalRoute);
    }
    function host() {
      const main = app();
      if (!main) return null;
      return main.querySelector("#company-health.page-section.active,#os-health.page-section.active") || main;
    }
    function root() { return host()?.querySelector("[data-founder-company-health]") || null; }
    function node(selector) { return root()?.querySelector(selector) || null; }
    function ensureScaffold() {
      const target = host();
      if (!target || sessionEnded || app()?.querySelector("[data-vnext-shell-state='session_expired']")) return false;
      if (!target.querySelector("[data-founder-company-health]")) {
        const lee = target === app() ? target.querySelector(".lee-bubble-wrap") : null;
        target.innerHTML = loadingHtml;
        if (lee) target.append(lee);
        bindScaffold();
      }
      return true;
    }
    function text(tag, value, className = "") {
      const element = document.createElement(tag);
      element.textContent = String(value ?? "");
      if (className) element.className = className;
      return element;
    }
    function bounded(value, maximum = 260) {
      return String(value ?? "").replace(/[\\u0000-\\u001f\\u007f]/g, " ").replace(/\\s+/g, " ").trim().slice(0, maximum);
    }
    function statusKey(value) { return ["healthy", "needs_attention", "unavailable"].includes(value) ? value : "unavailable"; }
    function statusLabel(value) {
      const key = statusKey(value?.key);
      return key === "healthy" ? "Healthy" : key === "needs_attention" ? "Needs attention" : "Unavailable";
    }
    function setStatus(element, status) {
      if (!element) return;
      const key = statusKey(status?.key);
      element.dataset.status = key;
      element.textContent = statusLabel(status);
    }
    function dateTime(value, unavailable = "Time unavailable") {
      if (!value) return unavailable;
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return unavailable;
      return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }).format(date);
    }
    function safeHref(value) {
      const href = String(value || "");
      return ["#settings"].includes(href) ? href : "";
    }
    function setMessage(message = "", kind = "status") {
      const target = node("[data-health-message]");
      if (!target) return;
      target.hidden = !message;
      target.textContent = bounded(message, 220);
      target.dataset.kind = kind;
      target.setAttribute("role", kind === "error" ? "alert" : "status");
    }
    function setRefreshBusy(busy) {
      const button = node("[data-health-refresh]");
      if (!button) return;
      button.disabled = busy;
      button.setAttribute("aria-busy", busy ? "true" : "false");
      button.textContent = busy ? "Refreshing…" : "Refresh";
    }
    function actionButton(label, action) {
      const button = text("button", label);
      button.type = "button";
      button.addEventListener("click", action);
      return button;
    }
    function showLoading() {
      node("[data-health-loading]")?.removeAttribute("hidden");
      node("[data-health-content]")?.setAttribute("hidden", "");
      node("[data-health-state]")?.setAttribute("hidden", "");
      setRefreshBusy(true);
    }
    function renderState(kind, titleValue, messageValue, retry = false) {
      node("[data-health-loading]")?.setAttribute("hidden", "");
      node("[data-health-content]")?.setAttribute("hidden", "");
      const target = node("[data-health-state]");
      if (!target) return;
      target.replaceChildren();
      target.dataset.kind = kind;
      target.setAttribute("role", kind === "error" || kind === "unauthorized" ? "alert" : "status");
      const heading = text("h2", titleValue);
      if (kind === "error" || kind === "unauthorized") heading.tabIndex = -1;
      target.append(heading, text("p", messageValue));
      if (retry) target.append(actionButton("Try again", () => load({ force:true })));
      target.hidden = false;
      setRefreshBusy(false);
      if (heading.tabIndex === -1) setTimeout(() => heading.focus(), 0);
    }
    function timeDefinition(label, value, unavailable) {
      const wrapper = document.createElement("div");
      const dt = text("dt", label);
      const dd = document.createElement("dd");
      if (value) {
        const time = text("time", dateTime(value));
        time.dateTime = value;
        dd.append(time);
      } else dd.textContent = unavailable;
      wrapper.append(dt, dd);
      return wrapper;
    }
    function componentCard(component) {
      const article = document.createElement("article");
      const key = statusKey(component?.status?.key);
      article.className = "founder-health__card";
      article.dataset.status = key;
      article.dataset.healthArea = bounded(component?.id, 60);
      const top = document.createElement("div");
      top.className = "founder-health__card-top";
      top.append(text("h3", bounded(component?.label, 90) || "Company service"));
      const badge = text("span", statusLabel(component?.status), "founder-health__badge");
      badge.dataset.status = key;
      top.append(badge);
      const summary = text("p", bounded(component?.summary, 220) || "No recent health information is available.", "founder-health__card-summary");
      const times = document.createElement("dl");
      times.className = "founder-health__times";
      times.append(
        timeDefinition("Last checked", component?.lastCheckedAt, "No recent check"),
        timeDefinition("Last successful", component?.lastSuccessfulAt, "No successful check recorded")
      );
      article.append(top, summary, times);
      const href = safeHref(component?.actionHref);
      if (href && key !== "healthy") {
        const link = text("a", "Review connection", "founder-health__link");
        link.href = href;
        link.setAttribute("aria-label", "Review " + bounded(component?.label, 90) + " connection");
        article.append(link);
      }
      return article;
    }
    function renderOverall(view) {
      const key = statusKey(view?.overall?.status?.key);
      const overall = node("[data-health-overall]");
      if (overall) overall.dataset.status = key;
      const signal = node("[data-health-overall-signal]");
      if (signal) signal.dataset.status = key;
      setStatus(node("[data-health-overall-badge]"), view?.overall?.status);
      const summary = node("[data-health-overall-summary]");
      if (summary) summary.textContent = bounded(view?.overall?.summary, 180) || "Company Health is unavailable.";
      const generated = node("[data-health-generated]");
      if (generated) generated.textContent = "Health view refreshed " + dateTime(view?.generatedAt, "time unavailable");
      for (const name of ["healthy", "needsAttention", "unavailable"]) {
        const count = node('[data-health-count="' + name + '"]');
        if (count) count.textContent = Number(view?.overall?.counts?.[name] || 0).toLocaleString("en-US");
      }
      const last = node("[data-health-last-success]");
      if (last) {
        const available = view?.lastSuccessfulOperation?.available === true;
        const label = last.querySelector("strong");
        const timestamp = last.querySelector("span");
        if (label) label.textContent = bounded(view?.lastSuccessfulOperation?.label, 150) || "No recent successful operation is recorded.";
        if (timestamp) timestamp.textContent = available ? dateTime(view.lastSuccessfulOperation.occurredAt) : "A successful check has not been recorded yet.";
        last.dataset.available = available ? "true" : "false";
      }
    }
    function renderComponents(view) {
      const target = node("[data-health-components]");
      const components = Array.isArray(view?.components) ? view.components : [];
      if (target) target.replaceChildren(...components.map(componentCard));
      metrics.renderedAreas = components.length;
    }
    function renderView(view, message = "") {
      currentView = view;
      node("[data-health-loading]")?.setAttribute("hidden", "");
      node("[data-health-state]")?.setAttribute("hidden", "");
      node("[data-health-content]")?.removeAttribute("hidden");
      renderOverall(view);
      renderComponents(view);
      setRefreshBusy(false);
      setMessage(message, message ? "success" : "status");
      root()?.setAttribute("data-loaded", "true");
    }
    function advancedBadge(status) {
      const badge = text("span", statusLabel(status), "founder-health__badge");
      badge.dataset.status = statusKey(status?.key);
      return badge;
    }
    function renderAdvancedLoading() {
      const panel = node("[data-health-advanced-panel]");
      if (!panel) return;
      panel.hidden = false;
      panel.dataset.state = "loading";
      panel.setAttribute("role", "status");
      panel.replaceChildren(text("p", "Loading bounded checks…", "founder-health__advanced-state"));
    }
    function renderAdvancedState(message, retry = false) {
      const panel = node("[data-health-advanced-panel]");
      if (!panel) return;
      panel.hidden = false;
      panel.dataset.state = "message";
      panel.setAttribute("role", "status");
      panel.replaceChildren(text("p", message, "founder-health__advanced-state"));
      if (retry) panel.append(actionButton("Try advanced checks again", () => loadAdvanced({ force:true })));
    }
    function renderAdvanced(advanced) {
      const panel = node("[data-health-advanced-panel]");
      if (!panel) return;
      if (advanced?.available !== true) {
        renderAdvancedState("Advanced checks are not available for this account.");
        return;
      }
      const intro = text("p", "Only bounded, founder-safe check results are shown.", "founder-health__advanced-summary");
      const list = document.createElement("ol");
      list.className = "founder-health__advanced-list";
      for (const check of Array.isArray(advanced.checks) ? advanced.checks : []) {
        const item = document.createElement("li");
        item.dataset.status = statusKey(check?.status?.key);
        const heading = document.createElement("div");
        heading.append(text("h3", bounded(check?.label, 100) || "Bounded check"), advancedBadge(check?.status));
        const checked = check?.lastCheckedAt ? "Last checked " + dateTime(check.lastCheckedAt) : "No recent check";
        const success = check?.lastSuccessfulAt ? "Last successful " + dateTime(check.lastSuccessfulAt) : "No successful check recorded";
        item.append(heading, text("p", bounded(check?.detail, 180) || "No bounded check is available."), text("span", checked + " · " + success));
        list.append(item);
      }
      panel.dataset.state = "loaded";
      panel.setAttribute("role", "region");
      panel.replaceChildren(intro, list);
      panel.hidden = !advancedExpanded;
    }
    function setAdvancedExpanded(expanded) {
      advancedExpanded = expanded;
      const toggle = node("[data-health-advanced-toggle]");
      const panel = node("[data-health-advanced-panel]");
      if (toggle) {
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.textContent = expanded ? "Hide advanced checks" : "Show advanced checks";
      }
      if (panel) panel.hidden = !expanded;
    }
    async function loadAdvanced({ force = false } = {}) {
      if (!onRoute() || sessionEnded || !advancedExpanded) return null;
      if (advancedRequest) {
        if (!force) { metrics.duplicateRequests += 1; return advancedRequest.promise; }
        advancedRequest.controller.abort();
        metrics.staleRequestsAborted += 1;
      }
      if (advancedView && !force) { renderAdvanced(advancedView); return advancedView; }
      renderAdvancedLoading();
      const controller = new AbortController();
      const sequence = ++advancedSequence;
      metrics.requests += 1;
      metrics.advancedRequests += 1;
      const promise = fetch(contract.endpoint + "?advanced=true", { credentials:"same-origin", headers:{ accept:"application/json" }, signal:controller.signal }).then(async (response) => {
        const responseText = await response.text();
        metrics.lastResponseBytes = new TextEncoder().encode(responseText).byteLength;
        const body = JSON.parse(responseText || "{}");
        if (response.status === 401) { sessionEnded = true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return null; }
        if (response.status === 403) { if (sequence === advancedSequence) renderAdvancedState("Advanced checks are not available for this account."); return null; }
        if (!response.ok || body.ok !== true || !body.health) throw new Error("Advanced checks could not load.");
        metrics.externalActions += Number(body.externalActions || 0);
        advancedView = body.health.advanced;
        if (sequence === advancedSequence && onRoute() && advancedExpanded) renderAdvanced(advancedView);
        return advancedView;
      }).catch((error) => {
        if (error.name !== "AbortError" && sequence === advancedSequence && advancedExpanded) renderAdvancedState("Advanced checks could not load. No settings were changed.", true);
        return null;
      }).finally(() => { if (advancedRequest?.controller === controller) advancedRequest = null; });
      advancedRequest = { controller, promise };
      return promise;
    }
    async function load({ force = false } = {}) {
      if (!onRoute() || sessionEnded || !ensureScaffold()) return null;
      if (activeRequest) {
        if (!force) { metrics.duplicateRequests += 1; return activeRequest.promise; }
        activeRequest.controller.abort();
        metrics.staleRequestsAborted += 1;
      }
      const initial = !currentView;
      const scrollTop = window.scrollY;
      if (initial) showLoading(); else { setRefreshBusy(true); setMessage("Refreshing Company Health…"); }
      const controller = new AbortController();
      const sequence = ++requestSequence;
      metrics.requests += 1;
      const promise = fetch(contract.endpoint, { credentials:"same-origin", headers:{ accept:"application/json" }, signal:controller.signal }).then(async (response) => {
        const responseText = await response.text();
        metrics.lastResponseBytes = new TextEncoder().encode(responseText).byteLength;
        const body = JSON.parse(responseText || "{}");
        if (response.status === 401) { sessionEnded = true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return null; }
        if (response.status === 403) { if (sequence === requestSequence) renderState("unauthorized", "Company Health needs additional access", "This account cannot view company operating information."); return null; }
        if (!response.ok || body.ok !== true || !body.health?.available) throw new Error("Company Health could not load.");
        metrics.externalActions += Number(body.externalActions || 0);
        if (sequence === requestSequence && onRoute()) {
          renderView(body.health, force ? "Company Health refreshed." : "");
          if (!initial) requestAnimationFrame(() => window.scrollTo({ top:scrollTop, behavior:"auto" }));
          if (advancedExpanded) { advancedView = null; loadAdvanced({ force:true }); }
        }
        return body.health;
      }).catch((error) => {
        if (error.name === "AbortError") return null;
        if (sequence === requestSequence && onRoute()) {
          if (currentView) { setRefreshBusy(false); setMessage("Company Health could not refresh. Existing results remain unchanged.", "error"); }
          else renderState("error", "Company Health could not load", "No settings were changed. Try again.", true);
        }
        return null;
      }).finally(() => { if (activeRequest?.controller === controller) activeRequest = null; });
      activeRequest = { controller, promise };
      return promise;
    }
    function bindScaffold() {
      const page = root();
      if (!page || page.dataset.bound === "true") return;
      page.dataset.bound = "true";
      node("[data-health-refresh]")?.addEventListener("click", () => load({ force:true }));
      node("[data-health-advanced-toggle]")?.addEventListener("click", () => {
        const next = !advancedExpanded;
        setAdvancedExpanded(next);
        if (next) loadAdvanced();
      });
      page.addEventListener("vnext:guided-retry", () => load({ force:true }));
    }
    function activate() {
      if (!onRoute() || sessionEnded) return;
      if (window.__LE_BOOT && window.__LE_BOOT.ready !== true) {
        if (bootWaitTimer === null) bootWaitTimer = setTimeout(() => { bootWaitTimer = null; activate(); }, 20);
        return;
      }
      if (!ensureScaffold()) return;
      if (currentView) { renderView(currentView); return; }
      load();
    }
    function routeChanged() {
      if (!onRoute()) {
        activeRequest?.controller.abort();
        advancedRequest?.controller.abort();
        activeRequest = null;
        advancedRequest = null;
        currentView = null;
        advancedView = null;
        advancedExpanded = false;
        return;
      }
      currentView = null;
      advancedView = null;
      advancedExpanded = false;
      activate();
    }
    window.addEventListener("hashchange", routeChanged);
    document.addEventListener("vnext:session-expired", () => {
      sessionEnded = true;
      activeRequest?.controller.abort();
      advancedRequest?.controller.abort();
      activeRequest = null;
      advancedRequest = null;
      currentView = null;
      advancedView = null;
      if (bootWaitTimer !== null) clearTimeout(bootWaitTimer);
      bootWaitTimer = null;
    });
    const observedApp = app();
    if (observedApp) new MutationObserver(() => {
      if (observerQueued || !onRoute() || sessionEnded || host()?.querySelector("[data-founder-company-health]")) return;
      observerQueued = true;
      queueMicrotask(() => { observerQueued = false; activate(); });
    }).observe(observedApp, { childList:true, subtree:true });
    window.__LE_FOUNDER_COMPANY_HEALTH = Object.freeze({ activate, refresh:() => load({ force:true }) });
    activate();
  })();`;
}
