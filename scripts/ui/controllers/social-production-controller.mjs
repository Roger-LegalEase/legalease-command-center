import {
  bindSocialCalendarPage,
  renderSocialCalendarPage,
  renderSocialCalendarPostCard
} from "../pages/social-calendar.mjs";
import { renderSocialConnectionsPage } from "../pages/social-connections.mjs";

function socialProductionControllerClient(renderers) {
  let request = null;
  let pendingSurface = "";
  let bootTimer = null;
  let sequence = 0;
  let observerQueued = false;
  const app = () => document.querySelector("main#app");
  const route = () => window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today");
  const query = () => new URLSearchParams(String(location.hash || "").split("?")[1] || "");
  const effectiveQuery = (resolved) => new URLSearchParams(String(resolved?.safeHash || location.hash || "").split("?")[1] || "");
  const surface = () => {
    const resolved = route();
    if (resolved?.kind !== "page") return "";
    const context = effectiveQuery(resolved);
    if (resolved.canonicalRoute === "queue" && context.get("view") === "calendar") return "calendar";
    if (resolved.canonicalRoute === "settings" && context.get("view") === "social-connections") return "connections";
    return "";
  };
  const status = (title, message, kind = "loading") => `<section class="vnext-social-production-state" data-social-production-state="${kind}" role="${kind === "error" ? "alert" : "status"}"><h1>${title}</h1><p>${message}</p></section>`;
  function renderLoading(kind) {
    const target = app();
    if (!target) return;
    target.innerHTML = `<div data-social-production-surface="${kind}"${kind === "calendar" ? " data-social-page" : ""}>${status(kind === "calendar" ? "Social calendar" : "Social connections", "Loading current authorized details.")}</div>`;
  }
  function renderFailure(kind, sessionExpired = false) {
    const target = app();
    if (!target) return;
    const title = sessionExpired ? "Session expired" : kind === "calendar" ? "Social calendar unavailable" : "Social connections unavailable";
    const message = sessionExpired ? "Sign in again to continue." : "No records were changed and no private connection details were loaded.";
    target.innerHTML = `<div data-social-production-surface="${kind}"${kind === "calendar" ? " data-social-page" : ""}>${status(title, message, sessionExpired ? "session_expired" : "error")}</div>`;
  }
  async function activate() {
    const kind = surface();
    if (!kind || !app()) return;
    if (window.__LE_BOOT && window.__LE_BOOT.ready !== true) {
      if (bootTimer === null) bootTimer = setTimeout(() => { bootTimer = null; activate(); }, 20);
      return;
    }
    if (request && pendingSurface === kind) return;
    const current = ++sequence;
    if (request) request.abort();
    request = new AbortController();
    pendingSurface = kind;
    renderLoading(kind);
    try {
      const endpoint = kind === "calendar" ? "/api/ui/social/calendar" : "/api/ui/social/connections";
      const response = await fetch(endpoint, { credentials:"same-origin", headers:{ accept:"application/json" }, signal:request.signal });
      const payload = await response.json();
      if (current !== sequence || kind !== surface()) return;
      if (response.status === 401) { renderFailure(kind, true); return; }
      if (!response.ok || payload.ok !== true) { renderFailure(kind); return; }
      const target = app();
      if (!target) return;
      target.innerHTML = kind === "calendar"
        ? `<div data-social-production-surface="calendar" data-social-page>${renderers.renderCalendar(payload)}</div>`
        : `<div data-social-production-surface="connections">${renderers.renderConnections(payload)}</div>`;
      if (kind === "calendar") renderers.bindCalendar();
    } catch (error) {
      if (error?.name !== "AbortError" && current === sequence && kind === surface()) renderFailure(kind);
    } finally {
      if (current === sequence) { request = null; pendingSurface = ""; }
    }
  }
  function openSchedule(postId) {
    const exact = String(postId || "");
    if (!exact || exact.length > 240 || /[\u0000-\u001f\u007f<>"'`\\]/u.test(exact)) return;
    location.hash = `social/post/${encodeURIComponent(exact)}?panel=schedule`;
  }
  function revealSchedule() {
    if (route()?.objectType !== "Post" || query().get("panel") !== "schedule") return;
    const details = app()?.querySelector(".vnext-schedule-editor");
    if (!details) return;
    details.open = true;
    const control = details.querySelector("[data-schedule-at]");
    if (control && document.activeElement !== control) control.focus({ preventScroll:true });
  }
  document.addEventListener("vnext:social-move-date", (event) => openSchedule(event.detail?.postId));
  window.addEventListener("hashchange", () => { if (surface()) activate(); else { if (request) request.abort(); request = null; pendingSurface = ""; sequence += 1; setTimeout(revealSchedule, 0); } });
  const target = app();
  if (target) new MutationObserver(() => {
    if (observerQueued) return;
    observerQueued = true;
    queueMicrotask(() => { observerQueued = false; if (surface() && !app()?.querySelector("[data-social-production-surface]")) activate(); else revealSchedule(); });
  }).observe(target, { childList:true, subtree:true });
  window.__LE_SOCIAL_PRODUCTION = Object.freeze({ activate });
  if (surface()) activate(); else revealSchedule();
}

export function socialProductionControllerBrowserSource() {
  const escapeSource = `(value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character])`;
  return `(() => {
    "use strict";
    const esc = ${escapeSource};
    const renderSocialCalendarPostCard = ${renderSocialCalendarPostCard.toString()};
    const renderCalendar = ${renderSocialCalendarPage.toString()};
    const renderConnections = ${renderSocialConnectionsPage.toString()};
    const bindCalendar = ${bindSocialCalendarPage.toString()};
    (${socialProductionControllerClient.toString()})({ renderCalendar, renderConnections, bindCalendar });
  })();`;
}
