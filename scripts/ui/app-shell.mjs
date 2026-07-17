import { APPROVED_WHITE_LOGO_PATH, TOKEN_STYLESHEET_PATH } from "./brand-contract.mjs";
import { escapeAttribute, escapeHtml } from "./html.mjs";
import { renderButton, renderPageHeader } from "./primitives.mjs";
import { routeCompatibilityBrowserSource } from "./route-compatibility.mjs";
import {
  GLOBAL_CREATE_MENU_ID,
  globalCreateBrowserSource,
  renderGlobalCreateMenu,
  renderGlobalCreateWorkspace
} from "./global-create.mjs";
import {
  globalSearchBrowserSource,
  renderGlobalSearchDialog,
  renderGlobalSearchTrigger
} from "./global-search.mjs";
import { shellResilienceBrowserSource } from "./shell-resilience.mjs";
import {
  INBOX_PAGE_STYLESHEET_PATH,
  inboxPageBrowserSource
} from "./pages/inbox-page.mjs";
import { INITIAL_VNEXT_LOADING_HTML } from "./shell-states.mjs";
import {
  CREATE_MENU_OPTIONS,
  PRIMARY_SHELL_DESTINATIONS,
  SECONDARY_SHELL_CONTROLS,
  TOP_BAR_CONTROLS
} from "./app-shell-navigation.mjs";

export const DESKTOP_SHELL_STYLESHEET_PATH = "assets/ui/desktop-shell.css";
export const RESPONSIVE_SHELL_BREAKPOINT_PX = 860;
export const RESPONSIVE_NAVIGATION_DRAWER_ID = "vnext-navigation-drawer";

const assetUrl = (path) => `/${String(path || "").replace(/^\/+/, "")}`;
const routeHref = (route) => `#${String(route || "today").replace(/^#/, "")}`;

const routeRecoveryHtml = `<section class="vnext-route-recovery" data-vnext-route-recovery aria-label="Route recovery">
  ${renderPageHeader({
    title:"Page not found",
    description:"The link may be old or incomplete. No data was changed."
  })}
  <div class="vnext-route-recovery-actions">
    ${renderButton({ label:"Go to Today", variant:"link", intent:"primary", link:{ kind:"page", target:"#today" } })}
    ${renderButton({ label:"Search", variant:"link", intent:"secondary", link:{ kind:"page", target:"#search" } })}
  </div>
</section>`;

function primaryNavigationHtml() {
  return PRIMARY_SHELL_DESTINATIONS.map((item, index) => `
        <a class="vnext-nav-link${index === 0 ? " is-selected" : ""}" href="${escapeAttribute(routeHref(item.route))}" data-shell-destination="${escapeAttribute(item.label)}"${index === 0 ? ' aria-current="page"' : ""}>
          <span class="vnext-nav-indicator" aria-hidden="true"></span>
          <span>${escapeHtml(item.label)}</span>
        </a>`).join("");
}

function secondaryNavigationHtml() {
  return SECONDARY_SHELL_CONTROLS.map((item) => {
    if (item.kind === "action") {
      return `
        <button class="vnext-nav-link vnext-nav-button" type="button" data-shell-action="${escapeAttribute(item.action)}" data-shell-destination="${escapeAttribute(item.label)}">
          <span class="vnext-nav-indicator" aria-hidden="true"></span>
          <span>${escapeHtml(item.label)}</span>
        </button>`;
    }
    const count = item.id === "inbox" ? '<span class="vnext-inbox-count" data-shell-inbox-count hidden></span>' : "";
    return `
        <a class="vnext-nav-link" href="${escapeAttribute(routeHref(item.route))}" data-shell-destination="${escapeAttribute(item.label)}">
          <span class="vnext-nav-indicator" aria-hidden="true"></span>
          <span>${escapeHtml(item.label)}</span>${count}
        </a>`;
  }).join("");
}

function createMenuHtml() {
  return renderGlobalCreateMenu();
}

