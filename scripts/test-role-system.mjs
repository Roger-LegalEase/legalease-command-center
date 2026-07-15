import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyRoleAssignmentChange,
  buildRoleSystemStatus,
  canAccessRoute,
  canPerformEndpoint,
  defaultHostedOwnerRole,
  resolveActorRole,
  roleCapabilities,
  roleDefinitions,
  roleHasCapability,
  roles
} from "./roles.mjs";
import { actorFromRequest, authorizeRequest } from "./access-control.mjs";

const serverSource = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
const osHealthSource = readFileSync(new URL("./os-health.mjs", import.meta.url), "utf8");
const accessControlSource = readFileSync(new URL("./access-control.mjs", import.meta.url), "utf8");

assert.deepEqual(roles, ["owner", "admin", "operator", "viewer"], "Role helper should expose the four internal OS roles.");
assert.equal(defaultHostedOwnerRole, "owner", "Hosted owner token should resolve to owner by default.");
for (const role of roles) {
  assert(roleDefinitions[role], `${role} role definition should exist.`);
  assert(Array.isArray(roleCapabilities[role]), `${role} should have a capability list.`);
}

assert.equal(resolveActorRole({ role: "owner" }), "owner", "Explicit owner actor should resolve to owner.");
assert.equal(resolveActorRole({ id: "local_operator", role: "owner" }, {}, { hostedMode: false }), "owner", "Local owner should resolve to owner.");
assert.equal(resolveActorRole({}, {}, { hostedMode: true }), "viewer", "Missing hosted actor should fail closed to viewer/read-only.");

assert.equal(roleHasCapability("owner", "manage_roles"), true, "Owner can manage roles.");
assert.equal(roleHasCapability("admin", "manage_roles"), false, "Admin cannot manage roles.");
assert.equal(roleHasCapability("operator", "approve_final_artifact"), false, "Operator cannot approve final artifacts.");
assert.equal(roleHasCapability("viewer", "mutate_state"), false, "Viewer cannot mutate state.");
assert.equal(roleHasCapability("admin", "update_review_state"), true, "Admin can update review states.");
assert.equal(roleHasCapability("operator", "route_captures"), true, "Operator can route captures.");
assert.equal(roleHasCapability("operator", "export_state_snapshot"), false, "Operator cannot export state snapshots.");

for (const route of ["overview", "tasks", "morning-brief", "evening-reflection", "production-activation-rcap", "evidence-room", "os-health"]) {
  assert.equal(canAccessRoute("viewer", route), false, `Viewer must not read internal #${route}.`);
}
assert.equal(canAccessRoute("viewer", "roles"), false, "Viewer cannot view Roles page.");
assert.equal(canPerformEndpoint("viewer", "POST", "/api/operating-memory/today/save").ok, false, "Viewer cannot save operating memory.");
assert.equal(canPerformEndpoint("admin", "POST", "/api/roles/assignments").ok, false, "Admin cannot manage role assignments.");
assert.equal(canPerformEndpoint("owner", "POST", "/api/roles/assignments").ok, true, "Owner can manage role assignments.");
assert.equal(canPerformEndpoint("operator", "POST", "/api/production-activation/rcap/review-state", { review_state: "approved" }).ok, false, "Operator cannot approve final artifacts.");
assert.equal(canPerformEndpoint("operator", "POST", "/api/production-activation/rcap/review-state", { review_state: "in_review" }).ok, true, "Operator can mark artifacts in review.");

const env = {
  STORAGE_BACKEND: "supabase",
  LOCAL_DEMO_MODE: "false",
  COMMAND_CENTER_OWNER_TOKEN: "owner-token-role-test-1234567890",
  COMMAND_CENTER_ADMIN_TOKEN: "admin-token-role-test-1234567890",
  COMMAND_CENTER_OPERATOR_TOKEN: "operator-token-role-test-1234567890",
  COMMAND_CENTER_VIEWER_TOKEN: "viewer-token-role-test-1234567890"
};

assert.equal(actorFromRequest({ headers: { authorization: "Bearer owner-token-role-test-1234567890" } }, env).authenticated, false, "Bootstrap credentials are not bearer sessions.");

