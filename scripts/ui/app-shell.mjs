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
import { inboxActionBrowserSource } from "./inbox-action-ui.mjs";
import { LEE_INBOX_PANEL_STYLESHEET_PATH, leeInboxPanelBrowserSource } from "./lee-inbox-panel.mjs";
import { TASK_WORKBENCH_STYLESHEET_PATH, taskWorkbenchBrowserSource } from "./task-workbench.mjs";
import {
  COMMUNICATION_COMPOSER_LAYOUT_STYLESHEET_PATH,
  COMMUNICATION_COMPOSER_STYLESHEET_PATH,
  communicationComposerBrowserSource
} from "./communication-composer.mjs";
import {
  RELATIONSHIP_DRAWER_STYLESHEET_PATH,
  relationshipDrawerBrowserSource
} from "./relationship-drawer.mjs";
import {
  QUICK_CAPTURE_STYLESHEET_PATH,
  quickCaptureBrowserSource
} from "./quick-capture.mjs";
import {
  INBOX_PAGE_STYLESHEET_PATH,
  inboxPageBrowserSource
} from "./pages/inbox-page.mjs";
import {
  TODAY_PAGE_STYLESHEET_PATH,
  todayPageBrowserSource
} from "./pages/today-page.mjs";
import {
  SOCIAL_HOME_STYLESHEET_PATH,
  socialHomeBrowserSource
} from "./pages/social-home.mjs";
import { POST_COMPOSER_STYLESHEET_PATH, postComposerBrowserSource } from "./pages/post-composer.mjs";
import { socialResultsBrowserSource } from "./pages/social-results.mjs";
import { SOCIAL_WEEKLY_PLANNER_STYLESHEET_PATH, socialWeeklyPlannerBrowserSource } from "./social-weekly-planner.mjs";
import { FOUNDER_SCOREBOARD_STYLESHEET_PATH, founderScoreboardBrowserSource } from "./pages/founder-scoreboard.mjs";
import { FOUNDER_SUPPORT_STYLESHEET_PATH, founderSupportPageBrowserSource } from "./pages/founder-support-page.mjs";
import { FOUNDER_CALENDAR_STYLESHEET_PATH, founderCalendarPageBrowserSource } from "./pages/founder-calendar-page.mjs";
import { FOUNDER_COMPANY_HEALTH_STYLESHEET_PATH, founderCompanyHealthBrowserSource } from "./pages/founder-company-health.mjs";
import { SOCIAL_CALENDAR_STYLESHEET_PATH } from "./pages/social-calendar.mjs";
import { SOCIAL_CONNECTIONS_STYLESHEET_PATH } from "./pages/social-connections.mjs";
import { socialProductionControllerBrowserSource } from "./controllers/social-production-controller.mjs";
import {
  PARTNERS_ACCESSIBILITY_STYLESHEET_PATH,
  PARTNERS_HOME_STYLESHEET_PATH,
  partnersHomeBrowserSource
} from "./pages/partners-home.mjs";
import { PARTNER_RECORD_STYLESHEET_PATHS, partnerRecordBrowserSource } from "./pages/partner-record.mjs";
import { OUTREACH_HOME_STYLESHEET_PATH, outreachHomeBrowserSource } from "./pages/outreach-home.mjs";
import { AUTOMATION_CONTROL_CENTER_STYLESHEET_PATH, automationControlCenterBrowserSource } from "./pages/automation-control-center.mjs";
import { CAMPAIGN_WIZARD_STYLESHEET_PATH, campaignWizardBrowserSource } from "./pages/campaign-wizard.mjs";
import { CAMPAIGN_DETAIL_STYLESHEET_PATH, campaignDetailBrowserSource } from "./pages/campaign-detail.mjs";
import { campaignReviewBrowserSource } from "./pages/campaign-review-step.mjs";
import { FILES_HOME_STYLESHEET } from "./pages/files-home.mjs";
import { FILE_DETAILS_STYLESHEET } from "./pages/file-details.mjs";
import { FILE_UPLOAD_STYLESHEET } from "./pages/file-upload.mjs";
import { INVESTOR_ROOM_STYLESHEET } from "./pages/investor-room.mjs";
import { filesIntegrationBrowserSource } from "./controllers/files-integration-controller.mjs";
import { renderDiscoveryOnboarding, DISCOVERY_ONBOARDING_STYLESHEET } from "./pages/discovery-onboarding.mjs";
import { renderDiscoveryChecklist, DISCOVERY_CHECKLIST_STYLESHEET } from "./pages/discovery-checklist.mjs";
import { renderContextualHelp, DISCOVERY_HELP_STYLESHEET } from "./pages/discovery-help.mjs";
import { discoveryOnboardingBrowserSource } from "./controllers/discovery-onboarding-controller.mjs";
import { discoveryChecklistBrowserSource } from "./controllers/discovery-checklist-controller.mjs";
import { discoveryEmptyStateBrowserSource } from "./controllers/discovery-empty-state-controller.mjs";
import { discoveryHelpBrowserSource } from "./controllers/discovery-help-controller.mjs";
import { discoveryAnalyticsBrowserSource } from "./controllers/discovery-analytics-controller.mjs";
import { DISCOVERY_ANALYTICS_ENDPOINT } from "../discovery-product-analytics.mjs";
import { INITIAL_VNEXT_LOADING_HTML } from "./shell-states.mjs";
import {
  CREATE_MENU_OPTIONS,
  PRIMARY_SHELL_DESTINATIONS,
  primaryShellDestinations,
  SECONDARY_SHELL_CONTROLS,
  TOP_BAR_CONTROLS
} from "./app-shell-navigation.mjs";

