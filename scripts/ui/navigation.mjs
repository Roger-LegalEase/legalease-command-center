// The legacy runtime router remains the compatibility source of route behavior. CCX-100
// consumes this registry only to resolve vNext shell highlighting; it does not redirect,
// rename, render, authorize, fetch, or mutate a route. The focused inventory test still
// compares the registry with the live literals in preview-server.mjs.

export const MIGRATION_CLASSIFICATIONS = Object.freeze([
  "Keep as primary",
  "Move into Today",
  "Move into Social",
  "Move into Outreach",
  "Move into Partners",
  "Move into Files",
  "Move into Inbox",
  "Move into Settings",
  "Advanced/internal only",
  "Deprecate after parity"
]);

export const VNEXT_DESTINATIONS = Object.freeze([
  "Today",
  "Inbox",
  "Partners",
  "Social",
  "Outreach",
  "Scoreboard",
  "Support",
  "Calendar",
  "Company Health",
  "Files",
  "Settings",
  "Advanced/internal only",
  "Deprecate after parity"
]);

const DEFAULT_VISIBILITY = Object.freeze({
  shellRoles: Object.freeze(["owner", "admin", "operator"]),
  fullStateRoles: Object.freeze(["owner", "admin"]),
  viewerAccess: "Aggregate report endpoints only; no full-state shell route",
  notes: "The hash router does not hide individual pages. Reads and writes remain server-authorized."
});

function route(
  canonicalRoute,
  currentLabel,
  renderer,
  currentSurface,
  migrationClassification,
  vnextDestination,
  aliases = [],
  options = {}
) {
  const visibility = Object.freeze({
    ...DEFAULT_VISIBILITY,
    ...(options.visibility || {}),
    shellRoles: Object.freeze([...(options.visibility?.shellRoles || DEFAULT_VISIBILITY.shellRoles)]),
    fullStateRoles: Object.freeze([...(options.visibility?.fullStateRoles || DEFAULT_VISIBILITY.fullStateRoles)]),
    actionCapabilities: Object.freeze([...(options.visibility?.actionCapabilities || [])])
  });
  return Object.freeze({
    id: `route-${canonicalRoute}`,
    canonicalRoute,
    canonicalHash: `#${canonicalRoute}`,
    aliases: Object.freeze([...aliases]),
    currentLabel,
    renderer,
    currentSurface,
    currentEntryPoint: options.currentEntryPoint || currentSurface,
    currentPrimaryNavigation: options.currentPrimaryNavigation
      ? Object.freeze({ ...options.currentPrimaryNavigation })
      : null,
    migrationClassification,
    vnextDestination,
    visibility,
    aliasShadowedBy: options.aliasShadowedBy || null,
    deprecationState: options.deprecationState || "retain-until-parity",
    notes: options.notes || ""
  });
}

