import {
  FOUNDER_FINANCE_INPUT_ENDPOINT,
  FOUNDER_SCOREBOARD_ENDPOINT
} from "../../founder-scoreboard-service.mjs";

export const FOUNDER_SCOREBOARD_STYLESHEET_PATH = "assets/ui/founder-scoreboard.css";
export const FOUNDER_SCOREBOARD_CONTRACT = Object.freeze({
  endpoint:FOUNDER_SCOREBOARD_ENDPOINT,
  financeEndpoint:FOUNDER_FINANCE_INPUT_ENDPOINT,
  routes:Object.freeze(["revenue", "scoreboard", "metrics", "kpis"]),
  canonicalRoutes:Object.freeze(["revenue", "metrics"])
});

export function renderFounderScoreboardLoading() {
  return `<section class="founder-scoreboard" data-founder-scoreboard aria-labelledby="founder-scoreboard-title">
    <header class="founder-scoreboard__header">
      <div class="founder-scoreboard__heading">
        <p class="founder-scoreboard__eyebrow">Founder command center</p>
        <h1 id="founder-scoreboard-title">Scoreboard</h1>
        <p>A truthful view of money, acquisition, relationships, customers, marketing, and platform health. Missing information stays unavailable.</p>
      </div>
      <button class="founder-scoreboard__refresh" type="button" data-scoreboard-refresh aria-busy="true" disabled>Refresh</button>
    </header>
    <div class="founder-scoreboard__summary" data-scoreboard-summary aria-label="Scoreboard source status">
      <span class="founder-scoreboard__summary-item" data-status="live"><strong data-scoreboard-count="live">0</strong> Live</span>
      <span class="founder-scoreboard__summary-item" data-status="manual"><strong data-scoreboard-count="manual">0</strong> Manual</span>
      <span class="founder-scoreboard__summary-item" data-status="needs_attention"><strong data-scoreboard-count="needsAttention">0</strong> Needs attention</span>
      <span class="founder-scoreboard__summary-item" data-status="unavailable"><strong data-scoreboard-count="unavailable">0</strong> Unavailable</span>
      <span class="founder-scoreboard__generated" data-scoreboard-generated>Loading latest values…</span>
    </div>
    <div class="founder-scoreboard__message" data-scoreboard-message role="status" aria-live="polite" hidden></div>
    <div class="founder-scoreboard__loading" data-scoreboard-loading role="status" aria-label="Loading Scoreboard">
      <span class="founder-scoreboard__sr-only">Loading Scoreboard</span>
      ${Array.from({ length:6 }, () => `<div class="founder-scoreboard__skeleton" aria-hidden="true"><span></span><strong></strong><i></i><i></i></div>`).join("")}
    </div>
    <div class="founder-scoreboard__state" data-scoreboard-state hidden></div>
    <div class="founder-scoreboard__content" data-scoreboard-content hidden>
      <section class="founder-scoreboard__finance" aria-labelledby="founder-scoreboard-finance-title">
        <div class="founder-scoreboard__section-heading">
          <div><p class="founder-scoreboard__section-kicker">Owner input</p><h2 id="founder-scoreboard-finance-title">Keep cash and burn current</h2></div>
          <p>These values calculate runway without turning the Command Center into accounting software.</p>
        </div>
        <form class="founder-scoreboard__finance-form" data-scoreboard-finance-form novalidate>
          <label class="founder-scoreboard__field">
            <span>Cash available</span>
            <span class="founder-scoreboard__money-field"><span aria-hidden="true">$</span><input name="currentCashBalance" type="number" inputmode="decimal" min="0" max="1000000000000" step="0.01" autocomplete="off" aria-describedby="scoreboard-cash-help scoreboard-cash-error"></span>
            <small id="scoreboard-cash-help">Current bank cash you want to operate against.</small>
            <small class="founder-scoreboard__field-error" id="scoreboard-cash-error" data-finance-error="currentCashBalance"></small>
          </label>
          <label class="founder-scoreboard__field">
            <span>Monthly burn</span>
            <span class="founder-scoreboard__money-field"><span aria-hidden="true">$</span><input name="monthlyBurn" type="number" inputmode="decimal" min="0" max="1000000000000" step="0.01" autocomplete="off" aria-describedby="scoreboard-burn-help scoreboard-burn-error"></span>
            <small id="scoreboard-burn-help">Your current average monthly operating spend.</small>
            <small class="founder-scoreboard__field-error" id="scoreboard-burn-error" data-finance-error="monthlyBurn"></small>
          </label>
          <label class="founder-scoreboard__field">
            <span>As-of date</span>
            <input name="asOfDate" type="date" required aria-describedby="scoreboard-date-help scoreboard-date-error">
            <small id="scoreboard-date-help">The date these two values represent.</small>
            <small class="founder-scoreboard__field-error" id="scoreboard-date-error" data-finance-error="asOfDate"></small>
          </label>
          <input name="expectedUpdatedAt" type="hidden">
          <div class="founder-scoreboard__finance-action">
            <button class="founder-scoreboard__save" type="submit" data-scoreboard-finance-save>Save financial inputs</button>
            <p data-scoreboard-finance-status role="status" aria-live="polite">Nothing is sent outside LegalEase.</p>
          </div>
        </form>
      </section>
      <div class="founder-scoreboard__groups" data-scoreboard-groups></div>
    </div>
  </section>`;
}

