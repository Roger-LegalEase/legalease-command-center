import { escapeAttribute, escapeHtml } from "./html.mjs";

export const ACTION_STATUS_KINDS = Object.freeze([
  "informational",
  "working",
  "success",
  "error"
]);

const clean = (value = "") => String(value ?? "").trim();

export function createActionStatus({ kind = "informational", title, message = "" } = {}) {
  const safeKind = ACTION_STATUS_KINDS.includes(kind) ? kind : "informational";
  const safeTitle = clean(title);
  if (!safeTitle) return null;
  return Object.freeze({
    kind: safeKind,
    title: safeTitle,
    message: clean(message),
    busy: safeKind === "working"
  });
}

export function renderActionStatus(input = {}) {
  const status = createActionStatus(input);
  if (!status) return "";
  const isError = status.kind === "error";
  return `<div class="ui-action-status ui-action-status--${status.kind}" role="${isError ? "alert" : "status"}" aria-live="${isError ? "assertive" : "polite"}"${status.busy ? ' aria-busy="true"' : ""} data-state="${escapeAttribute(status.kind)}"><strong>${escapeHtml(status.title)}</strong>${status.message ? `<p>${escapeHtml(status.message)}</p>` : ""}</div>`;
}

export function createConfirmationContract({ action, title, consequence, destructive = false } = {}) {
  const actionLabel = clean(action);
  const confirmationTitle = clean(title);
  const consequenceText = clean(consequence);
  if (!actionLabel || !confirmationTitle || !consequenceText) return null;
  return Object.freeze({
    action: actionLabel,
    title: confirmationTitle,
    consequence: consequenceText,
    destructive: destructive === true,
    approvalValue: "confirm",
    dismissalValue: "dismiss"
  });
}

export function confirmationWasApproved(contract, response) {
  return Boolean(contract && response === contract.approvalValue && response !== contract.dismissalValue);
}