export const DESKTOP_SHELL_STYLESHEET_PATH = "assets/ui/desktop-shell.css";
export const RESPONSIVE_SHELL_BREAKPOINT_PX = 860;
export const RESPONSIVE_NAVIGATION_DRAWER_ID = "vnext-navigation-drawer";
export const VNEXT_LAZY_RUNTIME_PATH_PREFIX = "/assets/ui/runtime/";
export const VNEXT_LAZY_RUNTIME_MAX_BYTES = 64 * 1024;

const VNEXT_LAZY_ASSETS = Object.freeze({
  "lee-inbox":Object.freeze({
    styles:Object.freeze([LEE_INBOX_PANEL_STYLESHEET_PATH]),
    source:leeInboxPanelBrowserSource,
    api:"__LE_LEE_INBOX"
  }),
  "task-workbench":Object.freeze({
    styles:Object.freeze([TASK_WORKBENCH_STYLESHEET_PATH]),
    source:taskWorkbenchBrowserSource
  }),
  "communication-composer":Object.freeze({
    styles:Object.freeze([COMMUNICATION_COMPOSER_STYLESHEET_PATH, COMMUNICATION_COMPOSER_LAYOUT_STYLESHEET_PATH]),
    source:communicationComposerBrowserSource
  }),
  "relationship-drawer":Object.freeze({
    styles:Object.freeze([RELATIONSHIP_DRAWER_STYLESHEET_PATH]),
    source:relationshipDrawerBrowserSource
  }),
  "social-weekly-planner":Object.freeze({
    styles:Object.freeze([SOCIAL_WEEKLY_PLANNER_STYLESHEET_PATH]),
    source:socialWeeklyPlannerBrowserSource
  }),
  "founder-scoreboard":Object.freeze({
    styles:Object.freeze([FOUNDER_SCOREBOARD_STYLESHEET_PATH]),
    source:founderScoreboardBrowserSource,
    api:"__LE_FOUNDER_SCOREBOARD"
  }),
  "founder-support":Object.freeze({
    styles:Object.freeze([FOUNDER_SUPPORT_STYLESHEET_PATH]),
    source:founderSupportPageBrowserSource,
    api:"__LE_FOUNDER_SUPPORT"
  }),
  "founder-calendar":Object.freeze({
    styles:Object.freeze([FOUNDER_CALENDAR_STYLESHEET_PATH]),
    source:founderCalendarPageBrowserSource,
    api:"__LE_FOUNDER_CALENDAR"
  }),
  "founder-company-health":Object.freeze({
    styles:Object.freeze([FOUNDER_COMPANY_HEALTH_STYLESHEET_PATH]),
    source:founderCompanyHealthBrowserSource,
    api:"__LE_FOUNDER_COMPANY_HEALTH"
  }),
  "automation-control-center":Object.freeze({
    styles:Object.freeze([AUTOMATION_CONTROL_CENTER_STYLESHEET_PATH]),
    source:automationControlCenterBrowserSource,
    outreachOnly:true
  })
});