export function renderVNextDesktopShellChrome() {
  const help = TOP_BAR_CONTROLS.find((item) => item.id === "help");
  return Object.freeze({
    start:`<div class="vnext-shell" data-vnext-shell="desktop">
    <button class="vnext-drawer-overlay" type="button" data-shell-action="close-navigation" aria-label="Close navigation" tabindex="-1" hidden></button>
    <aside class="vnext-sidebar" aria-label="Command Center sidebar" id="${RESPONSIVE_NAVIGATION_DRAWER_ID}" data-shell-drawer>
      <a class="vnext-logo-link" href="#today" aria-label="LegalEase Command Center home">
        <img class="vnext-shell-logo" src="${escapeAttribute(assetUrl(APPROVED_WHITE_LOGO_PATH))}" width="1920" height="1080" alt="LegalEase">
      </a>
      <button class="vnext-drawer-close" type="button" data-shell-action="close-navigation" aria-label="Close navigation"><span aria-hidden="true">×</span></button>
      <nav class="vnext-primary-navigation" aria-label="Primary destinations">${primaryNavigationHtml()}
      </nav>
      <div class="vnext-sidebar-divider" aria-hidden="true"></div>
      <nav class="vnext-secondary-navigation" aria-label="Command Center utilities">${secondaryNavigationHtml()}
      </nav>
    </aside>
    <div class="vnext-shell-stage">
      <header class="vnext-topbar" aria-label="Application controls">
        <div class="vnext-mobile-leading">
          <button class="vnext-navigation-trigger" type="button" data-shell-action="open-navigation" aria-label="Open navigation" aria-expanded="false" aria-controls="${RESPONSIVE_NAVIGATION_DRAWER_ID}">
            <span class="vnext-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
          </button>
          <strong class="vnext-current-context" data-shell-current-context aria-live="polite">Today</strong>
        </div>
        ${renderGlobalSearchTrigger()}
        <div class="vnext-topbar-actions">
          <div class="vnext-menu">
            <button class="vnext-create-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="${GLOBAL_CREATE_MENU_ID}">Create</button>
            <div class="vnext-menu-panel vnext-create-menu" id="${GLOBAL_CREATE_MENU_ID}" role="menu" aria-label="Create" hidden>${createMenuHtml()}
            </div>
          </div>
          <a class="vnext-topbar-link" href="${escapeAttribute(routeHref(help.route))}" aria-label="${escapeAttribute(help.label)}"><span class="vnext-topbar-icon" aria-hidden="true">?</span><span class="vnext-topbar-label">${escapeHtml(help.label)}</span></a>
          <div class="vnext-menu">
            <button class="vnext-profile-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="vnext-profile-menu"><span class="vnext-topbar-icon" aria-hidden="true">●</span><span class="vnext-topbar-label">Profile</span></button>
            <div class="vnext-menu-panel vnext-profile-menu" id="vnext-profile-menu" role="menu" aria-label="Profile" hidden>
              <a role="menuitem" href="#settings">Settings</a>
              <button role="menuitem" type="button" data-shell-action="sign-out">Sign out</button>
            </div>
          </div>
        </div>
      </header>
      <div class="vnext-routed-content">`,
    end:`</div>
      ${renderGlobalCreateWorkspace()}
      ${renderGlobalSearchDialog()}
    </div>
  </div>`
  });
}