export function founderScoreboardBrowserSource() {
  const contract = JSON.stringify(FOUNDER_SCOREBOARD_CONTRACT).replaceAll("<", "\\u003c");
  const loadingHtml = JSON.stringify(renderFounderScoreboardLoading()).replaceAll("<", "\\u003c");
  return `(() => {
    "use strict";
    const contract = ${contract};
    const loadingHtml = ${loadingHtml};
    const metrics = { requests:0, mutations:0, externalActions:0, fullStateRequests:0, renderedCards:0, duplicateClicksBlocked:0, staleRequestsAborted:0, lastResponseBytes:0 };
    window.__LE_FOUNDER_SCOREBOARD_METRICS = metrics;
    let activeRequest = null;
    let requestSequence = 0;
    let currentView = null;
    let saving = false;
    let sessionEnded = false;
    let observerQueued = false;
    let bootWaitTimer = null;

    function app() { return document.querySelector("main#app"); }
    function rawRoute() { return String(location.hash || "#today").slice(1).split(/[/?]/)[0].toLocaleLowerCase("en-US"); }
    function resolution() { return window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today"); }
    function onRoute() {
      const raw = rawRoute();
      if (contract.routes.includes(raw)) return true;
      const resolved = resolution();
      return resolved?.kind === "page" && contract.canonicalRoutes.includes(resolved.canonicalRoute);
    }
    function host() {
      const root = app();
      if (!root) return null;
      return root.querySelector("#revenue.page-section.active,#scoreboard.page-section.active,#metrics.page-section.active,#proof.page-section.active") || root;
    }
    function root() { return host()?.querySelector("[data-founder-scoreboard]") || null; }
    function node(selector) { return root()?.querySelector(selector) || null; }
    function csrf() {
      const value = String(document.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith("leos_csrf="))?.slice("leos_csrf=".length) || "";
      try { return decodeURIComponent(value); } catch { return value; }
    }
    function ensureScaffold() {
      const target = host();
      if (!target || sessionEnded || app()?.querySelector("[data-vnext-shell-state='session_expired']")) return false;
      if (!target.querySelector("[data-founder-scoreboard]")) {
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
    function bounded(value, maximum = 300) {
      return String(value ?? "").replace(/[\\u0000-\\u001f\\u007f]/g, " ").replace(/\\s+/g, " ").trim().slice(0, maximum);
    }
    function setMessage(message = "", kind = "status") {
      const target = node("[data-scoreboard-message]");
      if (!target) return;
      target.hidden = !message;
      target.textContent = bounded(message, 240);
      target.dataset.kind = kind;
      target.setAttribute("role", kind === "error" ? "alert" : "status");
    }
    function setRefreshBusy(busy) {
      const button = node("[data-scoreboard-refresh]");
      if (!button) return;
      button.disabled = busy;
      button.setAttribute("aria-busy", busy ? "true" : "false");
      button.textContent = busy ? "Refreshing…" : "Refresh";
    }
    function showLoading() {
      const loading = node("[data-scoreboard-loading]");
      const content = node("[data-scoreboard-content]");
      const state = node("[data-scoreboard-state]");
      if (loading) loading.hidden = false;
      if (content) content.hidden = true;
      if (state) state.hidden = true;
      setRefreshBusy(true);
    }
    function actionButton(label, action) {
      const button = text("button", label);
      button.type = "button";
      button.addEventListener("click", action);
      return button;
    }
    function renderState(kind, titleValue, messageValue, retry = false) {
      const loading = node("[data-scoreboard-loading]");
      const content = node("[data-scoreboard-content]");
      const state = node("[data-scoreboard-state]");
      if (loading) loading.hidden = true;
      if (content) content.hidden = true;
      if (!state) return;
      state.replaceChildren();
      state.dataset.kind = kind;
      state.setAttribute("role", kind === "error" || kind === "unauthorized" ? "alert" : "status");
      const title = text("h2", titleValue);
      const message = text("p", messageValue);
      if (kind === "error" || kind === "unauthorized") title.tabIndex = -1;
      state.append(title, message);
      if (retry) state.append(actionButton("Try again", () => load({ force:true })));
      state.hidden = false;
      setRefreshBusy(false);
      if (title.tabIndex === -1) setTimeout(() => title.focus(), 0);
    }
    function statusKey(value) {
      return ["live", "manual", "unavailable", "needs_attention"].includes(value) ? value : "unavailable";
    }
    function statusLabel(card) {
      const key = statusKey(card?.status?.key);
      return bounded(card?.status?.label || (key === "needs_attention" ? "Needs attention" : key[0].toUpperCase() + key.slice(1)), 40);
    }
    function currency(value, code = "usd", precision = null) {
      const number = Number(value);
      if (!Number.isFinite(number)) return "Unavailable";
      const decimals = Number.isInteger(precision) ? precision : Number.isInteger(number) ? 0 : 2;
      try { return new Intl.NumberFormat("en-US", { style:"currency", currency:String(code || "usd").toUpperCase(), minimumFractionDigits:decimals, maximumFractionDigits:decimals }).format(number); }
      catch { return "$" + number.toLocaleString("en-US", { maximumFractionDigits:decimals }); }
    }
    function formatValue(value = {}) {
      if (value?.available !== true || value.value === null || value.value === undefined || value.value === "") return "Unavailable";
      if (value.unit === "currency") return currency(value.value, value.currency, value.precision);
      if (value.unit === "percent") return Number(value.value).toLocaleString("en-US", { maximumFractionDigits:Number.isInteger(value.precision) ? value.precision : 1 }) + "%";
      if (value.unit === "months") {
        const amount = Number(value.value);
        return amount.toLocaleString("en-US", { maximumFractionDigits:Number.isInteger(value.precision) ? value.precision : 1 }) + (amount === 1 ? " month" : " months");
      }
      if (value.unit === "status") return bounded(value.value, 80) || "Unavailable";
      const number = Number(value.value);
      return Number.isFinite(number) ? number.toLocaleString("en-US", { maximumFractionDigits:Number.isInteger(value.precision) ? value.precision : 1 }) : bounded(value.value, 80) || "Unavailable";
    }
    function formatPrevious(previous = {}) {
      if (previous?.available !== true) return "Previous unavailable";
      return "Previous " + formatValue({ ...previous, available:true });
    }
    function dateTime(value, unavailable = "Not refreshed") {
      if (!value) return unavailable;
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return unavailable;
      return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }).format(date);
    }
    function friendlyDetail(card) {
      if (card.group === "health") {
        const key = statusKey(card.status?.key);
        return key === "live" ? "Connection is reporting normally." : key === "needs_attention" ? "Open Company Health for the next safe step." : "No current connection result is available.";
      }
      return bounded(card.detail, 260);
    }
    function metricCard(card) {
      const article = document.createElement("article");
      const key = statusKey(card?.status?.key);
      article.className = "founder-scoreboard__card";
      article.dataset.status = key;
      article.dataset.scoreboardCard = bounded(card?.id, 80);

      const heading = document.createElement("div");
      heading.className = "founder-scoreboard__card-heading";
      heading.append(text("h3", bounded(card?.label, 100) || "Metric"));
      const badge = text("span", statusLabel(card), "founder-scoreboard__badge");
      badge.dataset.status = key;
      heading.append(badge);

      const value = text("p", formatValue(card?.current), "founder-scoreboard__value");
      value.dataset.available = card?.current?.available === true ? "true" : "false";
      const comparison = text("p", formatPrevious(card?.previous), "founder-scoreboard__previous");
      const secondary = card?.current?.secondary;
      const secondaryValue = secondary && secondary.value !== null && secondary.value !== undefined
        ? text("p", bounded(secondary.label, 60) + " " + formatValue({ ...secondary, available:true }), "founder-scoreboard__secondary")
        : null;

      const meta = document.createElement("dl");
      meta.className = "founder-scoreboard__meta";
      const source = document.createElement("div");
      source.append(text("dt", "Source"), text("dd", bounded(card?.source?.label, 120) || "Unavailable"));
      const refreshed = document.createElement("div");
      refreshed.append(text("dt", "Last refreshed"), text("dd", dateTime(card?.refreshedAt)));
      meta.append(source, refreshed);

      article.append(heading, value, comparison);
      if (secondaryValue) article.append(secondaryValue);
      article.append(meta);
      const detailValue = friendlyDetail(card || {});
      if (detailValue) article.append(text("p", detailValue, "founder-scoreboard__detail"));
      const href = String(card?.href || "");
      if (/^#[a-z0-9][a-z0-9/?&=_%-]*$/i.test(href) && !["#scoreboard", "#metrics", "#kpis"].includes(href)) {
        const link = text("a", "Open source", "founder-scoreboard__source-link");
        link.href = href;
        link.setAttribute("aria-label", "Open source for " + bounded(card?.label, 100));
        article.append(link);
      }
      return article;
    }
    function renderSummary(view) {
      for (const key of ["live", "manual", "unavailable", "needsAttention"]) {
        const target = node('[data-scoreboard-count="' + key + '"]');
        if (target) target.textContent = Number(view?.summary?.[key] || 0).toLocaleString("en-US");
      }
      const generated = node("[data-scoreboard-generated]");
      if (generated) generated.textContent = "Updated " + dateTime(view?.generatedAt, "time unavailable");
    }
    function renderGroups(view) {
      const target = node("[data-scoreboard-groups]");
      if (!target) return;
      const groups = [];
      let cardCount = 0;
      for (const group of Array.isArray(view?.groups) ? view.groups : []) {
        const cards = Array.isArray(group.cards) ? group.cards : [];
        const section = document.createElement("section");
        section.className = "founder-scoreboard__group";
        section.dataset.scoreboardGroup = bounded(group.key, 60);
        const heading = document.createElement("div");
        heading.className = "founder-scoreboard__group-heading";
        heading.append(text("h2", bounded(group.label, 80) || "Metrics"), text("span", cards.length + (cards.length === 1 ? " measure" : " measures")));
        const grid = document.createElement("div");
        grid.className = "founder-scoreboard__grid";
        grid.append(...cards.map(metricCard));
        cardCount += cards.length;
        section.append(heading, grid);
        groups.push(section);
      }
      target.replaceChildren(...groups);
      metrics.renderedCards = cardCount;
    }
    function populateFinance(view) {
      const form = node("[data-scoreboard-finance-form]");
      if (!form) return;
      const finance = view?.manualFinance || {};
      form.elements.currentCashBalance.value = finance.currentCashBalance ?? "";
      form.elements.monthlyBurn.value = finance.monthlyBurn ?? "";
      const today = String(view?.generatedAt || new Date().toISOString()).slice(0, 10);
      form.elements.asOfDate.value = String(finance.asOfDate || today).slice(0, 10);
      form.elements.asOfDate.max = today;
      form.elements.expectedUpdatedAt.value = finance.updatedAt || "";
      clearFinanceErrors(form);
    }
    function renderView(view, message = "") {
      currentView = view;
      const loading = node("[data-scoreboard-loading]");
      const state = node("[data-scoreboard-state]");
      const content = node("[data-scoreboard-content]");
      if (loading) loading.hidden = true;
      if (state) state.hidden = true;
      if (content) content.hidden = false;
      renderSummary(view);
      populateFinance(view);
      renderGroups(view);
      setRefreshBusy(false);
      setMessage(message, "success");
      root()?.setAttribute("data-loaded", "true");
    }
    function clearFinanceErrors(form) {
      for (const input of form?.querySelectorAll("input:not([type='hidden'])") || []) input.removeAttribute("aria-invalid");
      for (const error of form?.querySelectorAll("[data-finance-error]") || []) error.textContent = "";
    }
    function fieldError(form, name, message) {
      const input = form.elements[name];
      const output = form.querySelector('[data-finance-error="' + name + '"]');
      if (input) input.setAttribute("aria-invalid", "true");
      if (output) output.textContent = message;
      return input;
    }
    function validateFinance(form) {
      clearFinanceErrors(form);
      let first = null;
      for (const name of ["currentCashBalance", "monthlyBurn"]) {
        const input = form.elements[name];
        if (input.value !== "" && (!Number.isFinite(Number(input.value)) || Number(input.value) < 0 || Number(input.value) > 1000000000000)) {
          first ||= fieldError(form, name, "Enter a non-negative amount.");
        }
      }
      const date = form.elements.asOfDate;
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date.value)) first ||= fieldError(form, "asOfDate", "Choose an as-of date.");
      else if (date.max && date.value > date.max) first ||= fieldError(form, "asOfDate", "The as-of date cannot be in the future.");
      if (first) { first.focus(); return false; }
      return true;
    }
    function financeStatus(message, kind = "status") {
      const target = node("[data-scoreboard-finance-status]");
      if (!target) return;
      target.textContent = bounded(message, 220);
      target.dataset.kind = kind;
      target.setAttribute("role", kind === "error" ? "alert" : "status");
    }
    async function saveFinance(event) {
      event.preventDefault();
      const form = event.currentTarget;
      if (saving) { metrics.duplicateClicksBlocked += 1; return; }
      if (!validateFinance(form)) { financeStatus("Check the highlighted field. No changes were made.", "error"); return; }
      const button = form.querySelector("[data-scoreboard-finance-save]");
      const values = {
        currentCashBalance:form.elements.currentCashBalance.value,
        monthlyBurn:form.elements.monthlyBurn.value,
        asOfDate:form.elements.asOfDate.value,
        expectedUpdatedAt:form.elements.expectedUpdatedAt.value
      };
      const scrollTop = window.scrollY;
      saving = true;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Saving…";
      financeStatus("Saving financial inputs…");
      try {
        const response = await fetch(contract.financeEndpoint, {
          method:"POST",
          credentials:"same-origin",
          headers:{ accept:"application/json", "content-type":"application/json", "x-csrf-token":csrf() },
          body:JSON.stringify(values)
        });
        const responseText = await response.text();
        metrics.lastResponseBytes = new TextEncoder().encode(responseText).byteLength;
        const body = JSON.parse(responseText || "{}");
        if (response.status === 401) { sessionEnded = true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return; }
        if (!response.ok || body.ok !== true || !body.scoreboard) throw Object.assign(new Error(body.message || "Financial inputs could not be saved. No changes were made."), { status:response.status });
        metrics.mutations += Number(body.mutations || 0);
        metrics.externalActions += Number(body.externalActions || 0);
        renderView(body.scoreboard, body.message || "Financial inputs saved.");
        requestAnimationFrame(() => window.scrollTo({ top:scrollTop, behavior:"auto" }));
        document.dispatchEvent(new CustomEvent("vnext:scoreboard-updated", { detail:{ updatedAt:body.finance?.updatedAt || body.scoreboard?.manualFinance?.updatedAt || null } }));
      } catch (error) {
        financeStatus(error?.message || "Financial inputs could not be saved. No changes were made.", "error");
      } finally {
        saving = false;
        if (button.isConnected) {
          button.disabled = false;
          button.setAttribute("aria-busy", "false");
          button.textContent = "Save financial inputs";
        }
      }
    }
    async function load({ force = false } = {}) {
      if (!onRoute() || sessionEnded || !ensureScaffold()) return null;
      if (activeRequest) {
        if (!force) return activeRequest.promise;
        activeRequest.controller.abort();
        metrics.staleRequestsAborted += 1;
      }
      const initial = !currentView;
      if (initial) showLoading(); else { setRefreshBusy(true); setMessage("Refreshing Scoreboard…"); }
      const controller = new AbortController();
      const sequence = ++requestSequence;
      metrics.requests += 1;
      const promise = fetch(contract.endpoint, { credentials:"same-origin", headers:{ accept:"application/json" }, signal:controller.signal }).then(async (response) => {
        const responseText = await response.text();
        metrics.lastResponseBytes = new TextEncoder().encode(responseText).byteLength;
        const body = JSON.parse(responseText || "{}");
        if (response.status === 401) { sessionEnded = true; document.dispatchEvent(new CustomEvent("vnext:session-expired")); return null; }
        if (response.status === 403) { if (sequence === requestSequence) renderState("unauthorized", "Scoreboard needs owner access", "Sign in with an account that can view company operating information."); return null; }
        if (!response.ok || body.ok !== true || !body.scoreboard?.available) throw new Error(body.message || "Scoreboard could not load.");
        if (sequence === requestSequence && onRoute()) renderView(body.scoreboard);
        return body.scoreboard;
      }).catch((error) => {
        if (error.name === "AbortError") return null;
        if (sequence === requestSequence && onRoute()) {
          if (currentView) { setRefreshBusy(false); setMessage("Scoreboard could not refresh. Existing values remain unchanged.", "error"); }
          else renderState("error", "Scoreboard could not load", "No values were changed. Try again.", true);
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
      node("[data-scoreboard-refresh]")?.addEventListener("click", () => load({ force:true }));
      node("[data-scoreboard-finance-form]")?.addEventListener("submit", saveFinance);
      node("[data-scoreboard-finance-form]")?.addEventListener("input", (event) => {
        const name = event.target?.name;
        if (!name) return;
        event.target.removeAttribute("aria-invalid");
        const error = node('[data-finance-error="' + name + '"]');
        if (error) error.textContent = "";
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
        activeRequest = null;
        currentView = null;
        return;
      }
      currentView = null;
      activate();
    }
    window.addEventListener("hashchange", routeChanged);
    document.addEventListener("vnext:session-expired", () => {
      sessionEnded = true;
      activeRequest?.controller.abort();
      activeRequest = null;
      currentView = null;
      saving = false;
      if (bootWaitTimer !== null) clearTimeout(bootWaitTimer);
      bootWaitTimer = null;
    });
    const observedApp = app();
    if (observedApp) new MutationObserver(() => {
      if (observerQueued || !onRoute() || sessionEnded || host()?.querySelector("[data-founder-scoreboard]")) return;
      observerQueued = true;
      queueMicrotask(() => { observerQueued = false; activate(); });
    }).observe(observedApp, { childList:true, subtree:true });
    window.__LE_FOUNDER_SCOREBOARD = Object.freeze({ activate, refresh:() => load({ force:true }) });
    activate();
  })();`;
}
