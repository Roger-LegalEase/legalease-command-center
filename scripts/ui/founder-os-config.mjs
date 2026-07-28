// Founder OS shell deployment contract (Release 1 of docs/founder-os/08_DELIVERY_PLAN.md).
//
// Pure module: callers pass the server environment explicitly, and nothing browser- or
// request-controlled is read here. Same shape and same strict "true" parsing as
// vnext-config.mjs, so the two flags behave identically for an operator.
//
// FOUNDER_OS_SHELL collapses primary navigation to the charter's four workspaces — Today,
// Relationships, Campaigns, Scoreboard — and moves the internal machinery pages behind
// Settings → Advanced. Default off. Turning it off restores the current navigation
// exactly, which is the release's rollback path.
//
// It composes with the vNext shell rather than replacing it: the four-workspace navigation
// is rendered by the vNext desktop shell, so with COMMAND_CENTER_UX_VNEXT off this flag has
// nothing to change and is inert.

export const FOUNDER_OS_SHELL_ENV_KEY = "FOUNDER_OS_SHELL";

export function parseFounderOsFlag(value) {
  return typeof value === "string" && value === "true";
}

export function readFounderOsShellConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const enabled = Object.prototype.hasOwnProperty.call(environment, FOUNDER_OS_SHELL_ENV_KEY)
    && parseFounderOsFlag(environment[FOUNDER_OS_SHELL_ENV_KEY]);
  return Object.freeze({ enabled, source: "server-environment" });
}

// The charter's four primary workspaces, in charter order, each pointing at the canonical
// route that already renders it. Nothing else is primary navigation.
export const FOUNDER_OS_PRIMARY_WORKSPACES = Object.freeze([
  Object.freeze({ id: "today", label: "Today", route: "today" }),
  Object.freeze({ id: "partners", label: "Relationships", route: "partners" }),
  Object.freeze({ id: "outreach", label: "Campaigns", route: "campaigns" }),
  Object.freeze({ id: "scoreboard", label: "Scoreboard", route: "revenue" })
]);

// Machinery that the charter removes from navigation entirely. These routes keep resolving
// — nothing is deleted — but they are reachable only through Settings → Advanced.
// Sourced from the "Settings and Advanced" table of 02_TARGET_PRODUCT_AND_IA.md.
export const FOUNDER_OS_ADVANCED_ROUTES = Object.freeze([
  Object.freeze({ route: "autonomy", label: "Autonomy", note: "Agent autonomy levels and pending decisions." }),
  Object.freeze({ route: "operating-memory", label: "Operating Memory", note: "The operating loop's internal memory." }),
  Object.freeze({ route: "data-integrity", label: "Data Integrity", note: "Storage integrity snapshots." }),
  Object.freeze({ route: "smoke-test", label: "Self-Check", note: "Internal smoke tests." }),
  Object.freeze({ route: "safe-mode", label: "Safe Mode", note: "Recovery shell when the app cannot boot." }),
  Object.freeze({ route: "handoff-contract", label: "Handoff Contract", note: "Engineering handoff record." }),
  Object.freeze({ route: "conversation-notes", label: "Conversation Notes", note: "Internal conversation record." }),
  Object.freeze({ route: "soc2", label: "SOC 2 Readiness", note: "Compliance programme status." }),
  Object.freeze({ route: "soc2-access", label: "Access Reviews", note: "Access review register." }),
  Object.freeze({ route: "soc2-audit", label: "Audit Logs", note: "Access and change logs. Never primary." }),
  Object.freeze({ route: "soc2-changes", label: "Change Management", note: "Change register." }),
  Object.freeze({ route: "soc2-vendors", label: "Vendor Inventory", note: "Vendor register." }),
  Object.freeze({ route: "soc2-incidents", label: "Incident Register", note: "Active incidents also surface in Today." }),
  Object.freeze({ route: "production-activation-rcap", label: "RCAP Program Review", note: "Not connected to anything yet." }),
  Object.freeze({ route: "item", label: "Artifact Viewer", note: "The full record behind an item. Secondary only." })
]);