function shellClientScript() {
  const recovery = JSON.stringify(routeRecoveryHtml).replaceAll("<", "\\u003c");
  return `<script>
  (() => {
    "use strict";
    const routeRecoveryHtml = ${recovery};
    const menuPairs = [
      [document.querySelector(".vnext-profile-trigger"), document.querySelector("#vnext-profile-menu")]
    ].filter((pair) => pair[0] && pair[1]);
    const drawer = document.querySelector("[data-shell-drawer]");
    const drawerTrigger = document.querySelector(".vnext-navigation-trigger");
    const drawerClose = document.querySelector(".vnext-drawer-close");
    const drawerOverlay = document.querySelector(".vnext-drawer-overlay");
    const createTrigger = document.querySelector(".vnext-create-trigger");
    const drawerBackgroundTargets = [
      document.querySelector(".vnext-mobile-leading"),
      document.querySelector(".vnext-routed-content"),
      ...[...document.querySelectorAll(".vnext-topbar-actions > *")].filter((control) => !control.contains(createTrigger))
    ].filter(Boolean);
    const navigationMedia = window.matchMedia("(max-width: ${RESPONSIVE_SHELL_BREAKPOINT_PX}px)");
    const drawerFocusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function currentRouteResolution() {
      const path = String(location.pathname || "/").replace(/^\\/+|\\/+$/g, "");
      const requested = String(location.hash || (path === "sources/import-social-calendar" ? "#sources" : "#cockpit"));
      const active = window.__LE_VNEXT_ACTIVE_ROUTE;
      if (active && (active.kind === "unknown" || active.kind === "unsafe" || active.safeHash === location.hash)) return active;
      return window.__LE_VNEXT_ROUTE_COMPATIBILITY.resolve(requested);
    }

    let inboxBadgeCount = null;
    let pendingInboxBadge = null;
    const inboxBadgeMetrics = { requests:0, duplicateRequests:0, lastResponseMs:0, lastResponseBytes:0 };
    window.__LE_INBOX_BADGE_METRICS = inboxBadgeMetrics;
    function setInboxCount(value) {
      const count = Number(value);
      inboxBadgeCount = Number.isFinite(count) ? Math.max(0, count) : null;
      const badge = document.querySelector("[data-shell-inbox-count]");
      if (!badge) return;
      badge.hidden = !(Number.isFinite(inboxBadgeCount) && inboxBadgeCount > 0);
      badge.textContent = Number.isFinite(inboxBadgeCount) && inboxBadgeCount > 0 ? String(inboxBadgeCount) : "";
      badge.setAttribute("aria-label", Number.isFinite(inboxBadgeCount) && inboxBadgeCount > 0 ? String(inboxBadgeCount) + " items need attention" : "");
    }
    function clearInboxCount() {
      setInboxCount(null);
    }
    async function refreshInboxCount({ force = false } = {}) {
      const resolution = currentRouteResolution();
      if (resolution.kind === "page" && resolution.canonicalRoute === "inbox") return;
      if (pendingInboxBadge) {
        inboxBadgeMetrics.duplicateRequests += 1;
        return pendingInboxBadge;
      }
      if (!force && inboxBadgeCount !== null) return inboxBadgeCount;
      inboxBadgeMetrics.requests += 1;
      const startedAt = performance.now();
      pendingInboxBadge = fetch("/api/ui/inbox?group=needs-me&limit=1", {
        method:"GET",
        credentials:"same-origin",
        headers:{ accept:"application/json" }
      }).then(async (response) => {
        const text = await response.text();
        inboxBadgeMetrics.lastResponseBytes = new TextEncoder().encode(text).byteLength;
        inboxBadgeMetrics.lastResponseMs = Math.round((performance.now() - startedAt) * 10) / 10;
        if (!response.ok) {
          clearInboxCount();
          return null;
        }
        const payload = JSON.parse(text || "{}");
        if (payload.ok !== true) {
          clearInboxCount();
          return null;
        }
        setInboxCount(payload.counts?.needsMe);
        return inboxBadgeCount;
      }).catch(() => {
        clearInboxCount();
        return null;
      }).finally(() => { pendingInboxBadge = null; });
      return pendingInboxBadge;
    }
    window.__LE_INBOX_BADGE = Object.freeze({
      clear:clearInboxCount,
      set:setInboxCount,
      refresh:() => refreshInboxCount({ force:true })
    });

    function normalizeNestedMainRegions() {
      const app = document.querySelector("main#app");
      if (!app) return;
      app.querySelectorAll("main").forEach((nested) => nested.setAttribute("role", "presentation"));
    }

    function syncRouteRecovery(resolution) {
      const app = document.querySelector("main#app");
      if (!app) return;
      const needsRecovery = resolution.kind === "unknown" || resolution.kind === "unsafe";
      if (needsRecovery && !app.querySelector("[data-vnext-route-recovery]")) {
        app.innerHTML = routeRecoveryHtml;
        app.dataset.vnextRouteState = resolution.kind;
      } else if (!needsRecovery) {
        delete app.dataset.vnextRouteState;
      }
    }

    function syncShell() {
      normalizeNestedMainRegions();
      const resolution = currentRouteResolution();
      const destination = resolution.destination || "Today";
      document.body.dataset.shellDestination = destination;
      const currentContext = document.querySelector("[data-shell-current-context]");
      if (currentContext) currentContext.textContent = destination;
      document.querySelectorAll("[data-shell-destination]").forEach((control) => {
        const selected = control.dataset.shellDestination === destination;
        control.classList.toggle("is-selected", selected);
        if (selected) control.setAttribute("aria-current", "page");
        else control.removeAttribute("aria-current");
      });
      syncRouteRecovery(resolution);
    }

    function closeMenu(trigger, menu, returnFocus = false) {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (returnFocus) trigger.focus();
    }

    function closeAllMenus(returnFocus = false) {
      menuPairs.forEach(([trigger, menu]) => {
        if (!menu.hidden) closeMenu(trigger, menu, returnFocus);
      });
    }

    function openMenu(trigger, menu) {
      document.dispatchEvent(new CustomEvent("vnext:request-close-global-search"));
      menuPairs.forEach(([otherTrigger, otherMenu]) => {
        if (otherMenu !== menu) closeMenu(otherTrigger, otherMenu, false);
      });
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    }

    function drawerIsOpen() {
      return document.body.classList.contains("vnext-navigation-open");
    }

    function drawerFocusableControls() {
      if (!drawer) return [];
      return [...drawer.querySelectorAll(drawerFocusableSelector)].filter((control) => {
        const style = getComputedStyle(control);
        return style.display !== "none" && style.visibility !== "hidden";
      });
    }

    function setDrawerBackgroundInert(inert) {
      drawerBackgroundTargets.forEach((target) => { target.inert = inert; });
    }

    function closeNavigationDrawer(returnFocus = false) {
      if (!drawer || !drawerTrigger || !drawerOverlay) return;
      document.body.classList.remove("vnext-navigation-open");
      drawerTrigger.setAttribute("aria-expanded", "false");
      drawer.setAttribute("aria-hidden", navigationMedia.matches ? "true" : "false");
      drawer.toggleAttribute("inert", navigationMedia.matches);
      drawerOverlay.hidden = true;
      setDrawerBackgroundInert(false);
      if (returnFocus && navigationMedia.matches) setTimeout(() => drawerTrigger.focus(), 0);
    }

    function openNavigationDrawer() {
      if (!navigationMedia.matches || !drawer || !drawerTrigger || !drawerOverlay) return;
      closeAllMenus(false);
      document.body.classList.add("vnext-navigation-open");
      drawerTrigger.setAttribute("aria-expanded", "true");
      drawer.setAttribute("aria-hidden", "false");
      drawer.removeAttribute("inert");
      drawerOverlay.hidden = false;
      setDrawerBackgroundInert(true);
      setTimeout(() => (drawerClose || drawerFocusableControls()[0])?.focus(), 0);
    }

    function syncResponsiveMode() {
      if (!drawer || !drawerTrigger || !drawerOverlay) return;
      closeNavigationDrawer(false);
      if (navigationMedia.matches) {
        drawer.setAttribute("role", "dialog");
        drawer.setAttribute("aria-modal", "true");
        drawer.setAttribute("aria-label", "Command Center navigation");
        drawer.setAttribute("aria-hidden", "true");
        drawer.setAttribute("inert", "");
      } else {
        drawer.removeAttribute("role");
        drawer.removeAttribute("aria-modal");
        drawer.setAttribute("aria-label", "Command Center sidebar");
        drawer.removeAttribute("aria-hidden");
        drawer.removeAttribute("inert");
      }
    }

    menuPairs.forEach(([trigger, menu]) => {
      trigger.addEventListener("click", () => {
        if (menu.hidden) openMenu(trigger, menu);
        else closeMenu(trigger, menu, false);
      });
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        openMenu(trigger, menu);
        menu.querySelector('[role="menuitem"]')?.focus();
      });
      menu.addEventListener("keydown", (event) => {
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        const index = items.indexOf(document.activeElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          items[(index + direction + items.length) % items.length]?.focus();
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          items[event.key === "Home" ? 0 : items.length - 1]?.focus();
        }
      });
    });

    document.addEventListener("click", (event) => {
      const action = event.target.closest?.("[data-shell-action]")?.dataset.shellAction;
      if (action === "open-navigation") {
        openNavigationDrawer();
        return;
      }
      if (action === "close-navigation") {
        closeNavigationDrawer(true);
        return;
      }
      if (action === "open-lee") {
        if (typeof openLeeBubble === "function") openLeeBubble();
      }
      if (action === "sign-out") {
        if (typeof lockCommandCenter === "function") lockCommandCenter();
      }
      if (navigationMedia.matches && drawerIsOpen() && event.target.closest?.(".vnext-sidebar a, .vnext-sidebar [data-shell-action]")) {
        closeNavigationDrawer(false);
      }
      if (event.target.closest?.('[role="menuitem"]')) closeAllMenus(false);
      if (!event.target.closest?.(".vnext-menu")) closeAllMenus(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && drawerIsOpen()) {
        event.preventDefault();
        closeNavigationDrawer(true);
        return;
      }
      if (event.key === "Tab" && drawerIsOpen()) {
        const controls = drawerFocusableControls();
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === "Escape") closeAllMenus(true);
    });
    window.addEventListener("hashchange", () => setTimeout(syncShell, 0));
    document.addEventListener("vnext:inbox-count", (event) => setInboxCount(event.detail?.count));
    document.addEventListener("vnext:session-expired", clearInboxCount);
    document.addEventListener("vnext:recovery-mode", clearInboxCount);
    document.addEventListener("vnext:close-navigation", () => closeNavigationDrawer(false));
    document.addEventListener("vnext:close-shell-popovers", () => closeAllMenus(false));
    navigationMedia.addEventListener("change", syncResponsiveMode);
    const app = document.querySelector("main#app");
    if (app) new MutationObserver(syncShell).observe(app, { childList:true, subtree:false });
    syncResponsiveMode();
    syncShell();
    setTimeout(() => refreshInboxCount(), 0);
  })();
  </script>`;
}

