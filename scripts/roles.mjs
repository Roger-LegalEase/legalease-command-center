const clean = (value = "") => String(value || "").trim();
const lower = (value = "") => clean(value).toLowerCase();

export const defaultHostedOwnerRole = "owner";

export const roles = ["owner", "admin", "operator", "viewer"];

export const capabilities = [
  "read_internal",
  "mutate_state",
  "run_internal_activation",
  "update_review_state",
  "approve_final_artifact",
  "generate_handoff_packet",
  "generate_handoff_contract_preview",
  "refresh_os_health",
  "run_smoke_tests",
  "generate_evidence_summary",
  "view_data_integrity",
  "refresh_data_integrity",
  "export_state_snapshot",
  "restore_dry_run",
  "manage_roles",
  "view_audit_history",
  "route_captures",
  "manage_tasks",
  "save_daily_rituals",
  "save_operating_memory",
  "save_closeout",
  "add_notes",
  "manage_growth",
  "manage_content_drafts",
  "manage_approval_queue",
  "manage_autonomy"
  ,"social_publish"
  ,"read_sensitive"
  ,"view_aggregate_reports"
  ,"view_private_assets"
  ,"view_diagnostics"
];

export const roleCapabilities = {
  owner: [...capabilities],
  admin: [
    "read_internal",
    "mutate_state",
    "run_internal_activation",
    "update_review_state",
    "approve_final_artifact",
    "generate_handoff_packet",
    "generate_handoff_contract_preview",
    "refresh_os_health",
    "run_smoke_tests",
    "generate_evidence_summary",
    "view_data_integrity",
    "refresh_data_integrity",
    "view_audit_history",
    "route_captures",
    "manage_tasks",
    "save_daily_rituals",
    "save_operating_memory",
    "save_closeout",
    "add_notes",
    "manage_growth",
    "manage_content_drafts",
    "manage_approval_queue",
    "manage_autonomy",
    "read_sensitive",
    "view_private_assets",
    "view_diagnostics"
  ],
  operator: [
    "read_internal",
    "mutate_state",
    "update_review_state",
    "route_captures",
    "manage_tasks",
    "save_daily_rituals",
    "save_operating_memory",
    "save_closeout",
    "add_notes"
  ],
  viewer: ["view_aggregate_reports"]
};

const legacyPermissions = {
  owner: ["read", "write", "admin", "approve", "publish_review", "compliance_review", "view_investor", "view_partner"],
  admin: ["read", "write", "admin", "approve", "compliance_review", "view_investor", "view_partner"],
  operator: ["read", "write", "approve", "compliance_review"],
  viewer: ["view_investor", "view_partner", "view_aggregate_reports"]
};

export const roleDefinitions = Object.fromEntries(roles.map(role => [role, {
  label: role === "owner" ? "Owner" : role === "admin" ? "Admin" : role === "operator" ? "Operator" : "Viewer",
  can: [...new Set([...legacyPermissions[role], ...roleCapabilities[role]])]
}]));

const legacyRoleMap = {
  marketing: "operator",
  reviewer: "operator",
  compliance_reviewer: "operator",
  investor_readonly: "viewer",
  partner: "viewer",
  local_operator: "owner",
  owner_token: "owner"
};

export function normalizeRole(role = "") {
  const normalized = lower(role);
  return roles.includes(normalized) ? normalized : legacyRoleMap[normalized] || "viewer";
}

export function roleHasCapability(role = "", capability = "") {
  return roleCapabilities[normalizeRole(role)].includes(capability);
}

export const readOnlyRoutes = [
  "overview",
  "focus",
  "growth",
  "partner-hub",
  "production",
  "proof",
  "more",
  "tasks",
  "tasks-today",
  "tasks-blocked",
  "tasks-waiting",
  "tasks-this-week",
  "production-activation-rcap",
  "operating-memory",
  "morning-brief",
  "evening-reflection",
  "daily-closeout",
  "os-health",
  "smoke-test",
  "evidence-room",
  "handoff-contract",
  "operator-manual",
  "data-integrity",
  "operator-search",
  "conversation-notes",
  "capture-inbox",
  "roles",
  "partner-programs",
  "partner-pages",
  "partner-dashboards",
  "partner-reports",
  "partner-proposals",
  "partners",
  "campaigns",
  "funnel",
  "content-bank",
  "queue",
  "assets",
  "posted",
  "reports",
  "dataroom",
  "metrics",
  "settings"
];

