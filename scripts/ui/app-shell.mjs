import { APPROVED_WHITE_LOGO_PATH, TOKEN_STYLESHEET_PATH } from "./brand-contract.mjs";
import { escapeAttribute, escapeHtml } from "./html.mjs";
import {
  CREATE_MENU_OPTIONS,
  ITEM_COLLECTION_DESTINATIONS,
  PRIMARY_SHELL_DESTINATIONS,
  SECONDARY_SHELL_CONTROLS,
  SHELL_ALIAS_TARGETS,
  SHELL_ROUTE_DESTINATIONS,
  TOP_BAR_CONTROLS
} from "./app-shell-navigation.mjs";

export const DESKTOP_SHELL_STYLESHEET_PATH = "assets/ui/desktop-shell.css";
export const RESPONSIVE_SHELL_BREAKPOINT_PX = 860;
export const RESPONSIVE_NAVIGATION_DRAWER_ID = "vnext-navigation-drawer";

const assetUrl = (path) => `/${String(path || "").replace(/^\/+/, "")}`;
const routeHref = (route) => `#${String(route || "today").replace(/^#/, "")}`;

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
  return CREATE_MENU_OPTIONS.map((item) => `
            <a role="menuitem" href="${escapeAttribute(routeHref(item.route))}" data-shell-create-option="${escapeAttribute(item.id)}">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.description)}</span>
            </a>`).join("");
}

