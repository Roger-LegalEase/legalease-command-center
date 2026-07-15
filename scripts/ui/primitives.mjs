import { escapeAttribute, escapeHtml, renderDataAttributes } from "./html.mjs";
import { renderSafeLink } from "./links.mjs";

export const BUTTON_INTENTS = Object.freeze(["primary", "secondary", "quiet", "destructive"]);
export const BUTTON_VARIANTS = Object.freeze(["button", "link"]);
export const STATUS_STATES = Object.freeze([
  "neutral",
  "informational",
  "selected",
  "success",
  "warning",
  "danger",
  "needs-attention"
]);

const clean = (value = "") => String(value ?? "").trim();
const safeId = (value = "") => /^[a-z][a-z0-9_-]*$/i.test(clean(value)) ? clean(value) : "";

function controlContent(label, icon = "", loading = false) {
  const iconHtml = clean(icon)
    ? `<span class="ui-control-icon" aria-hidden="true">${escapeHtml(icon)}</span>`
    : "";
  const workingHtml = loading
    ? '<span class="ui-control-progress" aria-hidden="true"></span>'
    : "";
  return `${iconHtml}${workingHtml}<span>${escapeHtml(label)}</span>`;
}

export function renderButton(options = {}) {
  const label = clean(options.label);
  if (!label) return "";
  const variant = BUTTON_VARIANTS.includes(options.variant) ? options.variant : "button";
  const intent = BUTTON_INTENTS.includes(options.intent) ? options.intent : "secondary";
  const className = `ui-button ui-button--${intent}`;
  const ariaLabel = clean(options.ariaLabel) || label;
  const loading = options.loading === true;
  const workingLabel = loading && clean(options.workingLabel) ? clean(options.workingLabel) : label;
  if (variant === "link") {
    if (options.disabled === true || loading) {
      return `<button class="${className}" type="button" aria-label="${escapeAttribute(loading && !clean(options.ariaLabel) ? workingLabel : ariaLabel)}" disabled aria-disabled="true"${loading ? ' aria-busy="true"' : ""}>${controlContent(workingLabel, options.icon, loading)}</button>`;
    }
    return renderSafeLink({
      label,
      link: options.link,
      className,
      ariaLabel,
      icon: options.icon,
      newTab: options.newTab
    });
  }

  const formType = ["button", "submit", "reset"].includes(options.type) ? options.type : "button";
  const hasAction = clean(options.action) !== "";
  const disabled = options.disabled === true || loading || (formType === "button" && !hasAction);
  const attributes = {
    ...(options.dataAttributes && typeof options.dataAttributes === "object" ? options.dataAttributes : {}),
    action: hasAction ? options.action : options.dataAttributes?.action
  };
  return `<button class="${className}" type="${formType}" aria-label="${escapeAttribute(loading && !clean(options.ariaLabel) ? workingLabel : ariaLabel)}"${disabled ? ' disabled aria-disabled="true"' : ""}${loading ? ' aria-busy="true"' : ""}${renderDataAttributes(attributes)}>${controlContent(workingLabel, options.icon, loading)}</button>`;
}

export function renderStatusChip({ label, state = "neutral" } = {}) {
  const visibleLabel = clean(label);
  if (!visibleLabel) return "";
  const safeState = STATUS_STATES.includes(state) ? state : "neutral";
  return `<span class="ui-status-chip ui-status-chip--${safeState}" role="status" data-state="${safeState}">${escapeHtml(visibleLabel)}</span>`;
}

function renderOptionalAction(action) {
  return action ? renderButton(action) : "";
}

export function renderEmptyState({ title, explanation = "", primaryAction = null } = {}) {
  const safeTitle = clean(title);
  if (!safeTitle) return "";
  const action = renderOptionalAction(primaryAction);
  return `<section class="ui-state ui-empty-state" role="status" aria-live="polite"><h2>${escapeHtml(safeTitle)}</h2>${clean(explanation) ? `<p>${escapeHtml(explanation)}</p>` : ""}${action ? `<div class="ui-state-actions">${action}</div>` : ""}</section>`;
}

export function renderLoadingState({ title, explanation = "" } = {}) {
  const safeTitle = clean(title);
  if (!safeTitle) return "";
  return `<section class="ui-state ui-loading-state" role="status" aria-live="polite" aria-busy="true"><h2>${escapeHtml(safeTitle)}</h2>${clean(explanation) ? `<p>${escapeHtml(explanation)}</p>` : ""}</section>`;
}

export function renderErrorState({ title, explanation = "", primaryAction = null } = {}) {
  const safeTitle = clean(title);
  if (!safeTitle) return "";
  const action = renderOptionalAction(primaryAction);
  return `<section class="ui-state ui-error-state" role="alert" aria-live="assertive"><h2>${escapeHtml(safeTitle)}</h2>${clean(explanation) ? `<p>${escapeHtml(explanation)}</p>` : ""}${action ? `<div class="ui-state-actions">${action}</div>` : ""}</section>`;
}