function applyVNextRouteParser(html) {
  const startMarker = '      const pathRoute = String(location.pathname || "/").replace(';
  const endMarker = '      if (pageId === "safe-mode") {';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) return html;
  const parser = `      const pathRoute = String(location.pathname || "/").replace(/^\\/+|\\/+$/g, "");
      const requestedHash = String(location.hash || (pathRoute === "sources/import-social-calendar" ? "#sources" : "#cockpit"));
      const vnextRouteResolution = window.__LE_VNEXT_ROUTE_COMPATIBILITY.resolve(requestedHash);
      window.__LE_VNEXT_ACTIVE_ROUTE = vnextRouteResolution;
      const artifactRef = vnextRouteResolution.kind === "object"
        ? { collection:vnextRouteResolution.sourceKind, itemId:vnextRouteResolution.sourceId }
        : null;
      const isGlobalSearchRoute = vnextRouteResolution.kind === "page"
        && ["search", "operator-search"].includes(vnextRouteResolution.canonicalRoute);
      const isInboxRoute = vnextRouteResolution.kind === "page"
        && vnextRouteResolution.canonicalRoute === "inbox";
      const normalizedPage = artifactRef
        ? "item"
        : (isGlobalSearchRoute || isInboxRoute) ? "today"
        : vnextRouteResolution.kind === "page" ? vnextRouteResolution.canonicalRoute : "today";
      const pageId = normalizedPage;
      currentPageId = pageId;
      document.body.classList.toggle("ck-wash", ["today", "overview"].includes(pageId));
      if (pageId === "decisions" && !companyQueue && !companyQueueLoading) loadDecisionsQueue();
      const canCanonicalize = !pathRoute
        && !isGlobalSearchRoute
        && !isInboxRoute
        && (vnextRouteResolution.kind === "page" || vnextRouteResolution.kind === "object")
        && vnextRouteResolution.safeHash;
      if (canCanonicalize && location.hash !== vnextRouteResolution.safeHash) {
        history.replaceState(null, "", vnextRouteResolution.safeHash);
      }
`;
  return html.slice(0, start) + parser + html.slice(end);
}

