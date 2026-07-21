// CCX-002 founder-language contract only. This module is deliberately not wired
// into runtime rendering. It has no imports and performs no external work.

const list = (values) => Object.freeze([...values]);
const record = (values) => Object.freeze({ ...values });

const legacyTerm = (term, replacement, disposition, notes, allowedContexts = []) => record({
  term,
  replacement,
  disposition,
  normalUi: "Forbidden",
  notes,
  allowedContexts: list(allowedContexts)
});

const technicalTerm = (term, normalUiAlternative, allowedContexts) => record({
  term,
  normalUiAlternative,
  allowedContexts: list(allowedContexts)
});

const drift = (term, replacement, locations) => record({
  term,
  replacement,
  locations: list(locations)
});

export const PRODUCT_SENTENCE = "The Command Center helps LegalEase plan today, publish social content, run outreach, manage partners, and organize company files.";

export const PRIMARY_DESTINATIONS = record({
  today: "Today",
  social: "Social",
  outreach: "Outreach",
  partners: "Relationships",
  files: "Files"
});

export const GLOBAL_UTILITIES = record({
  inbox: "Inbox",
  search: "Search",
  create: "Create",
  lee: "Le-E",
  settings: "Settings",
  help: "Help",
  profile: "Profile"
});

export const GLOBAL_CREATE_LABELS = record({
  socialPost: "Social post",
  outreachCampaign: "Outreach campaign",
  partner: "Partner",
  fileOrFolder: "File or folder",
  quickNote: "Quick note"
});

export const CORE_OBJECTS = record({
  post: "Post",
  campaign: "Campaign",
  partner: "Partner",
  file: "File"
});

export const WORKFLOW_STATUSES = record({
  post: list(["Idea", "Draft", "Needs review", "Scheduled", "Published"]),
  campaign: list(["Draft", "Scheduled", "Active", "Paused", "Completed"]),
  partner: list(["New", "Qualified", "In conversation", "Proposal", "Active", "Closed"]),
  file: list(["Draft", "Current", "Needs update", "Archived"]),
  inbox: list(["Needs me", "Waiting", "Updates"])
});

export const READINESS_AND_SAFETY_LABELS = record({
  readyToSchedule: "Ready to schedule",
  readyToLaunch: "Ready to launch",
  fixesNeeded: "Fixes needed",
  sendingOff: "Sending is off",
  publishingOff: "Publishing is off",
  deliveryTrackingWorking: "Delivery tracking is working",
  deliveryTrackingNeedsAttention: "Delivery tracking needs attention",
  temporarilyExcluded: "Temporarily excluded",
  excludedFromCampaign: "Will not receive this campaign",
  sendingPaused: "Sending paused",
  needsApproval: "Needs approval",
  approved: "Approved",
  completed: "Completed"
});

export const APPROVED_ACTION_VERBS = record({
  create: "Create",
  add: "Add",
  save: "Save",
  edit: "Edit",
  view: "View",
  open: "Open",
  schedule: "Schedule",
  publish: "Publish",
  launch: "Launch",
  pause: "Pause",
  resume: "Resume",
  approve: "Approve",
  requestChanges: "Request changes",
  complete: "Complete",
  snooze: "Snooze",
  archive: "Archive",
  restore: "Restore",
  delete: "Delete",
  upload: "Upload",
  download: "Download",
  share: "Share",
  connect: "Connect",
  retry: "Retry"
});

export const ADVANCED_INTERNAL_LABELS = record({
  appStatus: "App Status",
  dataCheck: "Data Check",
  selfCheck: "Self-Check",
  recoveryMode: "Recovery Mode",
  automations: "Automations",
  deliveryDetails: "Delivery details",
  connectionDetails: "Connection details",
  auditHistory: "Audit history",
  systemDiagnostics: "System diagnostics"
});

