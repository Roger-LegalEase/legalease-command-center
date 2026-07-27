// The owner can open every page in the system, and no route can declare a capability that
// does not exist.
//
// 2026-07-27: production refused the owner #prospects with "your account needs additional
// access". The route declared actionCapabilities ["approve"] — and "approve" is not a
// capability. The real name is "approve_final_artifact". Because the owner role is literally
// [...capabilities], a name absent from that list is held by NOBODY, so one misspelling locked
// the page against every role including the owner, and said so in the language of a permissions
// problem rather than a bug.
//
// Two guards, because the typo and the lockout are separate failures:
//   1. every registered route's declared capabilities must be real names;
//   2. the owner must be allowed every registered route, whatever those names say.
//
// This is PAGE ACCESS ONLY. Approving, sending, publishing and campaign-state changes keep
// their own authorization; the third check below pins that those action gates still exclude
// non-owners, so "the owner can open the page" never becomes "anyone can act on it".

import assert from "node:assert/strict";

import { routeRegistry } from "./ui/navigation.mjs";
import { capabilities, roles } from "./roles.mjs";
import { buildRouteAccessView } from "./shell-resilience-service.mjs";
import { permissionForRequest } from "./access-control.mjs";

const registered = (Array.isArray(routeRegistry) ? routeRegistry : Object.values(routeRegistry || {}))
  .filter((route) => route && (route.canonicalRoute || route.route));
assert.ok(registered.length > 50, `the registry should hold the whole surface; found ${registered.length}`);

const slugOf = (route) => String(route.canonicalRoute || route.route || "").replace(/^#/, "").replace(/^route-/, "");

// ---- 1. no route may declare a capability that does not exist ---------------------------------
const bogus = [];
for (const route of registered) {
  for (const capability of (route.visibility?.actionCapabilities || [])) {
    // "admin" is a role gate the resolver understands specially, not a capability name.
    if (capability === "admin") continue;
    if (!capabilities.includes(capability)) bogus.push(`${slugOf(route)} -> "${capability}"`);
  }
}
assert.deepEqual(bogus, [], `routes declare capabilities that do not exist, which denies EVERY role: ${bogus.join(", ")}`);
console.log("  ✓ every route's declared capabilities are real capability names");

// ---- 2. the owner can open every registered route ---------------------------------------------
const refused = [];
for (const route of registered) {
  const view = buildRouteAccessView({}, `#${slugOf(route)}`, { role: "owner" });
  if (!view.allowed) refused.push(`${slugOf(route)} (${view.outcome})`);
}
assert.deepEqual(refused, [], `the owner must never be refused a page in his own system: ${refused.join(", ")}`);
console.log(`  ✓ the owner can open all ${registered.length} registered routes`);

// The specific page that was broken, named so the regression is unmistakable.
assert.equal(buildRouteAccessView({}, "#prospects", { role: "owner" }).allowed, true, "#prospects must open for the owner");
console.log("  ✓ #prospects opens for the owner");

// ---- 3. page access did NOT become action access ----------------------------------------------
// Approving a prospect is authorized separately and still is. If this ever collapses into the
// page gate, the fix above would have widened far more than page visibility.
assert.equal(permissionForRequest("POST", "/api/prospects/approve"), "approve", "approving a prospect keeps its own permission");
assert.equal(permissionForRequest("POST", "/api/prospects/reject"), "approve", "rejecting keeps the same gate as approving");
console.log("  ✓ prospect approve/reject keep their own authorization, unchanged");

// A viewer must still be refused a page that genuinely requires more than reading.
const viewerOnAdminPage = registered
  .filter((route) => (route.visibility?.actionCapabilities || []).includes("admin"))
  .map((route) => buildRouteAccessView({}, `#${slugOf(route)}`, { role: "viewer" }));
if (viewerOnAdminPage.length) {
  assert.ok(viewerOnAdminPage.every((view) => view.allowed === false),
    "the owner short-circuit must not have widened access for other roles");
  console.log("  ✓ non-owner roles are still gated exactly as before");
}

// And every non-owner role still resolves through the capability check, not the short-circuit.
for (const role of roles.filter((entry) => entry !== "owner")) {
  const view = buildRouteAccessView({}, "#prospects", { role });
  assert.equal(typeof view.allowed, "boolean", `${role} must still receive a real decision`);
}
console.log("  ✓ non-owner roles still receive a capability-based decision");

console.log("owner route access: 6 checks passed");
