export const VNEXT_ROLLBACK_CHECKPOINT = Object.freeze({
  baseBranch:"release/ux-vnext-v1.1-2026-07-19",
  baseSha:"c6089bb571aa2a3e9b31a1c8aed8706e10e05586",
  globalFlag:"COMMAND_CENTER_UX_VNEXT",
  productFlags:Object.freeze([
    "COMMAND_CENTER_UX_VNEXT_SOCIAL",
    "COMMAND_CENTER_UX_VNEXT_OUTREACH",
    "COMMAND_CENTER_UX_VNEXT_FILES",
    "COMMAND_CENTER_UX_VNEXT_DISCOVERY"
  ]),
  rollbackOrder:Object.freeze([
    "Set every product flag to false.",
    "Set COMMAND_CENTER_UX_VNEXT to false.",
    "Verify the legacy shell and preserved aliases.",
    "Keep all send and publishing gates false.",
    "Roll application code back to the checkpoint only if flag rollback is insufficient."
  ])
});

export const VNEXT_PRODUCTION_READS = Object.freeze([
  "/api/ui/today",
  "/api/ui/inbox?group=needs-me&limit=10",
  "/api/ui/social?view=ideas&limit=10",
  "/api/ui/outreach?view=all&limit=10",
  "/api/ui/partners?view=list&limit=10",
  "/api/ui/files?view=all&limit=10",
  "/api/ui/files/investor-room",
  "/api/ui/search?q=synthetic&limit=10",
  "/api/ui/create/capabilities",
  "/api/ui/discovery/checklist"
]);
