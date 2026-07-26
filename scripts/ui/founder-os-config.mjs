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