const viewerMutation = authorizeRequest(
  { method: "POST", url: "/api/operating-memory/today/save", headers: {}, authenticatedActor:{ id:"viewer-session", role:"viewer", authenticated:true } },
  new URL("http://local/api/operating-memory/today/save"),
  env
);
assert.equal(viewerMutation.ok, false, "Viewer mutating endpoint should be denied.");
assert.equal(viewerMutation.status, 403, "Viewer mutation denial should be a role/capability 403.");

const adminManageRoles = authorizeRequest(
  { method: "POST", url: "/api/roles/assignments", headers: {}, authenticatedActor:{ id:"admin-session", role:"admin", authenticated:true } },
  new URL("http://local/api/roles/assignments"),
  env
);
assert.equal(adminManageRoles.ok, false, "Admin role management should be denied.");

const ownerManageRoles = authorizeRequest(
  { method: "POST", url: "/api/roles/assignments", headers: {}, authenticatedActor:{ id:"owner-session", role:"owner", authenticated:true } },
  new URL("http://local/api/roles/assignments"),
  env
);
assert.equal(ownerManageRoles.ok, true, "Owner role management should be allowed.");

const baseState = { roleAssignments: [], auditHistory: [], activityEvents: [], runtime: { livePostingGates: {} } };
const changed = applyRoleAssignmentChange(baseState, {
  actor_id: "ops-1",
  display_name: "Ops Reviewer",
  email: null,
  role: "operator",
  status: "active",
  notes: "Internal operator only."
}, { actor: "owner" });
assert.equal(changed.state.roleAssignments.length, 2, "Role changes should preserve default owner and add assignment.");
assert.equal(changed.state.auditHistory[0].action, "role assignment updated", "Role change should create audit entry.");
assert.equal(changed.state.activityEvents[0].eventType, "Role assignment updated", "Role change should create activity event.");

const deactivated = applyRoleAssignmentChange(changed.state, {
  actor_id: "ops-1",
  status: "inactive",
  notes: "Access paused."
}, { actor: "owner", action: "deactivate" });
assert.equal(deactivated.state.roleAssignments.find(item => item.actor_id === "ops-1").status, "inactive", "Deactivate should mark role assignment inactive.");

const status = buildRoleSystemStatus(changed.state, { currentActor: { role: "owner" } });
assert.equal(status.status, "protected", "Role system should report protected status.");
assert.equal(status.current_role, "owner", "Role system should expose current role.");
assert.equal(status.partner_journey_access_excluded, true, "Partner Journey access must be explicitly excluded.");
assert.equal(status.live_gates_count, 0, "Live gates must remain 0.");
assert.equal(status.warnings.some(item => /viewer can mutate/i.test(item.title)), false, "Viewer mutation warning should not be present.");
assert.equal(status.warnings.some(item => /non-owner can manage roles/i.test(item.title)), false, "Non-owner role management warning should not be present.");

assert(serverSource.includes("rolesPageHtml"), "#roles route renderer should exist.");
assert(serverSource.includes("\"roles\""), "#roles route should be registered.");
assert(serverSource.includes("cockpitRoleProtectionHtml"), "Cockpit Role Protection card should render.");
assert(serverSource.includes("Partner access belongs to Partner Journey OS, not this internal OS."), "Roles page must explicitly exclude Partner Journey access.");
assert(serverSource.includes("/api/roles/assignments"), "Role assignment endpoint should exist.");
assert(serverSource.includes("roleAssignments"), "Role assignments collection should be present in active state.");
assert(accessControlSource.includes("requiredCapabilitiesForEndpoint"), "Access control should enforce role endpoint capabilities.");
assert(osHealthSource.includes("role_system_status"), "OS Health should include role system status.");
assert(!/enable live|publish partner page|activate dashboard|send email/i.test(serverSource.match(/function rolesPageHtml[\s\S]*?function [a-zA-Z0-9_]+\(/)?.[0] || ""), "Roles page must not render external action controls.");

console.log("Role system tests passed.");
