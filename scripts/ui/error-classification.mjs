import { founderPermissionLabel } from "./permission-labels.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const SHELL_ERROR_CLASSES = Object.freeze([
  "session_expired",
  "unauthorized",
  "missing_record",
  "timeout",
  "rate_limited",
  "temporary_failure",
  "invalid_response",
  "client_render"
]);

function immutable(value) {
  return Object.freeze(value);
}

export function classifyShellFailure(input = {}) {
  const status = Number(input?.status || 0);
  const name = clean(input?.name);
  const kind = status === 401
    ? "session_expired"
    : status === 403
      ? "unauthorized"
      : status === 404
        ? "missing_record"
        : status === 429
          ? "rate_limited"
          : input?.aborted === true || /abort|timeout/i.test(name)
            ? "timeout"
            : input?.invalidResponse === true
              ? "invalid_response"
              : input?.clientRender === true
                ? "client_render"
                : "temporary_failure";

  if (kind === "session_expired") {
    return immutable({
      classification:kind,
      stateKind:"session_expired",
      title:"Your session ended",
      explanation:"Sign in again to continue. No records were changed.",
      retryable:false
    });
  }
  if (kind === "unauthorized") {
    return immutable({
      classification:kind,
      stateKind:"unauthorized",
      title:"You don’t have access to this page",
      explanation:`Your account needs ${founderPermissionLabel(input?.capability)} to open this page. No data was changed.`,
      permissionLabel:founderPermissionLabel(input?.capability),
      retryable:false
    });
  }
  if (kind === "missing_record") {
    return immutable({
      classification:kind,
      stateKind:"error",
      title:"Record not available",
      explanation:"This record is not available. It may have been removed, or this account may not be allowed to view it.",
      retryable:false
    });
  }
  return immutable({
    classification:kind,
    stateKind:"error",
    title:"This page could not load",
    explanation:"The page is temporarily unavailable. No records were changed.",
    retryable:true
  });
}