export const LEGACY_TERMINOLOGY = list([
  legacyTerm("Work", "Use the specific destination or object name", "Replace by context", "Forbidden as a destination or section label; ordinary prose may still use the word work."),
  legacyTerm("Queue", "Inbox", "Replace", "Use Needs me when the label describes the actionable Inbox group."),
  legacyTerm("Review Desk", "Social / Needs review", "Replace", "Review is a state inside Social, not a separate destination."),
  legacyTerm("Campaigns", "Outreach", "Replace", "Use Campaign only for the individual business object."),
  legacyTerm("Growth Inbox", "Capture", "Replace", "Use Inbox for human follow-up and Capture for incoming ideas or signals."),
  legacyTerm("Content Bank", "Ideas", "Replace", "Ideas is a view inside Social."),
  legacyTerm("Production", "Social Library", "Replace", "Use readiness labels for work that still needs attention."),
  legacyTerm("Proof", "Investor Room or Files", "Replace by context", "Use Investor Room for investor material and Files for the broader document workspace."),
  legacyTerm("Evidence Room", "Files or Compliance collection", "Replace by context", "Preserve evidence meaning inside a clearly named Files collection."),
  legacyTerm("Data Room", "Investor Room", "Replace", "Investor material remains a collection inside Files."),
  legacyTerm("Reports", "Results or generated report files", "Replace by context", "Use Results for outcomes and Files for generated artifacts."),
  legacyTerm("Partner Programs", "Programs inside Partner", "Move into object", "Programs live within the related Partner record."),
  legacyTerm("Partner Proposals", "Proposal files inside Partner", "Move into object", "Proposal artifacts also appear in Files without duplicating the source record."),
  legacyTerm("Partner Reports", "Reports inside Partner", "Move into object", "Generated Partner reports also appear in Files."),
  legacyTerm("Autonomy", "Automations", "Replace", "Normal UI explains what an automation will do and what still needs approval.", ["Advanced diagnostics"]),
  legacyTerm("Live gates", "Connection and readiness checks", "Replace", "Exact gate names may remain in authorized diagnostic detail.", ["Advanced diagnostics", "Settings"]),
  legacyTerm("Wave", "Batch", "Replace", "Batch detail belongs under Advanced when it is operationally relevant.", ["Advanced delivery details"]),
  legacyTerm("Telemetry", "Delivery tracking", "Replace", "Precise telemetry fields may remain in authorized diagnostics.", ["Advanced diagnostics"]),
  legacyTerm("More", "No replacement", "Remove", "Move every item to its real destination; do not create another catch-all destination."),
  legacyTerm("Triage", "Review or Sort", "Replace by action", "Choose the verb that describes the decision the user is making."),
  legacyTerm("Operator", "User or owner-specific language", "Replace by role", "Use Owner, Admin, or the person's name when the role matters.", ["Advanced diagnostics", "Audit history"]),
  legacyTerm("OS Health", "App Status", "Replace", "Exact subsystem health names may remain in diagnostic detail.", ["Advanced diagnostics"]),
  legacyTerm("Data Integrity", "Data Check", "Replace", "Technical integrity detail may remain behind Advanced.", ["Advanced diagnostics"]),
  legacyTerm("Smoke Test", "Self-Check", "Replace", "Individual test identifiers may remain in diagnostic results.", ["Advanced diagnostics"]),
  legacyTerm("Operating Memory", "Notes & Decisions", "Replace", "Use the specific record type when one is known."),
  legacyTerm("Growth", "Use Social, Outreach, Partners, or Inbox", "Replace by context", "Growth spans several destinations and must not remain a catch-all label."),
  legacyTerm("RCAP", "Partner program", "Replace in normal UI", "The acronym may remain where an authorized user needs exact program detail.", ["Advanced partner program details"]),
  legacyTerm("LegalEase OS", "Command Center", "Replace", "The product name is Command Center."),
  legacyTerm("System Check", "Self-Check", "Replace", "Use the approved action and advanced label: Start self-check."),
  legacyTerm("Safe Mode", "Recovery Mode", "Replace", "The technical safe-mode name may remain inside recovery diagnostics.", ["Advanced recovery diagnostics", "Settings"])
]);

export const FORBIDDEN_NORMAL_UI_TERMS = list(
  LEGACY_TERMINOLOGY
    .filter((entry) => entry.normalUi === "Forbidden")
    .map((entry) => entry.term)
);