export const VNEXT_LAZY_ASSET_CONTRACT = Object.freeze({
  runtimePathPrefix:VNEXT_LAZY_RUNTIME_PATH_PREFIX,
  runtimeMaxBytes:VNEXT_LAZY_RUNTIME_MAX_BYTES,
  runtimeIds:Object.freeze(Object.keys(VNEXT_LAZY_ASSETS)),
  stylesheetPaths:Object.freeze([...new Set(Object.values(VNEXT_LAZY_ASSETS).flatMap((asset) => asset.styles))])
});

export function resolveVNextLazyRuntime(pathname = "", options = {}) {
  const requestedPath = String(pathname || "");
  if (requestedPath.length > VNEXT_LAZY_RUNTIME_PATH_PREFIX.length + 80) return null;
  const match = requestedPath.match(/^\/assets\/ui\/runtime\/([a-z0-9]+(?:-[a-z0-9]+)*)\.js$/);
  if (!match || !Object.hasOwn(VNEXT_LAZY_ASSETS, match[1])) return null;
  const asset = VNEXT_LAZY_ASSETS[match[1]];
  if (!asset || (asset.outreachOnly && options.outreachEnabled !== true)) return null;
  const source = asset.source();
  return typeof source === "string" && source.length <= VNEXT_LAZY_RUNTIME_MAX_BYTES ? source : null;
}