// ---------------------------------------------------------------------------------------------
// Release 2 — the Today operating loop.
// ---------------------------------------------------------------------------------------------
//
// FOUNDER_OS_TODAY turns Today into the charter's five-section ordered work queue (Now, Next,
// Communications, Meetings, Needs attention) ranked by the rules in
// docs/founder-os/workspaces/today.md, with the existing task workbench drawer acting as the
// universal action panel. Default off. Turning it off restores the legacy today/cockpit pages
// exactly, which is the release's rollback path.
//
// Like FOUNDER_OS_SHELL this is read once from the server environment and never from anything
// request-controlled, so the flag state is identical for every viewer of a given deployment.

export const FOUNDER_OS_TODAY_ENV_KEY = "FOUNDER_OS_TODAY";

export function readFounderOsTodayConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const enabled = Object.prototype.hasOwnProperty.call(environment, FOUNDER_OS_TODAY_ENV_KEY)
    && parseFounderOsFlag(environment[FOUNDER_OS_TODAY_ENV_KEY]);
  return Object.freeze({ enabled, source: "server-environment" });
}

// The five sections, in charter order. `id` is the payload key; `slot` is the DOM hook the
// renderer writes into. Nothing else is a Today section.
export const FOUNDER_OS_TODAY_SECTIONS = Object.freeze([
  Object.freeze({ id: "now", slot: "now", label: "Now", limit: 1 }),
  Object.freeze({ id: "next", slot: "next", label: "Next", limit: 5 }),
  Object.freeze({ id: "communications", slot: "communications", label: "Communications", limit: 6 }),
  Object.freeze({ id: "meetings", slot: "meetings", label: "Meetings", limit: 6 }),
  Object.freeze({ id: "needsAttention", slot: "needs-attention", label: "Needs attention", limit: 6 })
]);

// The Today-family page renderers Release 2 supersedes, per the route map in
// 02_TARGET_PRODUCT_AND_IA.md. With the flag on each route still resolves — it renders a short
// pointer into Today instead of its legacy surface, so no bookmark breaks and the legacy
// renderer's client bytes are never shipped.
export const FOUNDER_OS_SUPERSEDED_TODAY_ROUTES = Object.freeze([
  Object.freeze({ route: "cockpit", renderer: "cockpitHomeHtml", label: "Cockpit" }),
  Object.freeze({ route: "focus", renderer: "focusPageHtml", label: "Focus Mode" }),
  Object.freeze({ route: "morning-brief", renderer: "morningBriefPageHtml", label: "Morning Brief" }),
  Object.freeze({ route: "evening-reflection", renderer: "eveningReflectionPageHtml", label: "Evening Reflection" }),
  Object.freeze({ route: "daily-closeout", renderer: "dailyCloseoutPageHtml", label: "Daily Closeout" }),
  Object.freeze({ route: "tasks", renderer: "tasksPageHtml", label: "Tasks" }),
  Object.freeze({ route: "milestones", renderer: "milestonesPageHtml", label: "Milestones" }),
  Object.freeze({ route: "meetings", renderer: "meetingsPageHtml", label: "Meetings" }),
  Object.freeze({ route: "support", renderer: "supportPageHtml", label: "Support" }),
  Object.freeze({ route: "alerts", renderer: "alertsPageHtml", label: "Alerts" }),
  Object.freeze({ route: "automation", renderer: "automationInboxPageHtml", label: "Automation Inbox" }),
  Object.freeze({ route: "growth-inbox", renderer: "growthInboxPageHtml", label: "Growth Inbox" })
]);

// ---------------------------------------------------------------------------------------------
// Release 3 — the Relationships workspace.
// ---------------------------------------------------------------------------------------------
//
// FOUNDER_OS_RELATIONSHIPS turns the Partners surface into the charter's single CRM
// (docs/founder-os/workspaces/relationships.md). Default off. Turning it off restores the
// current Partners surface exactly, which is the release's rollback path.
//
// It is a projection, never a parallel store. scripts/relationship-service.mjs already
// projects the seven identity stores named in 01_CURRENT_STATE_REUSE_LEDGER.md:53 and is
// already live behind /api/ui/relationships/. This flag does not introduce a second
// projection; it turns on the charter behaviour the existing projection does not yet have:
// roles as a set on one person, ambiguous matches surfaced instead of silently merged,
// founder-set relationship strength and strategic priority, support issues in the timeline,
// and the charter's full filter vocabulary.

export const FOUNDER_OS_RELATIONSHIPS_ENV_KEY = "FOUNDER_OS_RELATIONSHIPS";

export function readFounderOsRelationshipsConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const enabled = Object.prototype.hasOwnProperty.call(environment, FOUNDER_OS_RELATIONSHIPS_ENV_KEY)
    && parseFounderOsFlag(environment[FOUNDER_OS_RELATIONSHIPS_ENV_KEY]);
  return Object.freeze({ enabled, source: "server-environment" });
}

// The six secondary views, verbatim from the table in 02_TARGET_PRODUCT_AND_IA.md:37.
// "Exactly these, and no others without a charter update." `query` is the filter the view
// applies to the existing relationship projection — every view is a filter over one list,
// never a separate fetch.
export const FOUNDER_OS_RELATIONSHIP_VIEWS = Object.freeze([
  Object.freeze({ id: "all", label: "All relationships", query: {} }),
  Object.freeze({ id: "follow_up_due", label: "Follow-up due", query: { followUp: "due" } }),
  Object.freeze({ id: "waiting_on_me", label: "Waiting on me", query: { waiting: "on_roger" } }),
  Object.freeze({ id: "waiting_on_them", label: "Waiting on them", query: { waiting: "on_them" } }),
  Object.freeze({ id: "pipeline", label: "Pipeline", query: { pipeline: "active" } }),
  // The charter names this view "suppressed"; the founder never sees that word. The id and
  // the query keep the internal name so nothing downstream has to change.
  Object.freeze({ id: "suppressed", label: "Not eligible to contact", query: { eligibility: "suppressed" } })
]);

// The charter's saved filters (relationships.md:50-54). The six views above are the pinned
// subset; these are the rest, and each maps to a query key the projection understands.
export const FOUNDER_OS_RELATIONSHIP_FILTERS = Object.freeze([
  Object.freeze({ id: "overdue", label: "Overdue", query: { followUp: "overdue" } }),
  Object.freeze({ id: "no_contact_14", label: "No contact in 14 days", query: { noContactDays: "14" } }),
  Object.freeze({ id: "no_contact_30", label: "No contact in 30 days", query: { noContactDays: "30" } }),
  Object.freeze({ id: "no_contact_60", label: "No contact in 60 days", query: { noContactDays: "60" } }),
  Object.freeze({ id: "replied", label: "Replied", query: { replied: "yes" } }),
  Object.freeze({ id: "meeting_booked", label: "Meeting booked", query: { meeting: "booked" } }),
  Object.freeze({ id: "proposal_active", label: "Proposal active", query: { stage: "proposal" } }),
  Object.freeze({ id: "stalled", label: "Stalled", query: { stage: "stalled" } }),
  Object.freeze({ id: "automated", label: "In automated outreach", query: { automation: "automated" } })
]);

// Relationship strength — a NEW field per relationships.md:26-29. Founder-set, never
// inferred: an unset relationship reports `unknown` rather than a guess. "How warm the
// connection is", distinct from strategic priority ("how much it matters"), which extends
// the existing partner priority vocabulary rather than introducing a second one.
export const FOUNDER_OS_RELATIONSHIP_STRENGTHS = Object.freeze([
  Object.freeze({ key: "strong", label: "Strong" }),
  Object.freeze({ key: "warm", label: "Warm" }),
  Object.freeze({ key: "cool", label: "Cool" }),
  Object.freeze({ key: "cold", label: "Cold" }),
  Object.freeze({ key: "unknown", label: "Not set" })
]);

// Strategic priority reuses the existing partner priority vocabulary exactly
// (scripts/partner-lifecycle.mjs normalizePriority), so the field extends the partner
// system rather than competing with it. `unset` is the honest default.
export const FOUNDER_OS_RELATIONSHIP_PRIORITIES = Object.freeze([
  Object.freeze({ key: "critical", label: "Critical" }),
  Object.freeze({ key: "high", label: "High" }),
  Object.freeze({ key: "medium", label: "Medium" }),
  Object.freeze({ key: "low", label: "Low" }),
  Object.freeze({ key: "unset", label: "Not set" })
]);

// ---------------------------------------------------------------------------------------------
// Release 4 — the Campaigns workspace.
// ---------------------------------------------------------------------------------------------
//
// FOUNDER_OS_CAMPAIGNS puts one lifecycle over the campaign lanes
// (docs/founder-os/workspaces/campaigns.md). Default off; off restores today's surface exactly.
//
// THE RELEASE CHANGES THE INTERFACE, NEVER THE CAMPAIGN. Reactivation is live in production
// with waves 1 and 2 sending and waves 3 and 4 held, so this release adds no mutation route of
// its own: the projection is read-only and every control points at the route that already
// implements it. The translation table below changes LANGUAGE only — each internal mechanism in
// the left column remains the enforcement layer, exactly as the charter requires.