export function renderVNextDesktopShellChrome() {
  const search = TOP_BAR_CONTROLS.find((item) => item.id === "search");
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
        <a class="vnext-search-link" href="${escapeAttribute(routeHref(search.route))}" data-shell-destination="${escapeAttribute(search.label)}">
          <span class="vnext-topbar-icon" aria-hidden="true">⌕</span><span class="vnext-topbar-label">${escapeHtml(search.label)}</span>
        </a>
        <div class="vnext-topbar-actions">
          <div class="vnext-menu">
            <button class="vnext-create-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="vnext-create-menu">Create</button>
            <div class="vnext-menu-panel vnext-create-menu" id="vnext-create-menu" role="menu" aria-label="Create" hidden>${createMenuHtml()}
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
    </div>
  </div>`
  });
}

function shellClientScript() {
  const routeDestinations = JSON.stringify(SHELL_ROUTE_DESTINATIONS).replaceAll("<", "\\u003c");
  const aliasTargets = JSON.stringify(SHELL_ALIAS_TARGETS).replaceAll("<", "\\u003c");
  const itemDestinations = JSON.stringify(ITEM_COLLECTION_DESTINATIONS).replaceAll("<", "\\u003c");
  return `<script>
  (() => {
    "use strict";
    const routeDestinations = Object.freeze(${routeDestinations});
    const aliasTargets = Object.freeze(${aliasTargets});
    const itemDestinations = Object.freeze(${itemDestinations});
    const menuPairs = [
      [document.querySelector(".vnext-create-trigger"), document.querySelector("#vnext-create-menu")],
      [document.querySelector(".vnext-profile-trigger"), document.querySelector("#vnext-profile-menu")]
    ].filter((pair) => pair[0] && pair[1]);
    const drawer = document.querySelector("[data-shell-drawer]");
    const drawerTrigger = document.querySelector(".vnext-navigation-trigger");
    const drawerClose = document.querySelector(".vnext-drawer-close");
    const drawerOverlay = document.querySelector(".vnext-drawer-overlay");
    const shellStage = document.querySelector(".vnext-shell-stage");
    const navigationMedia = window.matchMedia("(max-width: ${RESPONSIVE_SHELL_BREAKPOINT_PX}px)");
    const drawerFocusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function requestedRoute() {
      const path = String(location.pathname || "/").replace(/^\\/+|\\/+$/g, "");
      return String(location.hash || (path === "sources/import-social-calendar" ? "#sources" : "#cockpit")).replace(/^#/, "").split("?")[0];
    }

    function destinationForLocation() {
      const requested = requestedRoute();
      if (requested.startsWith("item/")) {
        const collection = String(requested.split("/")[1] || "").replace(/[^a-zA-Z0-9_-]/g, "");
        return itemDestinations[collection] || "Today";
      }
      const canonical = aliasTargets[requested] || requested;
      return routeDestinations[canonical] || "Today";
    }

    function realInboxCount() {
      try {
        if (typeof companyQueue !== "undefined" && Number.isFinite(Number(companyQueue?.counts?.needsRoger))) {
          return Math.max(0, Number(companyQueue.counts.needsRoger));
        }
        if (typeof state !== "undefined" && Array.isArray(state?.queueItems)) {
          return state.queueItems.filter((item) => ["needs_roger", "new"].includes(String(item?.status || ""))).length;
        }
      } catch {}
      return null;
    }

    function syncInboxCount() {
      const badge = document.querySelector("[data-shell-inbox-count]");
      if (!badge) return;
      const count = realInboxCount();
      badge.hidden = !(Number.isFinite(count) && count > 0);
      badge.textContent = Number.isFinite(count) && count > 0 ? String(count) : "";
      badge.setAttribute("aria-label", Number.isFinite(count) && count > 0 ? String(count) + " items need attention" : "");
    }

    function normalizeNestedMainRegions() {
      const app = document.querySelector("main#app");
      if (!app) return;
      app.querySelectorAll("main").forEach((nested) => nested.setAttribute("role", "presentation"));
    }

    function syncShell() {
      normalizeNestedMainRegions();
      const destination = destinationForLocation();
      document.body.dataset.shellDestination = destination;
      const currentContext = document.querySelector("[data-shell-current-context]");
      if (currentContext) currentContext.textContent = destination;
      document.querySelectorAll("[data-shell-destination]").forEach((control) => {
        const selected = control.dataset.shellDestination === destination;
        control.classList.toggle("is-selected", selected);
        if (selected) control.setAttribute("aria-current", "page");
        else control.removeAttribute("aria-current");
      });
      syncInboxCount();
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

    function closeNavigationDrawer(returnFocus = false) {
      if (!drawer || !drawerTrigger || !drawerOverlay) return;
      document.body.classList.remove("vnext-navigation-open");
      drawerTrigger.setAttribute("aria-expanded", "false");
      drawer.setAttribute("aria-hidden", navigationMedia.matches ? "true" : "false");
      drawer.toggleAttribute("inert", navigationMedia.matches);
      drawerOverlay.hidden = true;
      if (shellStage) shellStage.inert = false;
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
      if (shellStage) shellStage.inert = true;
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
    navigationMedia.addEventListener("change", syncResponsiveMode);
    const app = document.querySelector("main#app");
    if (app) new MutationObserver(syncShell).observe(app, { childList:true, subtree:false });
    syncResponsiveMode();
    syncShell();
  })();
  </script>`;
}

function removeLegacyPrimaryHeader(html) {
  const start = html.indexOf('<header class="app-topbar">');
  if (start < 0) return html;
  const end = html.indexOf("</header>", start);
  return end < 0 ? html : html.slice(0, start) + html.slice(end + "</header>".length);
}

export function renderVNextDesktopShell(legacyHtml = "") {
  const source = String(legacyHtml || "");
  const bodyMarker = "<body>";
  const shellMarker = '<div class="shell">';
  const toastMarker = '<div id="toast"';
  if (!source.includes(bodyMarker) || !source.includes(shellMarker) || !source.includes(toastMarker)) return source;

  const chrome = renderVNextDesktopShellChrome();
  let html = removeLegacyPrimaryHeader(source);
  html = html.replace(
    "</head>",
    `  <link rel="stylesheet" href="${escapeAttribute(assetUrl(DESKTOP_SHELL_STYLESHEET_PATH))}" />\n</head>`
  );
  html = html.replace(bodyMarker, '<body class="vnext-app-shell" data-command-center-shell="vnext">');
  html = html.replace(shellMarker, `${chrome.start}\n  ${shellMarker}`);
  const toastIndex = html.indexOf(toastMarker);
  html = html.slice(0, toastIndex) + chrome.end + "\n  " + html.slice(toastIndex);
  html = html.replace("</body>", `${shellClientScript()}\n</body>`);
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
