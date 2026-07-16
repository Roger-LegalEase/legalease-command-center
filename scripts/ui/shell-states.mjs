import { escapeAttribute, escapeHtml } from "./html.mjs";
import { renderButton, renderPageHeader } from "./primitives.mjs";

export const SHELL_STATE_KINDS = Object.freeze([
  "loading",
  "error",
  "unauthorized",
  "session_expired",
  "recovery"
]);

export const SHELL_STATE_SCOPES = Object.freeze(["boot", "route", "module"]);

const clean = (value = "") => String(value ?? "").trim();

export function createShellState(input = {}) {
  const kind = SHELL_STATE_KINDS.includes(input.kind) ? input.kind : "error";
  const scope = SHELL_STATE_SCOPES.includes(input.scope) ? input.scope : "module";
  const state = {
    kind,
    scope,
    title:clean(input.title) || (kind === "loading" ? "Loading" : "This page could not load"),
    explanation:clean(input.explanation),
    unchangedMessage:clean(input.unchangedMessage),
    permissionLabel:clean(input.permissionLabel),
    retryable:input.retryable === true,
    retryLabel:clean(input.retryLabel),
    safeBackHref:clean(input.safeBackHref),
    supportReference:clean(input.supportReference).slice(0, 32)
  };
  return Object.freeze(Object.fromEntries(Object.entries(state).filter(([, value]) => value !== "")));
}

function actionButton({ label, action, intent = "secondary", loading = false } = {}) {
  return renderButton({
    label,
    intent,
    action,
    loading,
    workingLabel:"Working"
  });
}

export function renderShellLoadingState(input = {}) {
  const state = createShellState({
    kind:"loading",
    scope:input.scope || "boot",
    title:input.title || "Loading Today",
    explanation:input.explanation || "Command Center is getting this page ready."
  });
  return `<section class="vnext-shell-state vnext-shell-loading" data-vnext-shell-state="loading" data-state-scope="${escapeAttribute(state.scope)}" aria-busy="true" aria-labelledby="vnext-shell-loading-title">
    <p class="vnext-shell-live" role="status" aria-live="polite">${escapeHtml(state.title)}.</p>
    <div class="vnext-shell-skeleton" aria-hidden="true">
      <div class="vnext-skeleton-eyebrow"></div>
      <div class="vnext-skeleton-title"></div>
      <div class="vnext-skeleton-copy"></div>
      <div class="vnext-skeleton-grid">
        <div class="vnext-skeleton-card"><span></span><span></span><span></span></div>
        <div class="vnext-skeleton-card"><span></span><span></span><span></span></div>
      </div>
    </div>
    <h1 id="vnext-shell-loading-title" class="vnext-visually-hidden">${escapeHtml(state.title)}</h1>
  </section>`;
}

export function renderShellState(input = {}) {
  const state = createShellState(input);
  if (state.kind === "loading") return renderShellLoadingState(state);
  const isError = state.kind === "error";
  const role = isError ? "alert" : "status";
  const live = isError ? "assertive" : "polite";
  const unchanged = state.unchangedMessage || (state.kind === "recovery"
    ? "Publishing is off."
    : state.kind === "session_expired"
      ? ""
      : "No data was changed.");
  const actions = [];
  if (state.kind === "session_expired") {
    actions.push(actionButton({ label:"Sign in again", action:"shell-sign-in", intent:"primary" }));
  } else if (state.kind === "recovery") {
    actions.push(actionButton({ label:state.retryLabel || "Try full app again", action:"shell-retry", intent:"primary" }));
    actions.push(actionButton({ label:"Sign out", action:"shell-sign-out" }));
  } else {
    if (state.retryable) {
      actions.push(actionButton({
        label:state.retryLabel || "Try again",
        action:"shell-retry",
        intent:"primary",
        loading:input.retryPending === true
      }));
    }
    actions.push(actionButton({ label:"Go back", action:"shell-go-back" }));
    actions.push(renderButton({
      label:"Go to Today",
      variant:"link",
      intent:"secondary",
      link:{ kind:"page", target:"#today" }
    }));
  }
  const permission = state.kind === "unauthorized" && state.permissionLabel
    ? `<p class="vnext-shell-permission"><strong>Access needed:</strong> ${escapeHtml(state.permissionLabel)}</p>`
    : "";
  const reference = state.supportReference
    ? `<p class="vnext-shell-reference">Support reference: ${escapeHtml(state.supportReference)}</p>`
    : "";
  return `<section class="vnext-shell-state vnext-shell-state--${escapeAttribute(state.kind)}" data-vnext-shell-state="${escapeAttribute(state.kind)}" data-state-scope="${escapeAttribute(state.scope)}" role="${role}" aria-live="${live}">
    ${renderPageHeader({ title:state.title, description:state.explanation })}
    ${permission}
    ${unchanged ? `<p class="vnext-shell-unchanged">${escapeHtml(unchanged)}</p>` : ""}
    ${reference}
    <div class="vnext-shell-state-actions">${actions.filter(Boolean).join("")}</div>
  </section>`;
}

export const INITIAL_VNEXT_LOADING_HTML = renderShellLoadingState({
  kind:"loading",
  scope:"boot",
  title:"Loading Today"
});