export const FOUNDER_OS_CAMPAIGNS_ENV_KEY = "FOUNDER_OS_CAMPAIGNS";

export function readFounderOsCampaignsConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const enabled = Object.prototype.hasOwnProperty.call(environment, FOUNDER_OS_CAMPAIGNS_ENV_KEY)
    && parseFounderOsFlag(environment[FOUNDER_OS_CAMPAIGNS_ENV_KEY]);
  return Object.freeze({ enabled, source: "server-environment" });
}

// The press sub-flag is declared here so the lane has one switch, but it is deliberately
// inert until the lane is built: with nothing behind it, the lane renders the charter's
// honest not-built state either way (campaigns.md:89-90 — "never a fake one").
export const FOUNDER_OS_PRESS_ENV_KEY = "FOUNDER_OS_PRESS";

export function readFounderOsPressConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const enabled = Object.prototype.hasOwnProperty.call(environment, FOUNDER_OS_PRESS_ENV_KEY)
    && parseFounderOsFlag(environment[FOUNDER_OS_PRESS_ENV_KEY]);
  return Object.freeze({ enabled, source: "server-environment" });
}

// "The same five words appear in every lane. No lane invents its own jargon or its own control
// shapes." (campaigns.md:8-22) These are those five words, in charter order.
export const FOUNDER_OS_CAMPAIGN_LIFECYCLE = Object.freeze([
  Object.freeze({ id: "plan", label: "Plan", purpose: "Objective, audience, copy, schedule." }),
  Object.freeze({ id: "review", label: "Review", purpose: "Approvals: content gates and audience release decisions." }),
  Object.freeze({ id: "run", label: "Run", purpose: "The Run and Stop control." }),
  Object.freeze({ id: "monitor", label: "Monitor", purpose: "Sends, delivery, replies, thresholds, exceptions." }),
  Object.freeze({ id: "stop", label: "Stop", purpose: "Always available, always immediate." })
]);

// The four lanes from the secondary-views table in 02_TARGET_PRODUCT_AND_IA.md:37.
export const FOUNDER_OS_CAMPAIGN_LANES = Object.freeze([
  Object.freeze({ id: "social", label: "Social", built: true }),
  Object.freeze({ id: "reactivation", label: "Reactivation", built: true }),
  Object.freeze({ id: "partner_outreach", label: "Partner outreach", built: true }),
  // No press engine exists in main (01_CURRENT_STATE_REUSE_LEDGER.md P10, re-verified at
  // 922a555). The lane is present because the charter names it, and it reports that it is not
  // built rather than rendering an empty campaign that looks real.
  Object.freeze({ id: "press", label: "Press outreach", built: false })
]);

// The charter's internal-to-founder translation table, verbatim from campaigns.md:26-35.
// Language only: every left-hand mechanism stays the enforcement layer.
export const FOUNDER_OS_CAMPAIGN_TRANSLATIONS = Object.freeze([
  Object.freeze({ internal: "heartbeat cron", founder: "Next automatic check" }),
  Object.freeze({ internal: "live mode", founder: "Run / Stop" }),
  Object.freeze({ internal: "autopilot", founder: "Campaign running" }),
  Object.freeze({ internal: "released wave", founder: "Audience approved and active" }),
  Object.freeze({ internal: "threshold trip", founder: "Campaign stopped for safety" }),
  Object.freeze({ internal: "claim ledger", founder: "Duplicate-send protection" }),
  Object.freeze({ internal: "suppression", founder: "Not eligible to contact" }),
  Object.freeze({ internal: "SendGrid webhook health", founder: "Delivery feedback connected" })
]);

// Engine vocabulary that must never reach the founder surface. Asserted by the Release 4 test
// suite against the rendered lane payloads, so a future change cannot leak jargon quietly.
export const FOUNDER_OS_CAMPAIGN_FORBIDDEN_TERMS = Object.freeze([
  "heartbeat", "autopilot", "live mode", "livemode", "kill_switch", "threshold_tripped",
  "engine", "cron", "claim ledger", "sendgrid", "webhook"
]);

