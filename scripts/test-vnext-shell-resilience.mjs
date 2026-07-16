import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { classifyShellFailure, SHELL_ERROR_CLASSES } from "./ui/error-classification.mjs";
import {
  FOUNDER_PERMISSION_LABELS,
  founderPermissionLabel,
  permissionLabelForCapabilities
} from "./ui/permission-labels.mjs";
import {
  createShellState,
  INITIAL_VNEXT_LOADING_HTML,
  renderShellLoadingState,
  renderShellState,
  SHELL_STATE_KINDS,
  SHELL_STATE_SCOPES
} from "./ui/shell-states.mjs";
import { shellResilienceBrowserSource } from "./ui/shell-resilience.mjs";
import { buildRouteAccessView, ROUTE_ACCESS_ENDPOINT } from "./shell-resilience-service.mjs";
import { renderShellBoundary } from "./ui/shell-boundary.mjs";
import { ROUTE_COMPATIBILITY_TOTALS } from "./ui/route-compatibility.mjs";

assert.deepEqual(SHELL_STATE_KINDS, ["loading", "error", "unauthorized", "session_expired", "recovery"]);
assert.deepEqual(SHELL_STATE_SCOPES, ["boot", "route", "module"]);
for (const expected of ["session_expired", "unauthorized", "missing_record", "client_render"]) {
  assert(SHELL_ERROR_CLASSES.includes(expected));
}

for (const kind of SHELL_STATE_KINDS) {
  const contract = createShellState({
    kind,
    scope:kind === "loading" ? "boot" : "module",
    title:"Safe title",
    explanation:"Safe explanation",
    retryable:kind === "error"
  });
  assert(Object.isFrozen(contract), `${kind} state should be immutable.`);
  assert.equal(Object.values(contract).some((value) => value instanceof Error), false);
  assert.doesNotMatch(JSON.stringify(contract), /stack|sql|endpoint|environment|token|secret|storage path/i);
}

const loading = renderShellLoadingState({ scope:"boot", title:"Loading Today" });
assert.equal(loading, INITIAL_VNEXT_LOADING_HTML);
assert.match(loading, /aria-busy="true"/);
assert.match(loading, /role="status" aria-live="polite"/);
assert.match(loading, /Loading Today/);
assert.match(loading, /vnext-shell-skeleton/);
assert.doesNotMatch(loading, /\b\d+(?:\.\d+)?%|\$\d|records? ready|metric|revenue|conversion/i);

const errorState = renderShellState({
  kind:"error",
  scope:"module",
  title:"This section could not load",
  explanation:"This part of the page ran into a problem. No records were changed.",
  retryable:true
});
assert.match(errorState, /Try again/);
assert.match(errorState, /Go to Today/);
assert.doesNotMatch(errorState, /TypeError|ReferenceError|\/api\/|stack/i);

const permissionState = renderShellState({
  kind:"unauthorized",
  scope:"route",
  title:"You don’t have access to this page",
  explanation:"Your account needs View private files to open this page. No data was changed.",
  permissionLabel:"View private files"
});
assert.match(permissionState, /View private files/);
assert.doesNotMatch(permissionState, /view_private_assets/);

assert.equal(founderPermissionLabel("view_private_assets"), "View private files");
assert.equal(founderPermissionLabel("manage_roles"), "Manage team roles");
assert.equal(founderPermissionLabel("run_smoke_tests"), "Run application self-checks");
assert.equal(founderPermissionLabel("unknown_capability"), "additional access");
assert.equal(permissionLabelForCapabilities(["unknown_capability", "manage_growth"]), "Manage campaigns and Partner records");
assert(Object.isFrozen(FOUNDER_PERMISSION_LABELS));

assert.equal(classifyShellFailure({ status:401 }).classification, "session_expired");
assert.equal(classifyShellFailure({ status:403, capability:"view_private_assets" }).permissionLabel, "View private files");
assert.equal(classifyShellFailure({ status:404 }).classification, "missing_record");
assert.equal(classifyShellFailure({ name:"AbortError", aborted:true }).classification, "timeout");
assert.equal(classifyShellFailure({ status:429 }).classification, "rate_limited");
assert.equal(classifyShellFailure({ status:503 }).classification, "temporary_failure");
assert.equal(classifyShellFailure({ invalidResponse:true }).classification, "invalid_response");
assert.equal(classifyShellFailure({ clientRender:true }).classification, "client_render");

