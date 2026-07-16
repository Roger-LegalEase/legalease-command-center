const clean = (value = "") => String(value ?? "").trim();

export const FOUNDER_PERMISSION_LABELS = Object.freeze({
  read_internal:"Use Command Center",
  read_sensitive:"View sensitive records",
  view_private_assets:"View private files",
  manage_growth:"Manage campaigns and Partner records",
  manage_content_drafts:"Review social posts",
  manage_approval_queue:"Review social posts",
  manage_tasks:"Manage tasks",
  manage_roles:"Manage team roles",
  run_smoke_tests:"Run application self-checks",
  view_diagnostics:"Manage integrations",
  refresh_os_health:"Run application self-checks",
  route_captures:"Manage internal notes",
  add_notes:"Manage internal notes",
  view_audit_history:"View audit history"
});

export function founderPermissionLabel(capability = "") {
  return FOUNDER_PERMISSION_LABELS[clean(capability)] || "additional access";
}

export function permissionLabelForCapabilities(capabilities = []) {
  const values = Array.isArray(capabilities) ? capabilities : [];
  return founderPermissionLabel(values.find((capability) => FOUNDER_PERMISSION_LABELS[clean(capability)]) || "");
}
