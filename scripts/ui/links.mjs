import { escapeAttribute, escapeHtml } from "./html.mjs";

const clean = (value = "") => String(value ?? "").trim();

// Canonical source-link policy extracted from company-memory.mjs. Keep this
// page/external contract stable: exact record deep links use sourceRef instead.
export function normalizeSourceLink(input) {
  if (!input || typeof input !== "object") return null;
  const target = clean(input.target);
  if (!target) return null;
  if (input.kind === "external") {
    return /^https:\/\/[^\s]+$/i.test(target) ? { kind: "external", target } : null;
  }
  const page = target.replace(/^#/, "");
  return /^[a-z0-9-]+$/i.test(page) ? { kind: "page", target: `#${page}` } : null;
}

export function normalizeRecordDeepLink(input = {}) {
  if (!input || typeof input !== "object") return null;
  const collection = clean(input.collection);
  const itemId = clean(input.itemId);
  if (!collection || !itemId || !/^[a-z0-9_-]+$/i.test(collection)) return null;
  return {
    kind: "record",
    target: `#item/${collection}/${encodeURIComponent(itemId)}`
  };
}

export function safeLinkDetails(input) {
  const normalized = input?.kind === "record"
    ? normalizeRecordDeepLink(input)
    : normalizeSourceLink(input);
  if (!normalized) return null;
  if (/[\u0000-\u001f\u007f<>"'`]/.test(normalized.target)) return null;
  return Object.freeze({
    href: normalized.target,
    external: normalized.kind === "external",
    kind: normalized.kind
  });
}

function safeClassName(value = "") {
  const className = clean(value);
  return /^[a-z0-9 _-]*$/i.test(className) ? className.replace(/\s+/g, " ") : "";
}

export function renderSafeLink({ label, link, className = "", ariaLabel = "", icon = "", newTab } = {}) {
  const visibleLabel = clean(label);
  const details = safeLinkDetails(link);
  if (!visibleLabel || !details) return "";
  const classes = safeClassName(className);
  const accessibleName = clean(ariaLabel) || visibleLabel;
  const openInNewTab = details.external && newTab !== false;
  const iconHtml = clean(icon)
    ? `<span class="ui-control-icon" aria-hidden="true">${escapeHtml(icon)}</span>`
    : "";
  return `<a${classes ? ` class="${escapeAttribute(classes)}"` : ""} href="${escapeAttribute(details.href)}" aria-label="${escapeAttribute(accessibleName)}"${openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>${iconHtml}<span>${escapeHtml(visibleLabel)}</span></a>`;
}
