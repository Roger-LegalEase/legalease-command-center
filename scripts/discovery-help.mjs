import { roleHasCapability } from "./roles.mjs";

const clean = (value = "") => String(value ?? "").trim();

export const DISCOVERY_HELP_ITEMS = Object.freeze([
  Object.freeze({ id:"overview", label:"What the Command Center does", destinations:Object.freeze(["Today", "Inbox", "Search"]), title:"Five focused tools in one workspace", summary:"Plan today, publish Social content, run Outreach, manage Partners, and organize Files without learning how the software is built.", points:Object.freeze(["Today shows what deserves attention now.", "Inbox gathers decisions and follow-ups.", "Search and Create stay available throughout the workspace."]), action:Object.freeze({ label:"Go to Today", kind:"route", href:"#today", expectedDestination:"Today" }) }),
  Object.freeze({ id:"tour", label:"Take a product tour", destinations:Object.freeze([]), title:"Choose the workflow that matters first", summary:"The short tour opens a real workflow and can be skipped or revisited at any time.", points:Object.freeze(["Your choice is saved to your account.", "The tour never connects an account or enables an external action."]), action:Object.freeze({ label:"Start product tour", kind:"onboarding" }) }),
  Object.freeze({ id:"social", label:"Social workflow", destinations:Object.freeze(["Social"]), title:"Move a Social idea toward publication", summary:"Create a Post, add reviewed creative, adapt channel copy, check readiness, schedule, review, and publish only when current safeguards allow it.", points:Object.freeze(["Creative and channel choices stay on the exact Post.", "Scheduling, approval, and publishing are separate decisions.", "Unavailable results remain unavailable rather than becoming zero."]), action:Object.freeze({ label:"Open Social", kind:"route", href:"#queue?view=ideas", expectedDestination:"Social" }) }),
  Object.freeze({ id:"outreach", label:"Outreach workflow", destinations:Object.freeze(["Outreach"]), title:"Prepare Outreach one clear step at a time", summary:"Set the goal, confirm the audience, write the message, choose timing, and review exactly who receives what before launch.", points:Object.freeze(["Excluded recipients stay excluded.", "Approval and sending remain separate when required.", "Replies and outcomes stay linked to the Campaign and Partner."]), action:Object.freeze({ label:"Open Outreach", kind:"route", href:"#outreach", expectedDestination:"Outreach" }) }),
  Object.freeze({ id:"partners", label:"Partner workflow", destinations:Object.freeze(["Partners"]), title:"Keep the next relationship action visible", summary:"Use the Partner record to understand stage, health, activity, Outreach, Files, and the current next action.", points:Object.freeze(["Suggestions do not silently change stage.", "Outreach and Files open the exact related records."]), action:Object.freeze({ label:"Open Partners", kind:"route", href:"#partners", expectedDestination:"Partners" }) }),
  Object.freeze({ id:"files", label:"Files and Investor Room", destinations:Object.freeze(["Files"]), title:"Find and verify company material", summary:"Files keeps source-backed company material together. Investor Room shows which explicit requirements are current, missing, or need an update.", points:Object.freeze(["A storage location does not imply public access.", "A stale or failed File cannot count as current."]), action:Object.freeze({ label:"Open Files", kind:"route", href:"#files", expectedDestination:"Files" }) }),
  Object.freeze({ id:"keyboard", label:"Keyboard shortcuts", destinations:Object.freeze([]), title:"Move around without leaving the keyboard", summary:"Use the standard controls below. Focus remains visible and returns to the Help button when this panel closes.", points:Object.freeze(["Tab and Shift+Tab move through controls.", "Enter or Space activates the focused control.", "Escape closes menus, drawers, and dialogs.", "The Search shortcut shown in the top bar opens Search."]), action:Object.freeze({ label:"Close help", kind:"close" }) })
]);

export class DiscoveryHelpError extends Error {
  constructor(message, status = 400) { super(message); this.name = "DiscoveryHelpError"; this.status = status; }
}

export function buildContextualHelp({ actor = {}, destination = "Today", now = "" } = {}) {
  if (actor.authenticated !== true || !clean(actor.id) || !roleHasCapability(actor.role, "read_internal")) throw new DiscoveryHelpError("Help is not available for this account.", 403);
  const generatedAt = clean(now);
  if (!Number.isFinite(Date.parse(generatedAt))) throw new DiscoveryHelpError("A valid server timestamp is required.");
  const selected = DISCOVERY_HELP_ITEMS.find((item) => item.destinations.includes(clean(destination)))?.id || "overview";
  return Object.freeze({
    ok:true,
    generatedAt,
    selected,
    title:"Help for this page",
    description:`Start with ${clean(destination) || "the current page"}, or choose another workflow.`,
    items:DISCOVERY_HELP_ITEMS,
    advancedGuidance:Object.freeze({ location:"Settings", shown:false }),
    capabilities:Object.freeze({ mutatesRecords:false, externalLinks:false })
  });
}
