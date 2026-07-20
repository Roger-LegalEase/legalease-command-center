const clean = (value = "") => String(value ?? "").trim();

export const DISCOVERY_EMPTY_STATE_AREAS = Object.freeze([
  "today", "inbox", "social", "outreach", "partners", "files", "investor-room", "search-results"
]);

const definitions = Object.freeze({
  today:Object.freeze({
    title:"Choose what moves forward today",
    purpose:"Today keeps your most important work and next steps in one calm view.",
    next:"Capture a real task, decision, blocker, idea, note, or File follow-up; it will show where it was saved before anything changes.",
    action:Object.freeze({ label:"Capture a next step", kind:"global-create", workflowId:"quick-note", expectedDestination:"Today" }),
    example:"Example: capture a Partner follow-up, then confirm its destination."
  }),
  inbox:Object.freeze({
    title:"You are caught up",
    purpose:"Inbox brings together work that needs a decision, response, or follow-up.",
    next:"Return to Today to choose the next useful piece of work.",
    action:Object.freeze({ label:"Plan today", kind:"route", href:"#today", expectedDestination:"Today" })
  }),
  social:Object.freeze({
    title:"Start your first Social Post",
    purpose:"Social is where ideas become reviewed, scheduled, and published Posts.",
    next:"Create an inert idea or draft, then add copy, approved creative, channels, and a schedule in the composer.",
    action:Object.freeze({ label:"Create post", kind:"global-create", workflowId:"social-post", expectedDestination:"Social" }),
    example:"Try an approved Legal education or FAQ template after the Post opens."
  }),
  outreach:Object.freeze({
    title:"Start a focused Outreach Campaign",
    purpose:"Outreach helps you prepare partner or customer messages and understand what happens next.",
    next:"Create one Draft Campaign. Audience, approval, schedule, and sending stay separate.",
    action:Object.freeze({ label:"New campaign", kind:"global-create", workflowId:"outreach-campaign", expectedDestination:"Outreach" })
  }),
  partners:Object.freeze({
    title:"Add the first Partner relationship",
    purpose:"Partners keeps relationship stage, health, next action, Outreach, and Files together.",
    next:"Add one canonical Partner at the New stage, then set its real next action.",
    action:Object.freeze({ label:"Add Partner", kind:"global-create", workflowId:"partner", expectedDestination:"Partners" })
  }),
  files:Object.freeze({
    title:"Bring company material into Files",
    purpose:"Files organizes brand, Partner, Campaign, compliance, and investor material without copying source truth.",
    next:"Upload one supported private File and choose its real collection.",
    action:Object.freeze({ label:"Upload file", kind:"file-upload", href:"#files", collection:"", expectedDestination:"Files" })
  }),
  "investor-room":Object.freeze({
    title:"Add a required Investor Room File",
    purpose:"Investor Room shows which explicit requirements are current, missing, or need an update.",
    next:"Upload a private File to Investor Room, then attach it to the correct reviewed requirement before it can count as current.",
    action:Object.freeze({ label:"Upload Investor Room file", kind:"file-upload", href:"#files?collection=investor-room", collection:"investor-room", expectedDestination:"Files" })
  }),
  "search-results":Object.freeze({
    title:"Try a broader search",
    purpose:"Search finds authorized Posts, Campaigns, Partners, Files, Tasks, and Reports.",
    next:"Adjust the current search without saving its text to product analytics.",
    action:Object.freeze({ label:"Search again", kind:"global-search", expectedDestination:"Search" })
  })
});

const stateCopy = Object.freeze({
  empty:Object.freeze({}),
  "filtered-empty":Object.freeze({ title:"No matches in this view", next:"Clear or change the current filters, then continue with the same authorized records.", action:Object.freeze({ label:"Clear filters", kind:"clear-filters" }) }),
  unavailable:Object.freeze({ title:"Current information is unavailable", next:"Try again. No record or completion state was changed.", action:Object.freeze({ label:"Try again", kind:"retry" }) }),
  unauthorized:Object.freeze({ title:"Additional access is needed", next:"Return to Today or ask an administrator for the required access. Hidden records were not inspected.", action:Object.freeze({ label:"Go to Today", kind:"route", href:"#today", expectedDestination:"Today" }) })
});

export class DiscoveryEmptyStateError extends Error {
  constructor(message) { super(message); this.name = "DiscoveryEmptyStateError"; }
}

export function buildGuidedEmptyState(area = "", options = {}) {
  const key = clean(area).toLocaleLowerCase("en-US");
  const definition = definitions[key];
  if (!definition) throw new DiscoveryEmptyStateError("Choose a supported guided empty-state area.");
  const state = ["empty", "filtered-empty", "unavailable", "unauthorized"].includes(clean(options.state)) ? clean(options.state) : "empty";
  const override = stateCopy[state];
  const result = Object.freeze({
    area:key,
    state,
    title:override.title || definition.title,
    purpose:definition.purpose,
    next:override.next || definition.next,
    action:override.action || definition.action,
    example:state === "empty" ? definition.example || null : null,
    truthful:Object.freeze({ fakeRecords:0, hiddenRecordsInspected:false, sourceUnavailable:state === "unavailable", unauthorized:state === "unauthorized" })
  });
  validateGuidedEmptyState(result);
  return result;
}

export function validateGuidedEmptyState(value = {}) {
  if (!clean(value.title) || !clean(value.purpose) || !clean(value.next) || !clean(value.action?.label) || !clean(value.action?.kind)) {
    throw new DiscoveryEmptyStateError("A guided empty state requires purpose, next-step guidance, and one real action.");
  }
  if (/^(?:no data|nothing here|no items)\.?$/i.test(clean(value.title))) {
    throw new DiscoveryEmptyStateError("Generic empty-state copy is not sufficient guidance.");
  }
  return true;
}

export const DISCOVERY_EMPTY_STATE_DEFINITIONS = definitions;