export function renderPageHeader({ title, eyebrow = "", description = "", primaryAction = null } = {}) {
  const safeTitle = clean(title);
  if (!safeTitle) return "";
  const action = renderOptionalAction(primaryAction);
  return `<header class="ui-page-header"><div class="ui-page-header-copy">${clean(eyebrow) ? `<p class="ui-page-eyebrow">${escapeHtml(eyebrow)}</p>` : ""}<h1>${escapeHtml(safeTitle)}</h1>${clean(description) ? `<p>${escapeHtml(description)}</p>` : ""}</div>${action ? `<div class="ui-page-header-actions">${action}</div>` : ""}</header>`;
}

export function renderTabs({ label, tabs = [] } = {}) {
  const accessibleLabel = clean(label);
  if (!accessibleLabel || !Array.isArray(tabs)) return "";
  const items = tabs.flatMap((tab) => {
    const tabLabel = clean(tab?.label);
    if (!tabLabel) return [];
    const link = renderSafeLink({
      label: tabLabel,
      link: tab.link,
      className: `ui-tab${tab.active === true ? " ui-tab--active" : ""}`,
      ariaLabel: clean(tab.ariaLabel) || tabLabel,
      newTab: false
    });
    if (!link) return [];
    const accessibleLink = link.replace("<a", `<a role="tab" aria-selected="${tab.active === true ? "true" : "false"}"${tab.active === true ? ' aria-current="page"' : ""}`);
    return [`<li role="presentation">${accessibleLink}</li>`];
  }).join("");
  return items ? `<nav class="ui-tabs" aria-label="${escapeAttribute(accessibleLabel)}"><ul role="tablist">${items}</ul></nav>` : "";
}

function renderFilterControl(filter = {}) {
  const id = safeId(filter.id);
  const label = clean(filter.label);
  if (!id || !label) return "";
  const name = safeId(filter.name) || id;
  if (filter.type === "select") {
    const options = Array.isArray(filter.options) ? filter.options.flatMap((option) => {
      const optionLabel = clean(option?.label);
      const value = clean(option?.value);
      if (!optionLabel || !value) return [];
      return [`<option value="${escapeAttribute(value)}"${value === clean(filter.value) ? " selected" : ""}>${escapeHtml(optionLabel)}</option>`];
    }).join("") : "";
    if (!options) return "";
    return `<label for="${id}">${escapeHtml(label)}</label><select id="${id}" name="${name}">${options}</select>`;
  }
  const type = filter.type === "search" ? "search" : "text";
  return `<label for="${id}">${escapeHtml(label)}</label><input id="${id}" name="${name}" type="${type}" value="${escapeAttribute(filter.value)}">`;
}

export function renderFilters({ label, filters = [] } = {}) {
  const accessibleLabel = clean(label);
  if (!accessibleLabel || !Array.isArray(filters)) return "";
  const controls = filters.map(renderFilterControl).filter(Boolean).map((control) => `<div class="ui-filter">${control}</div>`).join("");
  return controls ? `<form class="ui-filters" aria-label="${escapeAttribute(accessibleLabel)}">${controls}</form>` : "";
}

export function renderRecordDrawer({ id, title, subtitle = "", status = null, closeLabel = "Close", tabs = null, body = "", actions = [] } = {}) {
  const drawerId = safeId(id);
  const safeTitle = clean(title);
  const safeCloseLabel = clean(closeLabel);
  if (!drawerId || !safeTitle || !safeCloseLabel) return "";
  const titleId = `${drawerId}-title`;
  const statusHtml = status ? renderStatusChip(status) : "";
  const tabsHtml = tabs ? renderTabs(tabs) : "";
  const actionHtml = Array.isArray(actions) ? actions.map(renderButton).filter(Boolean).join("") : "";
  const closeButton = renderButton({
    label: safeCloseLabel,
    ariaLabel: safeCloseLabel,
    intent: "quiet",
    action: "close-drawer",
    dataAttributes: { target: drawerId }
  });
  return `<aside id="${drawerId}" class="ui-record-drawer" role="dialog" aria-modal="false" aria-labelledby="${titleId}"><header class="ui-record-drawer-header"><div><h2 id="${titleId}">${escapeHtml(safeTitle)}</h2>${clean(subtitle) ? `<p>${escapeHtml(subtitle)}</p>` : ""}${statusHtml}</div>${closeButton}</header>${tabsHtml}<div class="ui-record-drawer-body">${escapeHtml(body)}</div>${actionHtml ? `<footer class="ui-record-drawer-actions">${actionHtml}</footer>` : ""}</aside>`;
}