export function canAccessRoute(role = "", route = "") {
  const normalizedRoute = lower(route).replace(/^#/, "") || "overview";
  if (!readOnlyRoutes.includes(normalizedRoute)) return roleHasCapability(role, "read_internal");
  return roleHasCapability(role, "read_internal");
}

function isFinalArtifactState(input = {}) {
  const reviewState = lower(input.review_state || input.reviewState || input.status || "");
  return ["approved", "handoff_ready"].includes(reviewState);
}

export function requiredCapabilitiesForEndpoint(method = "GET", pathname = "/", input = {}) {
  const verb = String(method || "GET").toUpperCase();
  const path = String(pathname || "/");
  if (verb === "GET" && path === "/api/ui/route-access") return ["read_internal"];
  if (verb === "GET" && path === "/api/ui/search") return ["read_internal"];
  if (verb === "GET" && path === "/api/ui/today") return ["read_internal"];
  if (verb === "GET" && path === "/api/ui/inbox") return ["read_internal"];
  if (verb === "GET" && path === "/api/ui/social") return ["read_internal"];
  if (verb === "GET" && /^\/api\/ui\/social\/post\/[^/]+\/composer$/.test(path)) return ["read_internal"];
  if (verb === "POST" && /^\/api\/ui\/social\/post\/[^/]+\/save$/.test(path)) return ["manage_content_drafts"];
  if (verb === "GET" && path === "/api/ui/quick-capture/capabilities") return ["read_internal"];
  if (verb === "POST" && path === "/api/ui/quick-capture") return ["read_internal"];
  if (verb === "POST" && path === "/api/ui/inbox/action") return ["read_internal"];
  if (verb === "POST" && path === "/api/ui/create/post") return ["manage_content_drafts"];
  if (verb === "POST" && ["/api/ui/create/campaign", "/api/ui/create/partner", "/api/ui/create/file"].includes(path)) return ["manage_growth"];
  if (verb === "POST" && path === "/api/ui/create/note") return ["route_captures"];
  if (verb === "GET" && path === "/api/reports/aggregate") return ["view_aggregate_reports"];
  if (verb === "GET" && (["/api/ready", "/api/metrics", "/api/auth/diagnostics", "/api/production/readiness", "/api/health/supabase"].includes(path) || path.startsWith("/api/storage"))) return ["view_diagnostics"];
  if (path.startsWith("/api/assets/") || /^\/assets\/uploads\//.test(path) || /^\/data\/(exports|assets|backups)\//.test(path) || /\/final-png$/.test(path)) return ["view_private_assets"];
  if (path === "/api/publishing/reconciliation") return ["social_publish"];
  if (/^\/api\/posts\/[^/]+\/upload-public-image$/.test(path) || path === "/api/posts/batch-upload-public-images") return ["social_publish"];
  if (["GET", "HEAD", "OPTIONS"].includes(verb)) return ["read_internal"];
  if (/^\/api\/(linkedin\/publish|publishing\/run|posts\/.*\/publish)/.test(path)) return ["social_publish"];
  if (path === "/api/roles/assignments" || path === "/api/roles/assignments/deactivate") return ["manage_roles"];
  if (path === "/api/production-activation/rcap/start") return ["run_internal_activation"];
  if (path === "/api/production-activation/rcap/review-state") {
    return isFinalArtifactState(input) ? ["approve_final_artifact"] : ["update_review_state"];
  }
  if (path === "/api/production-activation/rcap/handoff-packet") return ["generate_handoff_packet"];
  if (path === "/api/production-activation/rcap/handoff-contract-preview") return ["generate_handoff_contract_preview"];
  if (path === "/api/os-health/refresh") return ["refresh_os_health"];
  if (/^\/api\/smoke-test(\/|$)/.test(path)) return ["run_smoke_tests"];
  if (path === "/api/evidence-room/summary") return ["generate_evidence_summary"];
  if (path === "/api/data-integrity/refresh") return ["refresh_data_integrity"];
  if (path === "/api/operating-memory/today/save") return ["save_operating_memory"];
  if (/^\/api\/(morning-brief|evening-reflection)\/today\/save$/.test(path)) return ["save_daily_rituals"];
  if (/^\/api\/daily-closeout\/today\/save$/.test(path) || path === "/api/daily-closeout/tomorrow-plan/generate") return ["save_closeout"];
  if (path === "/api/capture-inbox" || /^\/api\/capture-inbox\/[^/]+\/[^/]+$/.test(path)) return ["route_captures"];
  if (path === "/api/conversation-notes" || /^\/api\/conversation-notes\/[^/]+\/[^/]+$/.test(path)) return ["add_notes"];
  if (path === "/api/tasks/rebuild" || /^\/api\/tasks\//.test(path)) return ["manage_tasks"];
  if (path === "/api/operator-search/action") return ["mutate_state"];
  if (/^\/api\/growth-inbox/.test(path)) return ["manage_growth"];
  if (/^\/api\/content-bank/.test(path)) return ["manage_content_drafts"];
  if (/^\/api\/approval/.test(path)) return ["manage_approval_queue"];
  if (/^\/api\/autonomy/.test(path)) return ["manage_autonomy"];
  if (/export-state-snapshot|state-snapshot|\/api\/state\/export/.test(path)) return ["export_state_snapshot"];
  if (/restore-dry-run|\/api\/restore-state-dry-run/.test(path)) return ["restore_dry_run"];
  return ["mutate_state"];
}

export function canPerformEndpoint(role = "", method = "GET", pathname = "/", input = {}) {
  const normalizedRole = normalizeRole(role);
  const required = requiredCapabilitiesForEndpoint(method, pathname, input);
  const missing = required.filter(capability => !roleHasCapability(normalizedRole, capability));
  return {
    ok: missing.length === 0,
    role: normalizedRole,
    requiredCapabilities: required,
    missingCapabilities: missing,
    reason: missing.length ? `Role ${normalizedRole} lacks ${missing.join(", ")}.` : "Allowed."
  };
}

export function assertRoleCan(role = "", capability = "", details = {}) {
  if (roleHasCapability(role, capability)) return { ok: true, role: normalizeRole(role), capability };
  return {
    ok: false,
    status: 403,
    role: normalizeRole(role),
    capability,
    reason: details.reason || `Role ${normalizeRole(role)} cannot perform ${capability}.`
  };
}

export function resolveActorRole(actor = {}, state = {}, options = {}) {
  if (actor?.authenticated && actor.role) return normalizeRole(actor.role);
  if (actor?.role) return normalizeRole(actor.role);
  if (!options.hostedMode && !actor?.authRequired) return "owner";
  const activeOwner = list(state.roleAssignments).find(item => item.actor_id === "owner" && item.status !== "inactive");
  if (activeOwner) return normalizeRole(activeOwner.role);
  return "viewer";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

export function defaultRoleAssignments(options = {}) {
  const timestamp = isoNow(options);
  return [{
    id: "role-owner-default",
    actor_id: "owner",
    display_name: "Roger Roman",
    email: null,
    role: "owner",
    status: "active",
    created_at: timestamp,
    updated_at: timestamp,
    created_by: "system",
    notes: "Default hosted owner-token actor. Partner access belongs to Partner Journey OS, not this internal OS."
  }];
}

export function ensureRoleAssignments(state = {}, options = {}) {
  const existing = list(state.roleAssignments);
  const hasOwner = existing.some(item => item.actor_id === "owner" && normalizeRole(item.role) === "owner" && item.status !== "inactive");
  if (hasOwner) return existing.map(normalizeAssignment);
  return [...defaultRoleAssignments(options), ...existing.map(normalizeAssignment)];
}

function normalizeAssignment(input = {}, options = {}) {
  const timestamp = isoNow(options);
  const actorId = clean(input.actor_id || input.actorId || input.id || "owner") || "owner";
  const role = normalizeRole(input.role || (actorId === "owner" ? "owner" : "viewer"));
  return {
    id: input.id || `role-${actorId}`,
    actor_id: actorId,
    display_name: input.display_name || input.displayName || (actorId === "owner" ? "Roger Roman" : actorId),
    email: input.email || null,
    role,
    status: ["inactive", "active"].includes(lower(input.status)) ? lower(input.status) : "active",
    created_at: input.created_at || input.createdAt || timestamp,
    updated_at: input.updated_at || input.updatedAt || timestamp,
    created_by: input.created_by || input.createdBy || "owner",
    notes: input.notes || ""
  };
}

export function applyRoleAssignmentChange(state = {}, input = {}, options = {}) {
  const timestamp = isoNow(options);
  const actor = options.actor || options.changed_by || "owner";
  const action = options.action || "upsert";
  const assignments = ensureRoleAssignments(state, { now: timestamp });
  const actorId = clean(input.actor_id || input.actorId || input.id);
  if (!actorId) throw new Error("actor_id is required for role assignment changes.");
  if (actorId === "owner" && action === "deactivate") throw new Error("Default owner role cannot be deactivated.");
  const previous = assignments.find(item => item.actor_id === actorId) || null;
  const nextAssignment = normalizeAssignment({
    ...previous,
    ...input,
    actor_id: actorId,
    status: action === "deactivate" ? "inactive" : input.status || previous?.status || "active",
    updated_at: timestamp,
    created_at: previous?.created_at || timestamp,
    created_by: previous?.created_by || actor
  }, { now: timestamp });
  const nextAssignments = [nextAssignment, ...assignments.filter(item => item.actor_id !== actorId)];
  const next = {
    ...state,
    roleAssignments: nextAssignments
  };
  next.auditHistory = [{
    id: `audit-role-${actorId}-${Date.parse(timestamp) || Date.now()}`,
    timestamp,
    actor,
    action: action === "deactivate" ? "role assignment deactivated" : "role assignment updated",
    resourceType: "role_assignment",
    resourceId: actorId,
    beforeValue: previous,
    afterValue: nextAssignment
  }, ...list(state.auditHistory)];
  next.activityEvents = [{
    id: `activity-role-${actorId}-${Date.parse(timestamp) || Date.now()}`,
    eventType: action === "deactivate" ? "Role assignment deactivated" : "Role assignment updated",
    title: `${nextAssignment.display_name} role ${action === "deactivate" ? "deactivated" : "updated"}`,
    summary: `Internal role assignment changed from ${previous?.role || "none"} to ${nextAssignment.role}. No external action was taken.`,
    relatedObjectType: "role_assignment",
    relatedObjectId: actorId,
    riskLevel: "low",
    metadata: {
      oldRole: previous?.role || null,
      newRole: nextAssignment.role,
      changedBy: actor,
      externalSideEffects: false,
      partnerJourneyAccess: false
    },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, assignment: nextAssignment, previous };
}

export function buildCapabilityMatrix() {
  return roles.map(role => ({
    role,
    label: roleDefinitions[role].label,
    capabilities: roleCapabilities[role].map(capability => ({
      capability,
      allowed: true
    }))
  }));
}

export function buildRoleSystemStatus(state = {}, options = {}) {
  const assignments = ensureRoleAssignments(state, options);
  const currentRole = resolveActorRole(options.currentActor || { role: options.currentRole || "owner", authenticated: true }, state, options);
  const viewerMutation = [
    canPerformEndpoint("viewer", "POST", "/api/operating-memory/today/save"),
    canPerformEndpoint("viewer", "POST", "/api/capture-inbox"),
    canPerformEndpoint("viewer", "POST", "/api/roles/assignments")
  ].some(result => result.ok);
  const nonOwnerRoleManagement = roles.filter(role => role !== "owner").some(role => canPerformEndpoint(role, "POST", "/api/roles/assignments").ok);
  const liveGates = Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
  const warnings = [
    viewerMutation ? { title: "Viewer can mutate state", detail: "Viewer role unexpectedly has mutation capability.", severity: "critical", href: "roles" } : null,
    nonOwnerRoleManagement ? { title: "Non-owner can manage roles", detail: "Role management must stay owner-only.", severity: "critical", href: "roles" } : null,
    !assignments.some(item => item.actor_id === "owner" && item.role === "owner" && item.status === "active")
      ? { title: "Default owner role missing", detail: "Hosted owner-token actor must resolve to owner.", severity: "critical", href: "roles" }
      : null,
    liveGates !== 0 ? { title: "Live gates are not 0", detail: `${liveGates} live gate(s) are enabled.`, severity: "critical", href: "settings" } : null
  ].filter(Boolean);
  return {
    status: warnings.length ? "needs_attention" : "protected",
    current_role: currentRole,
    protected_mode: true,
    role_protection_status: warnings.length ? "needs_attention" : "enforced",
    assignments_count: assignments.length,
    active_assignments_count: assignments.filter(item => item.status === "active").length,
    roles,
    capability_matrix: buildCapabilityMatrix(),
    warnings,
    viewer_can_mutate: viewerMutation,
    non_owner_can_manage_roles: nonOwnerRoleManagement,
    partner_journey_access_excluded: true,
    live_gates_count: liveGates,
    no_external_actions_confirmation: "Role System is internal-only. No emails, posts, pages, dashboards, Partner Journey calls, or live gates were enabled."
  };
}
