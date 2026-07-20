export const VNEXT_ALIAS_RETENTION_RELEASES = 1;

export const VNEXT_LEGACY_DEPRECATION = Object.freeze({
  evaluatedAt:"2026-07-20",
  removed:Object.freeze([]),
  sourceBytesRemoved:0,
  retained:Object.freeze([
    Object.freeze({
      id:"legacy-primary-navigation-and-landings",
      surfaces:"Legacy primary navigation and section landing pages",
      normalModeVisibility:"not visible in the vNext shell",
      blocker:"The global-flag rollback checkpoint still renders this navigation and the required full-release route-telemetry window is incomplete."
    }),
    Object.freeze({
      id:"legacy-social-review-calendar",
      surfaces:"Legacy Social review and calendar renderers",
      normalModeVisibility:"aliases resolve into the Social destination",
      blocker:"Flag-off rollback and old deep links still depend on these renderers; one additional alias-retention release is required."
    }),
    Object.freeze({
      id:"legacy-campaign-pages",
      surfaces:"Legacy Campaign landing and detail renderers",
      normalModeVisibility:"Outreach is the vNext primary destination",
      blocker:"Not every legacy Campaign subworkflow has production telemetry proving parity and zero dependency."
    }),
    Object.freeze({
      id:"legacy-partner-artifact-pages",
      surfaces:"Separate legacy Partner artifact pages",
      normalModeVisibility:"Partner artifacts are integrated into Partner records",
      blocker:"The rollback shell and preserved artifact deep links still require the legacy renderer."
    }),
    Object.freeze({
      id:"legacy-reports-proof-data-room",
      surfaces:"Separate Reports, Proof, and Data Room navigation/renderers",
      normalModeVisibility:"Files and Investor Room own these concepts in vNext",
      blocker:"The aliases must remain for one additional release and the flag-off rollback shell still needs the original destinations."
    })
  ])
});