export const routeRegistry = Object.freeze([
  route("cockpit", "Cockpit", "cockpitHomeHtml", "Today", "Move into Today", "Today", [], {
    aliasShadowedBy: "today",
    deprecationState: "alias-shadowed",
    notes: "The live alias resolver maps #cockpit to #today before this renderer can be selected."
  }),
  route("upload", "Upload List", "uploadListPageHtml", "Campaigns", "Move into Outreach", "Outreach", ["upload-list", "list-upload", "import", "import-list"], {
    notes: "Consumer and prospect list import; preview/confirm endpoints preserve suppression review."
  }),
  route("contacts", "Contacts", "contactsPageHtml", "Campaigns", "Move into Outreach", "Outreach", ["lists", "contact", "people"], {
    notes: "Unified contacts include outreach, reactivation, prospects, partners, tasks, and read-only Google signals."
  }),
  route("prospects", "Prospects", "rcapProspectsPageHtml", "Queue", "Move into Outreach", "Outreach", ["prospect", "prospects", "rcap-prospects", "rcap-pipeline"], {
    visibility: { actionCapabilities: ["approve"] },
    notes: "The self-alias #prospects is present in the live alias object; candidate approval/rejection remains gated."
  }),
  route("revenue", "Revenue", "revenuePageHtml", "Campaigns", "Move into Outreach", "Outreach", ["money", "payments", "stripe"], {
    notes: "Read-only Stripe, funnel, engagement, and RCAP revenue status; unavailable sources remain explicit."
  }),
  route("meetings", "Meetings", "meetingsPageHtml", "Queue", "Move into Partners", "Partners", ["calendar", "meeting", "meeting-prep"], {
    notes: "Google calendar/email intelligence is read-only; no calendar writes or email sends occur here."
  }),
  route("support", "Support", "supportPageHtml", "Queue", "Move into Inbox", "Inbox", ["support-inbox"], {
    notes: "Support intake and follow-up work should join the universal Inbox projection."
  }),
  route("alerts", "Alerts", "alertsPageHtml", "Queue", "Move into Inbox", "Inbox", ["notifications", "alert-center"], {
    notes: "Alert review belongs in Inbox; alert email tests remain separately authorized and off by default."
  }),
  route("pages", "Pages", "pagesPageHtml", "Review Desk", "Move into Partners", "Partners", ["partner-pages-review", "page-review", "co-branded-pages"], {
    notes: "Co-branded partner-page review moves into the relevant Partner context."
  }),
  route("today", "Today", "commandCenterOverviewHtml", "Today", "Keep as primary", "Today", ["overview", "cockpit"], {
    currentPrimaryNavigation: { label: "Today", section: "today" },
    currentEntryPoint: "Primary navigation",
    notes: "Final vNext primary destination; aliases preserve earlier cockpit/overview links."
  }),
  route("overview", "Overview", "commandCenterOverviewHtml", "Today", "Move into Today", "Today", [], {
    aliasShadowedBy: "today",
    deprecationState: "alias-shadowed",
    notes: "The live alias resolver maps #overview to #today; the whitelist entry remains for compatibility inventory."
  }),
  route("daily-run", "Daily Run", "todaySinglePaneHtml", "Today", "Move into Today", "Today", [], {
    notes: "Guided daily-run actions remain internal state transitions with no external action authority."
  }),
  route("focus", "Focus", "focusPageHtml", "Today", "Move into Today", "Today"),
  route("decisions", "Decisions", "decisionsPageHtml", "Queue", "Move into Inbox", "Inbox", [], {
    currentPrimaryNavigation: { label: "Queue", section: "queue" },
    currentEntryPoint: "Primary navigation",
    visibility: { actionCapabilities: ["mutate_state"] },
    notes: "Approval records a decision; execution remains a separate safe action."
  }),
  route("lee", "Le-E", "leePageHtml", "More", "Advanced/internal only", "Advanced/internal only", ["le-e"], {
    currentEntryPoint: "Floating Le-E control and direct hash",
    notes: "Le-E remains a global utility in vNext rather than a primary destination."
  }),
  route("growth", "Growth", "growthWorkspaceHtml", "More / Growth", "Move into Social", "Social", ["command", "marketing", "social", "social-media", "content-calendar", "posts"], {
    notes: "Mixed growth workspace overlaps Social, Outreach, Inbox, and Partners; post/content work moves to Social."
  }),
  route("partner-hub", "Partner Hub", "sectionLandingPageHtml:partner-hub", "More / Partners", "Move into Partners", "Partners", [], {
    aliasShadowedBy: "partners",
    deprecationState: "alias-shadowed",
    notes: "The live alias resolver maps #partner-hub to #partners before the landing renderer is selected."
  }),
  route("production", "Production", "productionWorkspaceHtml", "Review Desk", "Move into Social", "Social", [], {
    notes: "Social production pipeline becomes Social Library/readiness detail."
  }),
  route("production-linkedin-queue", "LinkedIn Approval Queue", "linkedinApprovalQueueHtml", "Review Desk", "Move into Social", "Social", ["linkedin"], {
    visibility: { actionCapabilities: ["manage_approval_queue", "social_publish"] },
    notes: "Approval and live publishing authority remain distinct; live publishing is owner/server gated."
  }),
  route("production-twitter-x-queue", "Twitter / X Approval Queue", "twitterXApprovalQueueHtml", "Review Desk", "Move into Social", "Social", ["twitter-x"], {
    visibility: { actionCapabilities: ["manage_approval_queue", "social_publish"] },
    notes: "Approval and live publishing authority remain distinct; live publishing is owner/server gated."
  }),
  route("proof", "Proof", "proofWorkspaceHtml", "Reports", "Move into Files", "Files", ["metrics", "kpis"], {
    notes: "Proof, evidence, metrics, and investor material consolidate into Files collections."
  }),
  route("more", "More", "moreWorkspaceHtml", "More", "Deprecate after parity", "Deprecate after parity", [], {
    currentPrimaryNavigation: { label: "More", section: "more" },
    currentEntryPoint: "Primary navigation",
    deprecationState: "remove-after-destination-parity",
    notes: "Its cards must move to final destinations before the legacy landing page can be removed."
  }),
  route("growth-inbox", "Growth Inbox", "growthInboxPageHtml", "Queue", "Move into Inbox", "Inbox", ["replies", "inbox-replies"], {
    visibility: { actionCapabilities: ["manage_growth"] },
    notes: "Read-only signals, reply follow-ups, and triage become universal Inbox items."
  }),
  route("capture-inbox", "Capture Inbox", "captureInboxPageHtml", "Queue", "Move into Inbox", "Inbox", [], {
    visibility: { actionCapabilities: ["route_captures"] },
    notes: "Captured notes remain internal until explicitly routed."
  }),
  route("tasks", "Tasks", "tasksPageHtml", "Queue", "Move into Inbox", "Inbox", [], {
    visibility: { actionCapabilities: ["manage_tasks"] }
  }),
  route("tasks-today", "Tasks Today", "tasksPageHtml", "Queue", "Move into Today", "Today", [], {
    visibility: { actionCapabilities: ["manage_tasks"] }
  }),
  route("tasks-blocked", "Blocked Tasks", "tasksPageHtml", "Queue", "Move into Inbox", "Inbox", [], {
    visibility: { actionCapabilities: ["manage_tasks"] }
  }),
  route("tasks-waiting", "Waiting Tasks", "tasksPageHtml", "Queue", "Move into Inbox", "Inbox", [], {
    visibility: { actionCapabilities: ["manage_tasks"] }
  }),
  route("tasks-this-week", "This Week Tasks", "tasksPageHtml", "Queue", "Move into Today", "Today", [], {
    visibility: { actionCapabilities: ["manage_tasks"] }
  }),
  route("production-activation-rcap", "RCAP Program Review", "rcapReviewWorkspaceHtml", "More / Partners", "Move into Partners", "Partners", ["rcap"], {
    visibility: { actionCapabilities: ["run_internal_activation", "update_review_state", "approve_final_artifact"] },
    notes: "Internal activation/review remains advanced inside the Partner program context."
  }),
  route("operating-memory", "Operating Memory", "operatingMemoryPageHtml", "More", "Move into Today", "Today", [], {
    visibility: { actionCapabilities: ["save_operating_memory"] }
  }),
  route("morning-brief", "Morning Brief", "morningBriefPageHtml", "Today", "Move into Today", "Today", [], {
    visibility: { actionCapabilities: ["save_daily_rituals"] }
  }),
  route("evening-reflection", "Evening Reflection", "eveningReflectionPageHtml", "Today", "Move into Today", "Today", [], {
    visibility: { actionCapabilities: ["save_daily_rituals"] }
  }),
  route("daily-closeout", "Daily Closeout", "dailyCloseoutPageHtml", "Today", "Move into Today", "Today", [], {
    visibility: { actionCapabilities: ["save_closeout"] }
  }),
  route("os-health", "App Status", "osHealthPageHtml", "More / Settings", "Move into Settings", "Settings", ["app-status", "health", "system"], {
    visibility: { actionCapabilities: ["refresh_os_health", "view_diagnostics"] },
    notes: "Normal mode should show a calm summary; detailed diagnostics stay permission-gated."
  }),
  route("smoke-test", "Self-Check", "smokeTestPageHtml", "More", "Advanced/internal only", "Advanced/internal only", [], {
    visibility: { actionCapabilities: ["run_smoke_tests"] }
  }),
  route("evidence-room", "Evidence Room", "evidenceRoomPageHtml", "Reports", "Move into Files", "Files", [], {
    visibility: { actionCapabilities: ["generate_evidence_summary"] }
  }),
  route("handoff-contract", "Handoff Contract", "handoffContractPageHtml", "More", "Advanced/internal only", "Advanced/internal only", ["handoff-notes"], {
    visibility: { actionCapabilities: ["generate_handoff_packet", "generate_handoff_contract_preview"] }
  }),
  route("operator-manual", "Guide", "operatorManualPageHtml", "More", "Move into Settings", "Settings", ["guide", "course-manual"]),
  route("roles", "Team Roles", "rolesPageHtml", "More / Settings", "Move into Settings", "Settings", [], {
    visibility: { actionCapabilities: ["manage_roles"] },
    notes: "Role assignment mutations are owner-only."
  }),
  route("data-integrity", "Data Integrity", "dataIntegrityPageHtml", "More / Settings", "Move into Settings", "Settings", ["data-check"], {
    visibility: { actionCapabilities: ["view_data_integrity", "refresh_data_integrity"] }
  }),
  route("operator-search", "Operator Search", "operatorSearchPageHtml", "More", "Deprecate after parity", "Deprecate after parity", [], {
    visibility: { actionCapabilities: ["mutate_state"] },
    deprecationState: "replace-after-global-search-parity",
    notes: "The search engine should back the future global Search utility before this page is retired."
  }),
  route("conversation-notes", "Conversation Notes", "conversationNotesPageHtml", "More", "Advanced/internal only", "Advanced/internal only", [], {
    visibility: { actionCapabilities: ["add_notes"] }
  }),
  route("partner-programs", "Partner Programs", "partnerProgramsPageHtml", "More / Partners", "Move into Partners", "Partners"),
  route("partner-pages", "Partner Pages", "partnerPagesPageHtml", "More / Partners", "Move into Partners", "Partners"),
  route("partner-dashboards", "Partner Dashboards", "partnerDashboardsPageHtml", "More / Partners", "Move into Partners", "Partners"),
  route("partner-reports", "Partner Reports", "partnerReportsPageHtml", "More / Partners", "Move into Partners", "Partners", [], {
    notes: "Generated reports also surface as Files while Partner remains the relationship context."
  }),
  route("partner-proposals", "Partner Proposals", "partnerProposalsPageHtml", "More / Partners", "Move into Partners", "Partners", [], {
    notes: "Proposal artifacts also surface as Files while Partner remains the relationship context."
  }),
  route("milestones", "Milestones", "milestonesPageHtml", "More", "Move into Today", "Today"),
  route("partners", "Partners", "partnersPageHtml", "More / Partners", "Keep as primary", "Partners", ["partner", "partner-hub"], {
    notes: "Existing route identifier matches the final vNext primary destination."
  }),
  route("campaigns", "Campaigns", "campaignsControlPageHtml", "Campaigns", "Move into Outreach", "Outreach", ["campaign", "campaign-control", "campaigns-control"], {
    currentPrimaryNavigation: { label: "Campaigns", section: "campaigns" },
    currentEntryPoint: "Primary navigation",
    notes: "Mixed campaign control becomes the founder-facing Outreach workspace."
  }),
  route("funnel", "Funnel", "funnelPageHtml", "Campaigns", "Move into Outreach", "Outreach"),
  route("content-bank", "Content Bank", "contentBankPageHtml", "Review Desk", "Move into Social", "Social"),
  route("queue", "Review Desk", "inline:queueReviewShell", "Review Desk", "Move into Social", "Social", [], {
    currentPrimaryNavigation: { label: "Review Desk", section: "review-desk" },
    currentEntryPoint: "Primary navigation",
    visibility: { actionCapabilities: ["manage_approval_queue", "manage_content_drafts"] },
    notes: "Becomes Social Needs review; approval still does not publish."
  }),
  route("sources", "Sources", "inline:sourcesSection", "Campaigns / Growth", "Move into Social", "Social", [], {
    currentEntryPoint: "Growth surface tab and /sources/import-social-calendar",
    notes: "Social calendar import path is a non-hash compatibility entry point."
  }),
  route("assets", "Assets", "assetLibraryPageHtml", "Review Desk", "Move into Files", "Files", [], {
    visibility: { actionCapabilities: ["view_private_assets"] },
    notes: "Brand assets belong in Files and remain available inside the Social composer."
  }),
  route("posted", "Posted", "inline:postedSection", "Review Desk", "Move into Social", "Social"),
  route("autonomy", "Autonomy", "autonomyPageHtml", "Review Desk", "Move into Settings", "Settings", [], {
    visibility: { actionCapabilities: ["manage_autonomy"] },
    notes: "Becomes Automations under Settings; approval remains separate from execution."
  }),
  route("automation", "Automation Inbox", "automationInboxPageHtml", "More / Settings", "Move into Inbox", "Inbox", [], {
    notes: "Suggestions requiring human approval move to Inbox; connector configuration remains in Settings."
  }),
  route("pilots", "Pilots", "pilotsPageHtml", "More / Partners", "Move into Partners", "Partners"),
  route("compliance", "Compliance", "compliancePageHtml", "More", "Move into Files", "Files"),
  route("soc2", "SOC 2 Readiness", "soc2DashboardPageHtml", "Reports", "Move into Files", "Files"),
  route("soc2-access", "Access Reviews", "soc2AccessReviewsPageHtml", "Reports", "Move into Settings", "Settings"),
  route("soc2-audit", "Audit Logs", "soc2AuditLogsPageHtml", "Reports", "Advanced/internal only", "Advanced/internal only", [], {
    visibility: { actionCapabilities: ["view_audit_history"] }
  }),
  route("soc2-changes", "Change Management", "soc2ChangesPageHtml", "Reports", "Move into Settings", "Settings"),
  route("soc2-vendors", "Vendor Inventory", "soc2VendorsPageHtml", "Reports", "Move into Settings", "Settings"),
  route("soc2-incidents", "Incident Register", "soc2IncidentsPageHtml", "Reports", "Move into Settings", "Settings"),
  route("soc2-evidence", "Evidence Center", "soc2EvidencePageHtml", "Reports", "Move into Files", "Files"),
  route("soc2-policies", "Policies", "soc2PoliciesPageHtml", "Reports", "Move into Files", "Files"),
  route("reports", "Reports", "reportsPageHtml", "Reports", "Move into Files", "Files", [], {
    currentPrimaryNavigation: { label: "Reports", section: "reports" },
    currentEntryPoint: "Primary navigation",
    notes: "Generated reports become File records with source and generation metadata."
  }),
  route("dataroom", "Data Room", "dataRoomPageHtml", "Reports", "Move into Files", "Files", [], {
    notes: "Becomes the Investor Room collection within Files."
  }),
  route("metrics", "Metrics", "metricsDashboardHtml", "Reports", "Move into Files", "Files", [], {
    aliasShadowedBy: "proof",
    deprecationState: "alias-shadowed",
    notes: "The live alias resolver maps #metrics to #proof before this renderer can be selected."
  }),
  route("settings", "Settings", "inline:plainSettingsPageHtml", "More / Settings", "Move into Settings", "Settings", ["privacy"], {
    visibility: { actionCapabilities: ["admin", "view_diagnostics"] },
    notes: "Connection and environment controls remain server-authorized; the browser cannot enable live gates."
  }),
  route("safe-mode", "Safe Mode", "renderSafeBootShell", "More / Settings", "Advanced/internal only", "Advanced/internal only", ["recovery"], {
    notes: "Recovery route must remain available even when full application state cannot load."
  }),
  route("item", "Artifact Viewer", "artifactViewerHtml", "Queue / deep link", "Deprecate after parity", "Deprecate after parity", [], {
    currentEntryPoint: "#item/<collection>/<id> generated by queue and Today helpers",
    deprecationState: "retain-until-exact-object-route-parity",
    notes: "Dynamic collection and item context must be preserved until Post, Campaign, Partner, and File detail routes have parity."
  })
]);

export const routeRegistryByCanonicalRoute = Object.freeze(
  Object.fromEntries(routeRegistry.map((entry) => [entry.canonicalRoute, entry]))
);

export const primaryNavigationInventory = Object.freeze(
  routeRegistry
    .filter((entry) => entry.currentPrimaryNavigation)
    .map((entry) => Object.freeze({
      route: entry.canonicalRoute,
      label: entry.currentPrimaryNavigation.label,
      section: entry.currentPrimaryNavigation.section,
      vnextDestination: entry.vnextDestination
    }))
);