function removeLegacyPrimaryHeader(html) {
  const start = html.indexOf('<header class="app-topbar">');
  if (start < 0) return html;
  const end = html.indexOf("</header>", start);
  return end < 0 ? html : html.slice(0, start) + html.slice(end + "</header>".length);
}

function replaceInitialLoadingSurface(html) {
  const startMarker = '<main id="app">';
  const start = html.indexOf(startMarker);
  const end = html.indexOf("</main>", start);
  if (start < 0 || end < 0) return html;
  const currentContent = html.slice(start + startMarker.length, end);
  if (!currentContent.includes('class="panel loading-panel"') || !currentContent.includes("Loading LegalEase")) return html;
  return html.slice(0, start + startMarker.length)
    + INITIAL_VNEXT_LOADING_HTML
    + html.slice(end);
}

export function renderVNextDesktopShell(legacyHtml = "") {
  const source = String(legacyHtml || "");
  const bodyMarker = "<body>";
  const shellMarker = '<div class="shell">';
  const toastMarker = '<div id="toast"';
  if (!source.includes(bodyMarker) || !source.includes(shellMarker) || !source.includes(toastMarker)) return source;

  const chrome = renderVNextDesktopShellChrome();
  let html = removeLegacyPrimaryHeader(source);
  html = applyVNextRouteParser(html);
  html = replaceInitialLoadingSurface(html);
  html = html.replace(
    "</head>",
    `  <link rel="stylesheet" href="${escapeAttribute(assetUrl(DESKTOP_SHELL_STYLESHEET_PATH))}" />\n  <link rel="stylesheet" href="${escapeAttribute(assetUrl(INBOX_PAGE_STYLESHEET_PATH))}" />\n  <script>${routeCompatibilityBrowserSource()}</script>\n</head>`
  );
  html = html.replace(bodyMarker, '<body class="vnext-app-shell" data-command-center-shell="vnext">');
  html = html.replace(shellMarker, `${chrome.start}\n  ${shellMarker}`);
  const toastIndex = html.indexOf(toastMarker);
  html = html.slice(0, toastIndex) + chrome.end + "\n  " + html.slice(toastIndex);
  html = html.replace("</body>", `${shellClientScript()}\n<script>${shellResilienceBrowserSource()}</script>\n<script>${globalCreateBrowserSource()}</script>\n<script>${globalSearchBrowserSource()}</script>\n<script>${inboxPageBrowserSource()}</script>\n</body>`);
  return html;
}

export const DESKTOP_SHELL_CONTRACT = Object.freeze({
  approvedLogoPath:APPROVED_WHITE_LOGO_PATH,
  tokenStylesheetPath:TOKEN_STYLESHEET_PATH,
  shellStylesheetPath:DESKTOP_SHELL_STYLESHEET_PATH,
  primaryDestinations:PRIMARY_SHELL_DESTINATIONS,
  secondaryControls:SECONDARY_SHELL_CONTROLS,
  topBarControls:TOP_BAR_CONTROLS,
  createOptions:CREATE_MENU_OPTIONS
});

export const RESPONSIVE_SHELL_CONTRACT = Object.freeze({
  breakpointPx:RESPONSIVE_SHELL_BREAKPOINT_PX,
  drawerId:RESPONSIVE_NAVIGATION_DRAWER_ID,
  approvedLogoPath:APPROVED_WHITE_LOGO_PATH,
  primaryDestinations:PRIMARY_SHELL_DESTINATIONS,
  secondaryControls:SECONDARY_SHELL_CONTROLS,
  createOptions:CREATE_MENU_OPTIONS,
  requiredWidths:Object.freeze([1440, 1280, 1024, 768, 390])
});