export const TECHNICAL_CONTEXT_TERMS = list([
  technicalTerm("API", "Connection or service", ["Advanced diagnostics", "Settings"]),
  technicalTerm("OAuth", "Connection", ["Advanced diagnostics", "Settings"]),
  technicalTerm("Webhook", "Delivery update", ["Advanced diagnostics", "Settings"]),
  technicalTerm("Telemetry", "Delivery tracking", ["Advanced diagnostics"]),
  technicalTerm("Live gates", "Connection and readiness checks", ["Advanced diagnostics", "Settings"]),
  technicalTerm("Suppression", "Will not receive this campaign", ["Advanced delivery details", "Settings"]),
  technicalTerm("Idempotency key", "Duplicate protection", ["Advanced diagnostics", "Audit history"]),
  technicalTerm("CSRF", "Request protection", ["Advanced diagnostics"]),
  technicalTerm("Environment variable", "Server setting", ["Advanced diagnostics", "Settings"]),
  technicalTerm("Schema", "Data structure", ["Advanced diagnostics"]),
  technicalTerm("Storage backend", "Storage connection", ["Advanced diagnostics", "Settings"]),
  technicalTerm("Provider response", "Connection response", ["Advanced diagnostics", "Audit history"]),
  technicalTerm("Audit event", "Activity record", ["Advanced diagnostics", "Audit history"]),
  technicalTerm("Event ID", "Activity reference", ["Advanced diagnostics", "Audit history"]),
  technicalTerm("Operator", "User or owner", ["Advanced diagnostics", "Audit history"]),
  technicalTerm("RCAP", "Partner program", ["Advanced partner program details"])
]);

export const CURRENT_TERMINOLOGY_DRIFT = list([
  drift("Queue", "Inbox", ["Shell", "Section landing pages", "Secondary tabs"]),
  drift("Review Desk", "Social / Needs review", ["Shell", "Review page"]),
  drift("Campaigns", "Outreach", ["Shell", "Section landing pages", "Secondary tabs"]),
  drift("Growth Inbox", "Capture", ["Section landing pages"]),
  drift("Content Bank", "Ideas", ["Section landing pages", "Secondary tabs"]),
  drift("Production", "Social Library", ["Section landing pages"]),
  drift("Proof", "Investor Room or Files", ["Section landing pages", "Secondary tabs"]),
  drift("Evidence Room", "Files or Compliance collection", ["Section landing pages"]),
  drift("Data Room", "Investor Room", ["Section landing pages", "Secondary tabs"]),
  drift("Reports", "Results or generated report files", ["Shell", "Section landing pages"]),
  drift("Partner Programs", "Programs inside Partner", ["Section landing pages"]),
  drift("Partner Proposals", "Proposal files inside Partner", ["Section landing pages"]),
  drift("Partner Reports", "Reports inside Partner", ["Section landing pages"]),
  drift("Autonomy", "Automations", ["Section landing pages", "Secondary tabs"]),
  drift("More", "No replacement", ["Shell", "Section landing pages"]),
  drift("Operator", "User or owner-specific language", ["Shell"]),
  drift("OS Health", "App Status", ["Secondary tabs"]),
  drift("Data Integrity", "Data Check", ["Secondary tabs"]),
  drift("Growth", "Use Social, Outreach, Partners, or Inbox", ["Section landing pages", "Secondary tabs"]),
  drift("RCAP", "Partner program", ["Section landing pages", "Secondary tabs"]),
  drift("LegalEase OS", "Command Center", ["Shell"]),
  drift("System Check", "Self-Check", ["Shell"]),
  drift("Safe Mode", "Recovery Mode", ["Secondary tabs"])
]);

export const founderLanguageRegistry = record({
  productSentence: PRODUCT_SENTENCE,
  primaryDestinations: PRIMARY_DESTINATIONS,
  globalUtilities: GLOBAL_UTILITIES,
  globalCreate: GLOBAL_CREATE_LABELS,
  coreObjects: CORE_OBJECTS,
  workflowStatuses: WORKFLOW_STATUSES,
  readinessAndSafety: READINESS_AND_SAFETY_LABELS,
  actionVerbs: APPROVED_ACTION_VERBS,
  advancedInternalLabels: ADVANCED_INTERNAL_LABELS,
  legacyTerminology: LEGACY_TERMINOLOGY,
  forbiddenNormalUiTerms: FORBIDDEN_NORMAL_UI_TERMS,
  technicalContextTerms: TECHNICAL_CONTEXT_TERMS,
  currentTerminologyDrift: CURRENT_TERMINOLOGY_DRIFT
});