const routeState = {
  posts:[
    { id:"post-visible", title:"Visible Post", status:"draft" },
    { id:"post-hidden", title:"Protected title", status:"draft", visibility:"owner_only" }
  ],
  tasks:[{ id:"task-visible", title:"Visible Task" }]
};
assert.deepEqual(buildRouteAccessView(routeState, "#today", { role:"operator" }), {
  ok:true,
  allowed:true,
  outcome:"page"
});
assert.deepEqual(buildRouteAccessView(routeState, "#assets", { role:"operator" }), {
  ok:true,
  allowed:false,
  outcome:"unauthorized",
  permissionLabel:"View private files"
});
assert.deepEqual(buildRouteAccessView(routeState, "#social/post/post-visible", { role:"operator" }), {
  ok:true,
  allowed:true,
  outcome:"record"
});
assert.deepEqual(buildRouteAccessView(routeState, "#social/post/post-hidden", { role:"operator" }), {
  ok:true,
  allowed:false,
  outcome:"unavailable"
});
assert.deepEqual(buildRouteAccessView(routeState, "#social/post/not-present", { role:"operator" }), {
  ok:true,
  allowed:false,
  outcome:"unavailable"
});
assert.doesNotMatch(
  JSON.stringify(buildRouteAccessView(routeState, "#social/post/post-hidden", { role:"operator" })),
  /post-hidden|Protected title|View sensitive/i
);

const browserSource = shellResilienceBrowserSource();
for (const behavior of [
  "aria-busy",
  "routeAccessRequests",
  "duplicateRetries",
  "force:true",
  "showSessionExpired",
  "showRecovery",
  "vnext:request-close-global-search",
  "vnext:request-close-global-create",
  "unhandledrejection",
  "window.__LE_FAIL_BOOT",
  "No records were changed",
  "Publishing is off"
]) {
  assert(browserSource.includes(behavior), `${behavior} should remain in the resilience browser contract.`);
}
assert.doesNotMatch(browserSource, /console\.error|console\.warn|resubmit|\/api\/debug/);
assert.match(browserSource, new RegExp(ROUTE_ACCESS_ENDPOINT.replaceAll("/", "\\/")));

const uiSources = await Promise.all([
  "permission-labels.mjs",
  "error-classification.mjs",
  "shell-states.mjs",
  "shell-resilience.mjs"
].map((name) => readFile(new URL(`./ui/${name}`, import.meta.url), "utf8")));
for (const source of uiSources) {
  assert.doesNotMatch(source, /from ["'][^"']*(?:storage|database|network|send|publish|preview-server|business-engine)/i);
  assert.doesNotMatch(source, /process\.env|readFile|writeFile|createServer/);
}

const serverSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const shellSource = await readFile(new URL("./ui/app-shell.mjs", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../assets/ui/desktop-shell.css", import.meta.url), "utf8");
assert.match(serverSource, /ROUTE_ACCESS_ENDPOINT/);
assert.match(serverSource, /buildRouteAccessView\(currentState/);
assert.match(serverSource, /renderSafeBootShell/);
assert.match(serverSource, /window\.addEventListener\("error"/);
assert.match(serverSource, /window\.addEventListener\("unhandledrejection"/);
assert.match(serverSource, /url\.pathname === "\/api\/health"/);
assert.match(serverSource, /\{ status: "ok" \}/);
assert.match(shellSource, /INITIAL_VNEXT_LOADING_HTML/);
assert.match(shellSource, /shellResilienceBrowserSource/);
assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(cssSource, /\.vnext-shell-state/);

assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);

const legacyFixture = "<html><body>legacy flag-off shell byte fixture</body></html>";
assert.equal(renderShellBoundary({
  config:{ enabled:false },
  renderLegacyApp:() => legacyFixture,
  renderVNextApp:() => "changed"
}), legacyFixture);
assert.equal(renderShellBoundary({
  config:{ enabled:true },
  renderLegacyApp:() => legacyFixture,
  renderVNextApp:() => "vnext"
}), "vnext");

console.log("PASS test-vnext-shell-resilience");
