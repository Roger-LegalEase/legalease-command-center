import { renderShellLoadingState, renderShellState } from "./shell-states.mjs";

function serialized(value) {
  return JSON.stringify(String(value || "")).replaceAll("<", "\\u003c");
}

export function shellResilienceBrowserSource() {
  const routeLoading = serialized(renderShellLoadingState({
    kind:"loading",
    scope:"route",
    title:"Loading this page"
  }));
  const moduleLoading = serialized(renderShellLoadingState({
    kind:"loading",
    scope:"module",
    title:"Loading this section"
  }));
  const pageError = serialized(renderShellState({
    kind:"error",
    scope:"route",
    title:"This page could not load",
    explanation:"The page ran into a problem while loading. No records were changed.",
    retryable:true,
    retryLabel:"Try again"
  }));
  const moduleError = serialized(renderShellState({
    kind:"error",
    scope:"module",
    title:"This section could not load",
    explanation:"This part of the page ran into a problem. No records were changed.",
    retryable:true,
    retryLabel:"Try again"
  }));
  const unauthorized = serialized(renderShellState({
    kind:"unauthorized",
    scope:"route",
    title:"You don’t have access to this page",
    explanation:"Your account needs __PERMISSION__ to open this page. No data was changed.",
    permissionLabel:"__PERMISSION__"
  }));
  const unavailable = serialized(`<section id="item" class="page-section active command-page section-page lee-bubble-safe-space" data-vnext-shell-state="error" data-state-scope="route">
    <div class="panel hero-panel"><div>
      <div class="eyebrow">Command Center record</div>
      <h1 class="big-title">Record not available</h1>
      <p class="muted">Opened directly from a queue card or Today. Nothing on this page sends or publishes.</p>
    </div><div class="card-actions"><button type="button" data-action="shell-go-back">Back</button><a class="button-link" href="#today">Go to Today</a></div></div>
    <section class="panel"><p class="muted">This record is not in the loaded data. It may have been removed, or it lives in a collection this view cannot read.</p></section>
  </section>`);
  const sessionExpired = serialized(renderShellState({
    kind:"session_expired",
    scope:"boot",
    title:"Your session ended",
    explanation:"Sign in again to continue. No records were changed."
  }));
  const recovery = serialized(renderShellState({
    kind:"recovery",
    scope:"boot",
    title:"Recovery Mode",
    explanation:"The full Command Center could not load. Use the safe actions below to try again or sign out.",
    unchangedMessage:"Publishing is off.",
    retryable:true,
    retryLabel:"Try full app again"
  }));

  return `(() => {
    "use strict";
    const templates = Object.freeze({
      routeLoading:${routeLoading},
      moduleLoading:${moduleLoading},
      pageError:${pageError},
      moduleError:${moduleError},
      unauthorized:${unauthorized},
      unavailable:${unavailable},
      sessionExpired:${sessionExpired},
      recovery:${recovery}
    });
    const metrics = window.__LE_SHELL_RESILIENCE_METRICS = {
      skeletonDisplayedAt:performance.now(),
      contentDisplayedAt:null,
      loadingToContentMs:null,
      fullStateRequests:0,
      routeAccessRequests:0,
      retryRequests:0,
      duplicateRetries:0,
      moduleRecoveryMs:null,
      searchRequestsWhileClosed:0,
      createRequestsWhileClosed:0,
      renderFailures:0
    };
    const controller = {
      authorization:new Map(),
      pendingAuthorization:null,
      pendingRetry:false,
      failedModule:"",
      failedRenderer:null,
      failureStartedAt:0,
      recoveryActive:false,
      sessionExpired:false,
      nativeRender:typeof window.render === "function" ? window.render : null,
      nativeSafeRenderModule:typeof window.safeRenderModule === "function" ? window.safeRenderModule : null,
      nativeFetch:window.fetch.bind(window)
    };
    const safeText = (value = "") => String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[character]));
    const app = () => document.querySelector("main#app");
    const currentTarget = () => String(location.hash || "#today");
    const currentResolution = () => window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(currentTarget()) || { kind:"page", destination:"Today" };

    function closeAuthenticatedLayers() {
      document.dispatchEvent(new CustomEvent("vnext:request-close-global-search"));
      document.dispatchEvent(new CustomEvent("vnext:request-close-global-create"));
      document.dispatchEvent(new CustomEvent("vnext:close-shell-popovers"));
      document.dispatchEvent(new CustomEvent("vnext:close-navigation"));
      document.querySelectorAll('[role="dialog"], .vnext-menu-panel').forEach((layer) => {
        if (!layer.closest("main#app")) layer.hidden = true;
      });
      document.querySelectorAll("[inert]").forEach((node) => {
        if (!node.matches("[data-shell-drawer]")) node.removeAttribute("inert");
      });
      document.body.classList.remove("vnext-navigation-open", "vnext-modal-open");
      document.documentElement.style.removeProperty("overflow");
      document.body.style.removeProperty("overflow");
      try {
        if (typeof leeBubbleOpen !== "undefined") leeBubbleOpen = false;
        document.querySelectorAll(".lee-bubble-panel, .lee-panel").forEach((node) => { node.hidden = true; });
      } catch {}
    }

    function setStateDependentControlsDisabled(disabled) {
      [
        document.querySelector(".vnext-create-trigger"),
        document.querySelector("#vnext-global-search-trigger"),
        document.querySelector('[data-shell-action="open-lee"]')
      ].filter(Boolean).forEach((control) => {
        control.disabled = disabled;
        control.setAttribute("aria-disabled", disabled ? "true" : "false");
        control.title = disabled ? "Available after Command Center finishes loading." : "";
      });
    }

    function renderTemplate(template, options = {}) {
      const target = app();
      if (!target) return;
      target.innerHTML = template;
      target.dataset.vnextResilienceState = options.kind || "error";
      if (options.module) target.querySelector("[data-vnext-shell-state]")?.setAttribute("data-vnext-failed-module", options.module);
      target.querySelector("h1, h2, [role='status'], [role='alert']")?.setAttribute("tabindex", "-1");
      if (options.focus !== false) setTimeout(() => target.querySelector("h1, h2, [role='status'], [role='alert']")?.focus(), 0);
    }

    function founderPermissionTemplate(label = "additional access") {
      const safe = safeText(label || "additional access");
      return templates.unauthorized.replaceAll("__PERMISSION__", safe);
    }

    function showSessionExpired() {
      if (controller.sessionExpired) return;
      controller.sessionExpired = true;
      controller.recoveryActive = false;
      controller.authorization.clear();
      closeAuthenticatedLayers();
      setStateDependentControlsDisabled(true);
      try {
        if (typeof state !== "undefined") state = null;
      } catch {}
      document.querySelectorAll("input, textarea").forEach((control) => { control.value = ""; });
      renderTemplate(templates.sessionExpired, { kind:"session_expired" });
      document.dispatchEvent(new CustomEvent("vnext:session-expired"));
    }

    function showRecovery() {
      controller.recoveryActive = true;
      controller.sessionExpired = false;
      closeAuthenticatedLayers();
      setStateDependentControlsDisabled(true);
      try {
        if (typeof safeBootActive !== "undefined") safeBootActive = true;
        if (typeof fullStateLoaded !== "undefined") fullStateLoaded = false;
      } catch {}
      renderTemplate(templates.recovery, { kind:"recovery" });
      document.dispatchEvent(new CustomEvent("vnext:recovery-mode"));
    }

    function showPageError() {
      metrics.renderFailures += 1;
      controller.failureStartedAt = performance.now();
      renderTemplate(templates.pageError, { kind:"error" });
    }

    function showModuleError(moduleName, renderer) {
      metrics.renderFailures += 1;
      controller.failedModule = String(moduleName || "page");
      controller.failedRenderer = typeof renderer === "function" ? renderer : null;
      controller.failureStartedAt = performance.now();
      return templates.moduleError.replace(
        'data-vnext-shell-state="error"',
        'data-vnext-shell-state="error" data-vnext-failed-module="' + safeText(controller.failedModule) + '"'
      );
    }

    function routeLoadingLabel() {
      const destination = currentResolution().destination || "this page";
      return templates.routeLoading.replaceAll("Loading this page", "Loading " + safeText(destination));
    }

    async function requestRouteAccess({ force = false } = {}) {
      const target = currentTarget();
      if (!force && controller.authorization.has(target)) return controller.authorization.get(target);
      if (controller.pendingAuthorization?.target === target) return controller.pendingAuthorization.promise;
      metrics.routeAccessRequests += 1;
      const promise = controller.nativeFetch("/api/ui/route-access?target=" + encodeURIComponent(target), {
        credentials:"same-origin",
        headers:{ accept:"application/json" }
      }).then(async (response) => {
        if (response.status === 401) {
          showSessionExpired();
          return { ok:false, allowed:false, outcome:"session_expired" };
        }
        if (!response.ok) throw Object.assign(new Error("route access unavailable"), { status:response.status });
        const payload = await response.json();
        const compact = {
          ok:payload?.ok === true,
          allowed:payload?.allowed === true,
          outcome:String(payload?.outcome || ""),
          permissionLabel:String(payload?.permissionLabel || "")
        };
        if (compact.outcome === "session_expired") {
          showSessionExpired();
          return compact;
        }
        controller.authorization.set(target, compact);
        return compact;
      }).finally(() => {
        if (controller.pendingAuthorization?.target === target) controller.pendingAuthorization = null;
      });
      controller.pendingAuthorization = { target, promise };
      return promise;
    }

    async function guardedRender(options = {}) {
      if (!controller.nativeRender || controller.sessionExpired) return;
      const resolution = currentResolution();
      window.__LE_VNEXT_ACTIVE_ROUTE = resolution;
      if (resolution.kind === "unsafe" || resolution.kind === "unknown") {
        try { controller.nativeRender(); } catch { showPageError(); }
        return;
      }
      if (resolution.canonicalRoute === "safe-mode") {
        showRecovery();
        return;
      }
      const target = currentTarget();
      const cached = !options.forceAuthorization && controller.authorization.get(target);
      if (!cached) renderTemplate(routeLoadingLabel(), { kind:"loading", focus:false });
      try {
        const access = cached || await requestRouteAccess({ force:options.forceAuthorization === true });
        if (currentTarget() !== target || controller.sessionExpired) return;
        if (!access.allowed) {
          if (access.outcome === "unavailable") renderTemplate(templates.unavailable, { kind:"error" });
          else renderTemplate(founderPermissionTemplate(access.permissionLabel), { kind:"unauthorized" });
          return;
        }
        controller.recoveryActive = false;
        setStateDependentControlsDisabled(false);
        controller.nativeRender();
        delete app()?.dataset.vnextResilienceState;
        if (metrics.contentDisplayedAt === null) {
          metrics.contentDisplayedAt = performance.now();
          metrics.loadingToContentMs = Math.round(metrics.contentDisplayedAt - metrics.skeletonDisplayedAt);
        }
      } catch {
        showPageError();
      }
    }

    function resilientSafeRenderModule(moduleName = "module", renderer = () => "") {
      try {
        if (moduleName === "decisions" && typeof companyQueueLoading !== "undefined" && companyQueueLoading) {
          return templates.moduleLoading;
        }
        if (moduleName === "decisions" && typeof companyQueue !== "undefined" && companyQueue?.error) {
          return showModuleError(moduleName, renderer);
        }
        return renderer();
      } catch {
        return showModuleError(moduleName, renderer);
      }
    }

    async function retryFailedState(button) {
      if (controller.pendingRetry) {
        metrics.duplicateRetries += 1;
        return;
      }
      controller.pendingRetry = true;
      metrics.retryRequests += 1;
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        const label = button.querySelector("span:last-child");
        if (label) label.textContent = "Working";
      }
      const routeBeforeRetry = currentTarget();
      try {
        const access = await requestRouteAccess({ force:true });
        if (!access.allowed) {
          if (access.outcome === "unavailable") renderTemplate(templates.unavailable, { kind:"error" });
          else renderTemplate(founderPermissionTemplate(access.permissionLabel), { kind:"unauthorized" });
          return;
        }
        if (controller.failedModule === "decisions" && typeof loadDecisionsQueue === "function") {
          companyQueue = null;
          await loadDecisionsQueue();
        } else {
          await guardedRender({ forceAuthorization:false });
        }
        if (currentTarget() !== routeBeforeRetry) history.replaceState(null, "", routeBeforeRetry);
        if (!app()?.querySelector("[data-vnext-shell-state='error']")) {
          metrics.moduleRecoveryMs = Math.round(performance.now() - controller.failureStartedAt);
          controller.failedModule = "";
          controller.failedRenderer = null;
          setTimeout(() => app()?.querySelector("h1, h2")?.focus(), 0);
        }
      } catch {
        if (controller.failedModule) renderTemplate(showModuleError(controller.failedModule, controller.failedRenderer), { kind:"error", module:controller.failedModule });
        else showPageError();
      } finally {
        controller.pendingRetry = false;
      }
    }

    async function retryRecovery(button) {
      if (controller.pendingRetry) {
        metrics.duplicateRetries += 1;
        return;
      }
      controller.pendingRetry = true;
      metrics.retryRequests += 1;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.querySelector("span:last-child").textContent = "Working";
      try {
        const recovered = typeof loadFullStateInBackground === "function"
          ? await loadFullStateInBackground({ forceRender:false })
          : false;
        if (!recovered) {
          showRecovery();
          return;
        }
        controller.authorization.clear();
        controller.recoveryActive = false;
        setStateDependentControlsDisabled(false);
        await guardedRender({ forceAuthorization:true });
      } catch {
        showRecovery();
      } finally {
        controller.pendingRetry = false;
      }
    }

    window.fetch = async (...args) => {
      const request = args[0];
      const rawUrl = typeof request === "string" ? request : request?.url || "";
      let parsed;
      try { parsed = new URL(rawUrl, location.origin); } catch { parsed = null; }
      if (parsed?.origin === location.origin) {
        if (parsed.pathname === "/api/state") metrics.fullStateRequests += 1;
        if (parsed.pathname === "/api/ui/search" && document.querySelector("[data-global-search-dialog]")?.hidden !== false) {
          metrics.searchRequestsWhileClosed += 1;
        }
        if (parsed.pathname.startsWith("/api/ui/create/") && document.querySelector("[data-global-create-workspace]")?.hidden !== false) {
          metrics.createRequestsWhileClosed += 1;
        }
      }
      const response = await controller.nativeFetch(...args);
      if (parsed?.origin === location.origin && response.status === 401 && !["/api/auth/login", "/api/auth/logout"].includes(parsed.pathname)) {
        showSessionExpired();
      }
      return response;
    };

    window.__LE_FAIL_BOOT = () => showPageError();
    if (typeof window.safeRenderModule === "function") window.safeRenderModule = resilientSafeRenderModule;
    try { if (typeof safeRenderModule === "function") safeRenderModule = resilientSafeRenderModule; } catch {}
    if (typeof window.render === "function") window.render = guardedRender;
    try { if (typeof render === "function") render = guardedRender; } catch {}
    if (typeof window.renderSafeBootShell === "function") window.renderSafeBootShell = showRecovery;
    try { if (typeof renderSafeBootShell === "function") renderSafeBootShell = showRecovery; } catch {}
    if (typeof window.showSafeBootShell === "function") window.showSafeBootShell = showRecovery;
    try { if (typeof showSafeBootShell === "function") showSafeBootShell = showRecovery; } catch {}
    const authFailureHandler = (error = {}) => {
      if (Number(error?.status) !== 401) return false;
      showSessionExpired();
      return true;
    };
    if (typeof window.handleStateFetchAuthFailure === "function") window.handleStateFetchAuthFailure = authFailureHandler;
    try { if (typeof handleStateFetchAuthFailure === "function") handleStateFetchAuthFailure = authFailureHandler; } catch {}

    window.addEventListener("error", (event) => {
      const target = event.target;
      const tag = String(target?.tagName || "").toLowerCase();
      if (target && target !== window && ["img", "link", "script", "video", "source"].includes(tag)) return;
      showPageError();
    }, true);
    window.addEventListener("unhandledrejection", (event) => {
      showPageError();
    }, true);

    document.addEventListener("click", (event) => {
      const action = event.target.closest?.("[data-action]")?.dataset.action;
      if (action === "shell-retry") {
        event.preventDefault();
        if (controller.recoveryActive) retryRecovery(event.target.closest("button"));
        else retryFailedState(event.target.closest("button"));
      }
      if (action === "shell-go-back") {
        event.preventDefault();
        history.length > 1 ? history.back() : (location.hash = "#today");
      }
      if (action === "shell-sign-in") {
        event.preventDefault();
        if (typeof lockCommandCenter === "function") lockCommandCenter();
        else location.href = "/";
      }
      if (action === "shell-sign-out") {
        event.preventDefault();
        if (typeof lockCommandCenter === "function") lockCommandCenter();
        else location.href = "/";
      }
    });
    window.addEventListener("hashchange", () => {
      controller.authorization.delete(currentTarget());
      if (!controller.sessionExpired) guardedRender();
    });

    window.__LE_SHELL_RESILIENCE = Object.freeze({
      showRecovery,
      showSessionExpired,
      showPageError,
      retry:() => retryFailedState(null),
      clearAuthorization:() => controller.authorization.clear()
    });

    if (currentResolution().canonicalRoute === "safe-mode") showRecovery();
  })();`;
}