// ---------------------------------------------------------------------------------------------
// Release 5 — the Scoreboard.
// ---------------------------------------------------------------------------------------------
//
// FOUNDER_OS_SCOREBOARD turns the Founder Scoreboard into the charter's trusted KPI registry
// (docs/founder-os/workspaces/scoreboard.md): every metric carries a definition, a named source,
// freshness, current and prior period, a target where one is set, a variance, one corrective
// action, and exactly one status label. Default off; off restores today's Scoreboard exactly.
//
// It is a projection over the existing Founder Scoreboard and Company Health services. It builds
// no metric of its own and reads no collection they do not already read.

export const FOUNDER_OS_SCOREBOARD_ENV_KEY = "FOUNDER_OS_SCOREBOARD";

export function readFounderOsScoreboardConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const enabled = Object.prototype.hasOwnProperty.call(environment, FOUNDER_OS_SCOREBOARD_ENV_KEY)
    && parseFounderOsFlag(environment[FOUNDER_OS_SCOREBOARD_ENV_KEY]);
  return Object.freeze({ enabled, source: "server-environment" });
}

// The charter's six sections, in charter order (scoreboard.md:5-7). Platform health is folded in
// here rather than living at its own destination.
export const FOUNDER_OS_SCOREBOARD_SECTIONS = Object.freeze([
  Object.freeze({ id: "financial", label: "Financial" }),
  Object.freeze({ id: "acquisition", label: "Acquisition" }),
  Object.freeze({ id: "pipeline", label: "Pipeline" }),
  Object.freeze({ id: "customer", label: "Customer" }),
  Object.freeze({ id: "marketing", label: "Marketing" }),
  Object.freeze({ id: "platform_health", label: "Platform health" })
]);

// ---------------------------------------------------------------------------------------------
// Release 6 — Le-E everywhere.
// ---------------------------------------------------------------------------------------------
//
// FOUNDER_OS_LEE_PANEL makes Le-E a side panel available in every workspace instead of a page
// you navigate to. Default off; off restores the #lee page exactly, and proposals live in
// automationSuggestions either way.
//
// The panel changes WHERE Le-E is, never WHAT Le-E may do. The confirmation policy below is
// copied from 06_SAFETY_AND_AUTOMATION_CONTRACT.md and is asserted against that document
// verbatim by the test suite, so the two cannot drift.

export const FOUNDER_OS_LEE_PANEL_ENV_KEY = "FOUNDER_OS_LEE_PANEL";

export function readFounderOsLeePanelConfig(serverEnvironment = {}) {
  const environment = serverEnvironment && typeof serverEnvironment === "object" ? serverEnvironment : {};
  const enabled = Object.prototype.hasOwnProperty.call(environment, FOUNDER_OS_LEE_PANEL_ENV_KEY)
    && parseFounderOsFlag(environment[FOUNDER_OS_LEE_PANEL_ENV_KEY]);
  return Object.freeze({ enabled, source: "server-environment" });
}

// Internal, reversible, and they must NEVER prompt. Verbatim from the safety contract's
// "Actions requiring no confirmation".
export const FOUNDER_OS_NO_CONFIRMATION_ACTIONS = Object.freeze([
  "Complete an internal task",
  "Add a note",
  "Set a follow-up date",
  "Change priority",
  "Mark waiting or blocked",
  "Save a draft",
  "Update an internal relationship stage",
  "Record a manually sent email"
]);

// "One clear confirmation — never two, never zero." Verbatim from the safety contract's
// "Actions requiring exactly one confirmation". Le-E may never reach any of these on its own.
export const FOUNDER_OS_ONE_CONFIRMATION_ACTIONS = Object.freeze([
  "Send an external email",
  "Start a live campaign",
  "Release a new audience",
  "Remove suppression",
  "Publish content",
  "Delete important information"
]);

// The suggestion types the existing apply path can execute
// (preview-server.mjs applyAutomationSuggestionToState). Every one writes an internal record.
// This list exists so a test can prove the set never grows into a sending or publishing action:
// adding one here without a confirmation path fails the suite.
export const FOUNDER_OS_LEE_INTERNAL_SUGGESTION_TYPES = Object.freeze([
  "create_partner",
  "update_partner_status",
  "create_task",
  "mark_follow_up_due",
  "update_campaign",
  "update_funnel_snapshot",
  "add_data_room_item",
  "create_pilot",
  "update_pilot",
  "create_compliance_item",
  "generate_report",
  "add_activity_event"
]);