const assetUrl = (path) => `/${String(path || "").replace(/^\/+/, "")}`;
const PUBLIC_ROUTE_HREFS = Object.freeze({ queue:"social" });
const routeHref = (route) => {
  const normalized = String(route || "today").replace(/^#/, "");
  return `#${PUBLIC_ROUTE_HREFS[normalized] || normalized}`;
};

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

function primaryNavigationHtml(options = {}) {
  return primaryShellDestinations(options).map((item, index) => {
    const count = item.id === "inbox" ? '<span class="vnext-inbox-count" data-shell-inbox-count hidden></span>' : "";
    return `
        <a class="vnext-nav-link${index === 0 ? " is-selected" : ""}" href="${escapeAttribute(routeHref(item.route))}" data-shell-destination="${escapeAttribute(item.id === "partners" ? "Partners" : item.label)}"${index === 0 ? ' aria-current="page"' : ""}>
          <span class="vnext-nav-indicator" aria-hidden="true"></span>
          <span>${escapeHtml(item.label)}</span>${count}
        </a>`;
  }).join("");
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

export function renderVNextDesktopShellChrome(options = {}) {
  const help = TOP_BAR_CONTROLS.find((item) => item.id === "help");
  const discovery = options.discovery || {};
  const helpControl = options.discoveryEnabled
    ? `<button class="vnext-topbar-link" type="button" data-shell-action="open-contextual-help" aria-label="${escapeAttribute(help.label)}"><span class="vnext-topbar-icon" aria-hidden="true">?</span><span class="vnext-topbar-label">${escapeHtml(help.label)}</span></button>`
    : `<a class="vnext-topbar-link" href="${escapeAttribute(routeHref(help.route))}" aria-label="${escapeAttribute(help.label)}"><span class="vnext-topbar-icon" aria-hidden="true">?</span><span class="vnext-topbar-label">${escapeHtml(help.label)}</span></a>`;
  return Object.freeze({
    start:`<div class="vnext-shell" data-vnext-shell="desktop">
    <button class="vnext-drawer-overlay" type="button" data-shell-action="close-navigation" aria-label="Close navigation" tabindex="-1" hidden></button>
    <aside class="vnext-sidebar" aria-label="Command Center sidebar" id="${RESPONSIVE_NAVIGATION_DRAWER_ID}" data-shell-drawer>
      <a class="vnext-logo-link" href="#today" aria-label="LegalEase Command Center home">
        <img class="vnext-shell-logo" src="${escapeAttribute(assetUrl(APPROVED_WHITE_LOGO_PATH))}" width="1920" height="1080" alt="LegalEase">
      </a>
      <button class="vnext-drawer-close" type="button" data-shell-action="close-navigation" aria-label="Close navigation"><span aria-hidden="true">×</span></button>
      <nav class="vnext-primary-navigation" aria-label="Primary destinations">${primaryNavigationHtml(options)}
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
          ${helpControl}
          <div class="vnext-menu">
            <button class="vnext-profile-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="vnext-profile-menu"><span class="vnext-topbar-icon" aria-hidden="true">●</span><span class="vnext-topbar-label">Profile</span></button>
            <div class="vnext-menu-panel vnext-profile-menu" id="vnext-profile-menu" role="menu" aria-label="Profile" hidden>
              <a role="menuitem" href="#settings">Settings</a>
              ${options.discoveryEnabled ? '<button role="menuitem" type="button" data-shell-action="open-discovery-checklist">Getting started</button><button role="menuitem" type="button" data-shell-action="start-product-tour-again">Start product tour again</button>' : ""}
              <button role="menuitem" type="button" data-shell-action="sign-out">Sign out</button>
            </div>
          </div>
        </div>
      </header>
      <div class="vnext-routed-content">`,
    end:`</div>
      ${renderGlobalCreateWorkspace()}
      ${renderGlobalSearchDialog()}
      ${options.discoveryEnabled ? `<section class="discovery-checklist-panel" data-discovery-checklist-panel hidden><div class="discovery-checklist-dialog" role="dialog" aria-modal="true" aria-label="Getting started"><button class="discovery-checklist-close" type="button" data-checklist-close aria-label="Close getting started">×</button>${renderDiscoveryChecklist(discovery.checklist || {})}</div></section>${renderContextualHelp(discovery.help || {})}${renderDiscoveryOnboarding(discovery.onboarding || {})}` : ""}
    </div>
  </div>`
  });
}

function discoveryCaptureSinkBrowserSource() {
  const endpoint = JSON.stringify(DISCOVERY_ANALYTICS_ENDPOINT);
  return `(() => { "use strict";
    window.__LE_CSRF_TOKEN=()=>{try{return typeof cookieValue==="function"?cookieValue("leos_csrf"):"";}catch{return"";}};
    window.__LE_DISCOVERY_ANALYTICS_CAPTURE=(event)=>{try{const id="discovery-analytics-"+crypto.randomUUID().replaceAll("-","");void fetch(${endpoint},{method:"POST",credentials:"same-origin",keepalive:true,headers:{accept:"application/json","content-type":"application/json","x-csrf-token":window.__LE_CSRF_TOKEN(),"x-request-id":id},body:JSON.stringify(event)}).catch(()=>{});}catch{}};
    document.addEventListener("click",event=>{const trigger=event.target.closest?.('[data-shell-action="start-product-tour-again"]');if(trigger){event.preventDefault();document.dispatchEvent(new CustomEvent("vnext:open-onboarding",{detail:{returnTarget:trigger}}));}});
  })();`;
}

function vnextLazyAssetLoaderScript(options = {}) {
  const manifest = Object.fromEntries(Object.entries(VNEXT_LAZY_ASSETS)
    .filter(([, asset]) => !asset.outreachOnly || options.outreachEnabled === true)
    .map(([id, asset]) => [id, {
      styles:asset.styles.map(assetUrl),
      runtime:`${VNEXT_LAZY_RUNTIME_PATH_PREFIX}${id}.js`,
      ...(asset.api ? { api:asset.api } : {})
    }]));
  const serializedManifest = JSON.stringify(manifest).replaceAll("<", "\\u003c");
  return `<script>
  (() => {
    "use strict";
    const manifest = ${serializedManifest};
    const runtimeLoads = new Map();
    const loadedStyles = new Set([...document.querySelectorAll('link[rel="stylesheet"][href]')].map((link) => {
      try { return new URL(link.href, location.origin).pathname; } catch { return ""; }
    }).filter(Boolean));
    function sameOriginUrl(path) {
      try { const url = new URL(path, location.origin); return url.origin === location.origin ? url : null; } catch { return null; }
    }
    function loadStyle(path, id) {
      const url = sameOriginUrl(path);
      if (!url || loadedStyles.has(url.pathname)) return;
      loadedStyles.add(url.pathname);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url.href;
      link.dataset.vnextLazyStyle = id;
      link.addEventListener("error", () => { loadedStyles.delete(url.pathname); link.remove(); }, { once:true });
      document.head.append(link);
    }
    function activateLoadedRuntime(asset) {
      const api = asset.api ? window[asset.api] : null;
      if (typeof api?.activate === "function") queueMicrotask(() => api.activate());
    }
    function loadRuntime(id) {
      const asset = manifest[id];
      if (!asset) return Promise.resolve(false);
      asset.styles.forEach((path) => loadStyle(path, id));
      if (runtimeLoads.has(id)) return runtimeLoads.get(id);
      const url = sameOriginUrl(asset.runtime);
      if (!url) return Promise.resolve(false);
      const pending = new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = url.href;
        script.async = true;
        script.dataset.vnextLazyRuntime = id;
        script.addEventListener("load", () => { activateLoadedRuntime(asset); resolve(true); }, { once:true });
        script.addEventListener("error", () => { runtimeLoads.delete(id); script.remove(); resolve(false); }, { once:true });
        document.body.append(script);
      });
      runtimeLoads.set(id, pending);
      return pending;
    }
    function routeAssets() {
      const hash = String(location.hash || "#today");
      const raw = hash.slice(1).split(/[/?]/)[0].toLocaleLowerCase("en-US");
      const query = new URLSearchParams(hash.split("?")[1] || "");
      const resolved = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(hash);
      const route = resolved?.kind === "page" ? resolved.canonicalRoute : "";
      const objectType = resolved?.kind === "object" ? resolved.objectType : "";
      const required = new Set();
      const add = (...ids) => ids.forEach((id) => required.add(id));
      if (route === "today") add("task-workbench", "communication-composer");
      if (route === "inbox") add("lee-inbox", "task-workbench", "communication-composer", "relationship-drawer");
      if (route === "partners" || objectType === "Partner") add("relationship-drawer", "task-workbench", "communication-composer");
      if (route === "support") add("founder-support", "relationship-drawer", "task-workbench", "communication-composer");
      if (route === "meetings") add("founder-calendar", "relationship-drawer", "task-workbench", "communication-composer");
      if (["revenue", "metrics"].includes(route) || ["revenue", "scoreboard", "metrics", "kpis"].includes(raw)) add("founder-scoreboard");
      if (["company-health", "os-health"].includes(route) || ["company-health", "os-health", "health", "app-status", "system"].includes(raw)) add("founder-company-health");
      if (route === "queue" && query.get("view") === "weekly") add("social-weekly-planner");
      if (["automation", "automation-control", "automation-control-center"].includes(raw) || (route === "outreach" && query.get("view") === "automation")) add("automation-control-center");
      return required;
    }
    function controlAssets() {
      const root = document.querySelector("main#app");
      if (!root) return [];
      const required = new Set();
      if (root.querySelector("[data-task-open]")) { required.add("task-workbench"); required.add("communication-composer"); }
      if (root.querySelector("[data-compose-source-kind][data-compose-source-id]")) required.add("communication-composer");
      if (root.querySelector("[data-relationship-open]")) { required.add("relationship-drawer"); required.add("task-workbench"); required.add("communication-composer"); }
      return required;
    }
    function activate() {
      const required = new Set([...routeAssets(), ...controlAssets()]);
      required.forEach((id) => { void loadRuntime(id); });
    }
    let observerQueued = false;
    const app = document.querySelector("main#app");
    if (app) new MutationObserver(() => {
      if (observerQueued) return;
      observerQueued = true;
      queueMicrotask(() => { observerQueued = false; activate(); });
    }).observe(app, { childList:true, subtree:true });
    window.addEventListener("hashchange", activate);
    window.__LE_VNEXT_LAZY_ASSETS = Object.freeze({ activate });
    activate();
  })();
</script>`.replace(/\n\s*/g, "");
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
      if (currentContext) currentContext.textContent = destination === "Partners" ? "Relationships" : destination;
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

function applyVNextRouteParser(html, { socialEnabled = false, outreachEnabled = false, filesEnabled = false } = {}) {
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
      const isSocialRoute = vnextRouteResolution.kind === "page"
        && vnextRouteResolution.canonicalRoute === "queue";
      const isSocialPostRoute = vnextRouteResolution.kind === "object"
        && vnextRouteResolution.objectType === "Post"
        && vnextRouteResolution.sourceKind === "posts"
        && vnextRouteResolution.requestedRoute === "social/post";
      const isOutreachRoute = ${outreachEnabled ? "vnextRouteResolution.kind === \"page\" && vnextRouteResolution.canonicalRoute === \"outreach\"" : "false"};
      const isFilesRoute = ${filesEnabled ? "vnextRouteResolution.kind === \"page\" && vnextRouteResolution.canonicalRoute === \"files\"" : "false"};
      const normalizedPage = artifactRef
        ? (isSocialPostRoute ? "social-post" : "item")
        : (isGlobalSearchRoute || isInboxRoute || isSocialRoute) ? "today"
        : isOutreachRoute ? "campaigns"
        : isFilesRoute ? "proof"
        : vnextRouteResolution.kind === "page" ? vnextRouteResolution.canonicalRoute : "today";
      const pageId = normalizedPage;
      currentPageId = pageId;
      document.body.classList.toggle("ck-wash", ["today", "overview"].includes(pageId));
      if (pageId === "decisions" && !companyQueue && !companyQueueLoading) loadDecisionsQueue();
      const canCanonicalize = !pathRoute
        && !isGlobalSearchRoute
        && !isInboxRoute
        && !isSocialPostRoute
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

function protectSocialPostSurfaceFromLegacyRender(html, { socialEnabled = false } = {}) {
  const marker = "    function render() {";
  if (!html.includes(marker)) return html;
  return html.replace(marker, `${marker}
      const compactSocialRenderRoute = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today");
      const compactSocialView = new URLSearchParams(String(location.hash || "").split("?")[1] || "").get("view") || "ideas";
      const compactSocialSurface = compactSocialRenderRoute?.kind === "page"
        && compactSocialRenderRoute.canonicalRoute === "queue"
        && /^#social(?:[?]|$)/.test(location.hash)
        && (compactSocialView === "results"
          ? document.querySelector("main#app [data-social-results-page]")
          : document.querySelector("main#app [data-social-page]"));
      if (compactSocialSurface) return;${socialEnabled ? `
      const compactRenderRoute = window.__LE_VNEXT_ROUTE_COMPATIBILITY?.resolve(location.hash || "#today");
      const compactPostSurface = compactRenderRoute?.kind === "object"
        && compactRenderRoute.objectType === "Post"
        && compactRenderRoute.sourceKind === "posts"
        && compactRenderRoute.requestedRoute === "social/post";
      if (compactPostSurface && document.querySelector("main#app [data-post-composer]")) return;` : ""}`);
}

function disableSocialFullStateRefresh(html, { socialEnabled = false, outreachEnabled = false, filesEnabled = false } = {}) {
  const marker = "      loadFullStateInBackground();";
  if (!html.includes(marker)) return html;
  return html.replace(marker, `      const compactSocialRoute = window.__LE_VNEXT_ROUTE_COMPATIBILITY.resolve(location.hash || "#today");
      const onCompactSocial = (compactSocialRoute.kind === "page" && compactSocialRoute.canonicalRoute === "queue")
        || (compactSocialRoute.kind === "object" && compactSocialRoute.objectType === "Post" && compactSocialRoute.sourceKind === "posts");
      const onCompactSocialConnections = ${socialEnabled ? "compactSocialRoute.kind === \"page\" && compactSocialRoute.canonicalRoute === \"settings\" && new URLSearchParams(String(compactSocialRoute.safeHash || location.hash || \"\").split(\"?\")[1] || \"\").get(\"view\") === \"social-connections\"" : "false"};
      const onCompactPartners = (compactSocialRoute.kind === "page" && compactSocialRoute.canonicalRoute === "partners")
        || (compactSocialRoute.kind === "object" && compactSocialRoute.objectType === "Partner" && compactSocialRoute.sourceKind === "partners");
      const onCompactOutreach = ${outreachEnabled ? "(compactSocialRoute.kind === \"page\" && compactSocialRoute.canonicalRoute === \"outreach\") || (compactSocialRoute.kind === \"object\" && compactSocialRoute.objectType === \"Campaign\")" : "false"};
      const onCompactFiles = ${filesEnabled ? "(compactSocialRoute.kind === \"page\" && compactSocialRoute.canonicalRoute === \"files\") || (compactSocialRoute.kind === \"object\" && compactSocialRoute.objectType === \"File\")" : "false"};
      if (!(onCompactSocial || onCompactSocialConnections || onCompactPartners || onCompactOutreach || onCompactFiles)) loadFullStateInBackground();`);
}

export function renderVNextDesktopShell(legacyHtml = "", options = {}) {
  const source = String(legacyHtml || "");
  const bodyMarker = "<body>";
  const shellMarker = '<div class="shell">';
  const toastMarker = '<div id="toast"';
  if (!source.includes(bodyMarker) || !source.includes(shellMarker) || !source.includes(toastMarker)) return source;

  const chrome = renderVNextDesktopShellChrome(options);
  let html = removeLegacyPrimaryHeader(source);
  html = applyVNextRouteParser(html, options);
  html = protectSocialPostSurfaceFromLegacyRender(html, options);
  html = disableSocialFullStateRefresh(html, options);
  html = replaceInitialLoadingSurface(html);
  html = html.replace(
    "</head>",
    `  <link rel="stylesheet" href="${escapeAttribute(assetUrl(DESKTOP_SHELL_STYLESHEET_PATH))}" />\n  <link rel="stylesheet" href="${escapeAttribute(assetUrl(INBOX_PAGE_STYLESHEET_PATH))}" />\n  <link rel="stylesheet" href="${escapeAttribute(assetUrl(TODAY_PAGE_STYLESHEET_PATH))}" />\n  <link rel="stylesheet" href="${escapeAttribute(assetUrl(QUICK_CAPTURE_STYLESHEET_PATH))}" />\n  <link rel="stylesheet" href="${escapeAttribute(assetUrl(SOCIAL_HOME_STYLESHEET_PATH))}" />\n  <link rel="stylesheet" href="${escapeAttribute(assetUrl(POST_COMPOSER_STYLESHEET_PATH))}" />\n  <link rel="stylesheet" href="${escapeAttribute(assetUrl(PARTNERS_HOME_STYLESHEET_PATH))}" />\n  ${PARTNER_RECORD_STYLESHEET_PATHS.map((path) => `<link rel="stylesheet" href="${escapeAttribute(assetUrl(path))}" />`).join("\n  ")}\n  <link rel="stylesheet" href="${escapeAttribute(assetUrl(PARTNERS_ACCESSIBILITY_STYLESHEET_PATH))}" />\n  ${options.outreachEnabled ? [OUTREACH_HOME_STYLESHEET_PATH, CAMPAIGN_WIZARD_STYLESHEET_PATH, CAMPAIGN_DETAIL_STYLESHEET_PATH].map((path) => `<link rel="stylesheet" href="${escapeAttribute(assetUrl(path))}" />`).join("\n  ") : ""}\n  ${options.filesEnabled ? [FILES_HOME_STYLESHEET, "/assets/ui/files-organization.css", FILE_DETAILS_STYLESHEET, FILE_UPLOAD_STYLESHEET, INVESTOR_ROOM_STYLESHEET].map((path) => `<link rel="stylesheet" href="${escapeAttribute(assetUrl(path))}" />`).join("\n  ") : ""}\n  <script>${routeCompatibilityBrowserSource(options)}</script>\n</head>`
  );
  if (options.discoveryEnabled) {
    const discoveryStyles = [DISCOVERY_ONBOARDING_STYLESHEET, DISCOVERY_CHECKLIST_STYLESHEET, "/assets/ui/discovery-empty-states.css", DISCOVERY_HELP_STYLESHEET]
      .map((path) => `<link rel="stylesheet" href="${escapeAttribute(assetUrl(path))}" />`)
      .join("\n  ");
    html = html.replace(
      `  <script>${routeCompatibilityBrowserSource(options)}</script>`,
      `  ${discoveryStyles}\n  <script>${routeCompatibilityBrowserSource(options)}</script>`
    );
  }
  if (options.socialEnabled) {
    const socialStyles = [SOCIAL_CALENDAR_STYLESHEET_PATH, SOCIAL_CONNECTIONS_STYLESHEET_PATH]
      .map((path) => `<link rel="stylesheet" href="${escapeAttribute(assetUrl(path))}" />`)
      .join("\n  ");
    html = html.replace(
      `  <script>${routeCompatibilityBrowserSource(options)}</script>`,
      `  ${socialStyles}\n  <script>${routeCompatibilityBrowserSource(options)}</script>`
    );
  }
  html = html.replace(bodyMarker, '<body class="vnext-app-shell" data-command-center-shell="vnext">');
  html = html.replace(shellMarker, `${chrome.start}\n  ${shellMarker}`);
  const toastIndex = html.indexOf(toastMarker);
  html = html.slice(0, toastIndex) + chrome.end + "\n  " + html.slice(toastIndex);
  html = html.replace("</body>", `${shellClientScript()}\n<script>${shellResilienceBrowserSource()}</script>\n<script>${globalCreateBrowserSource()}</script>\n<script>${quickCaptureBrowserSource()}</script>\n<script>${globalSearchBrowserSource()}</script>\n<script>${todayPageBrowserSource()}</script>\n<script>${inboxPageBrowserSource()}</script>\n<script>${inboxActionBrowserSource()}</script>\n<script>${socialHomeBrowserSource()}</script>\n<script>${socialResultsBrowserSource()}</script>\n<script>${postComposerBrowserSource()}</script>\n<script>${partnersHomeBrowserSource()}</script>\n<script>${partnerRecordBrowserSource()}</script>\n${options.outreachEnabled ? `<script>${outreachHomeBrowserSource()}</script>\n<script>${campaignWizardBrowserSource()}</script>\n<script>${campaignReviewBrowserSource()}</script>\n<script>${campaignDetailBrowserSource()}</script>` : ""}\n${options.filesEnabled ? `<script>${filesIntegrationBrowserSource()}</script>` : ""}\n${vnextLazyAssetLoaderScript(options)}\n</body>`);
  if (options.socialEnabled) {
    html = html.replace(
      `<script>${partnersHomeBrowserSource()}</script>`,
      `<script>${socialProductionControllerBrowserSource()}</script>\n<script>${partnersHomeBrowserSource()}</script>`
    );
  }
  if (options.discoveryEnabled) {
    const discovery = options.discovery || {};
    html = html.replace("</body>", `<script>${discoveryCaptureSinkBrowserSource()}</script>\n<script>${discoveryOnboardingBrowserSource()}</script>\n<script>${discoveryChecklistBrowserSource(discovery.checklist || null)}</script>\n<script>${discoveryEmptyStateBrowserSource()}</script>\n<script>${discoveryHelpBrowserSource()}</script>\n<script>${discoveryAnalyticsBrowserSource()}</script>\n</body>`);
  }
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
