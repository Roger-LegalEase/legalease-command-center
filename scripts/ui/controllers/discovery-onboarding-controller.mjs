import { DISCOVERY_ONBOARDING_ENDPOINT } from "../../discovery-onboarding-service.mjs";

export function discoveryOnboardingBrowserSource() {
  const endpoint = JSON.stringify(DISCOVERY_ONBOARDING_ENDPOINT);
  return `(() => {
    "use strict";
    const endpoint = ${endpoint};
    let pending = false;
    let opener = null;
    let analyticsActive = false;
    const root = () => document.querySelector("[data-discovery-onboarding]");
    const card = () => root()?.querySelector('[role="dialog"]');
    const status = () => root()?.querySelector("[data-onboarding-status]");
    const requestId = () => "discovery-onboarding-" + crypto.randomUUID().replaceAll("-", "");
    const csrf = () => window.__LE_CSRF_TOKEN?.() || "";
    const analyticsReference = Object.freeze({ workflowId:"first-run-onboarding", destinationId:"today" });
    function analyticsEvent(type, detail = analyticsReference) { document.dispatchEvent(new CustomEvent(type, { detail })); }
    function startAnalytics() { if (!analyticsActive) { analyticsActive = true; analyticsEvent("vnext:workflow-started"); } }
    function setBusy(value) { pending = value; root()?.querySelectorAll("button").forEach((button) => { button.disabled = value; button.setAttribute("aria-busy", value ? "true" : "false"); }); }
    function announce(message) { if (status()) status().textContent = message; }
    function close() { const container = root(); if (container) container.hidden = true; if (opener?.isConnected) opener.focus(); }
    function safeRoute(action) {
      const resolved = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(action?.href || "");
      return resolved?.kind === "page" && resolved.destination === action.expectedDestination ? resolved.safeHash : "";
    }
    function openAction(action, trigger) {
      if (!action) return close();
      close();
      if (action.kind === "global-create") return window.__LE_GLOBAL_CREATE?.openWorkflow?.(action.workflowId, { returnTarget:trigger });
      const href = safeRoute(action);
      if (href) location.hash = href.slice(1);
      else announce("That workflow is not available yet. Return later from your profile menu.");
    }
    async function save(payload, trigger) {
      if (pending) return;
      setBusy(true); announce("Saving your choice…");
      try {
        const response = await fetch(endpoint, { method:"POST", credentials:"same-origin", headers:{ "content-type":"application/json", "x-csrf-token":csrf() }, body:JSON.stringify({ ...payload, requestId:requestId(), expectedVersion:Number(root()?.dataset.preferenceVersion || 0) }) });
        if (response.status === 401) { announce("Your session expired. Sign in again; no choice was saved."); return; }
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true) throw new Error(result.message || "Your choice could not be saved. Nothing changed.");
        root().dataset.preferenceVersion = String(result.preference?.version || 0);
        if (payload.intent === "defer") { if (analyticsActive) analyticsEvent("vnext:workflow-abandoned", { ...analyticsReference, reasonCode:"navigation" }); analyticsActive = false; announce("Onboarding skipped for now."); close(); return; }
        if (analyticsActive) analyticsEvent("vnext:workflow-completed");
        analyticsActive = false;
        openAction(result.action, trigger);
      } catch (error) { if (analyticsActive) analyticsEvent("vnext:action-failed", { ...analyticsReference, actionId:"submit", reasonCode:"write-unavailable" }); announce(error.message || "Your choice could not be saved. Nothing changed."); }
      finally { setBusy(false); }
    }
    function bind() {
      const container = root();
      if (!container || container.dataset.bound === "true") return;
      container.dataset.bound = "true";
      container.querySelectorAll("[data-onboarding-choice]").forEach((button) => button.addEventListener("click", () => save({ intent:"select", choiceId:button.dataset.onboardingChoice }, button)));
      container.querySelector("[data-onboarding-defer]")?.addEventListener("click", (event) => save({ intent:"defer" }, event.currentTarget));
      container.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;
        const controls = [...container.querySelectorAll("button:not([disabled])")];
        if (!controls.length) return;
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      opener = document.activeElement;
      if (!container.hidden) startAnalytics();
      card()?.focus();
    }
    document.addEventListener("vnext:open-onboarding", (event) => { opener = event.detail?.returnTarget || document.activeElement; if (root()) { root().hidden = false; bind(); startAnalytics(); card()?.focus(); } });
    document.addEventListener("vnext:session-expired", () => { announce("Your session expired. Sign in again; no choice was saved."); setBusy(true); });
    bind();
  })();`;
}
