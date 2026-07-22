import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADVANCED_INTERNAL_LABELS,
  APPROVED_ACTION_VERBS,
  CORE_OBJECTS,
  CURRENT_TERMINOLOGY_DRIFT,
  FORBIDDEN_NORMAL_UI_TERMS,
  GLOBAL_UTILITIES,
  LEGACY_TERMINOLOGY,
  PRIMARY_DESTINATIONS,
  PRODUCT_SENTENCE,
  READINESS_AND_SAFETY_LABELS,
  TECHNICAL_CONTEXT_TERMS,
  WORKFLOW_STATUSES,
  founderLanguageRegistry
} from "./ui/labels.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const labelsPath = path.join(root, "scripts", "ui", "labels.mjs");
const docsPath = path.join(root, "docs", "ux-vnext", "founder-language-registry.md");
const serverPath = path.join(root, "scripts", "preview-server.mjs");
const labelsSource = fs.readFileSync(labelsPath, "utf8");
const docsSource = fs.readFileSync(docsPath, "utf8");
const serverSource = fs.readFileSync(serverPath, "utf8");

const expectedPrimary = ["Today", "Inbox", "Relationships", "Social", "Outreach", "Scoreboard", "Support", "Calendar", "Company Health", "Files"];
const expectedUtilities = ["Inbox", "Search", "Create", "Le-E", "Settings", "Help", "Profile"];
const expectedObjects = ["Post", "Campaign", "Partner", "File"];
const expectedStatuses = {
  post: ["Idea", "Draft", "Needs review", "Scheduled", "Published"],
  campaign: ["Draft", "Scheduled", "Active", "Paused", "Completed"],
  partner: ["New", "Qualified", "In conversation", "Proposal", "Active", "Closed"],
  file: ["Draft", "Current", "Needs update", "Archived"],
  inbox: ["Needs me", "Waiting", "Updates"]
};
const expectedReadiness = [
  "Ready to schedule",
  "Ready to launch",
  "Fixes needed",
  "Sending is off",
  "Publishing is off",
  "Delivery tracking is working",
  "Delivery tracking needs attention",
  "Temporarily excluded",
  "Will not receive this campaign",
  "Sending paused",
  "Needs approval",
  "Approved",
  "Completed"
];
const requiredLegacyTerms = [
  "Work",
  "Queue",
  "Review Desk",
  "Campaigns",
  "Growth Inbox",
  "Content Bank",
  "Production",
  "Proof",
  "Evidence Room",
  "Data Room",
  "Reports",
  "Partner Programs",
  "Partner Proposals",
  "Partner Reports",
  "Autonomy",
  "Live gates",
  "Wave",
  "Telemetry",
  "More",
  "Triage",
  "Operator",
  "OS Health",
  "Data Integrity",
  "Smoke Test",
  "Operating Memory"
];

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function assertPlainString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string.`);
  assert.equal(value, value.trim(), `${label} must not have surrounding whitespace.`);
  assert.ok(value.length > 0, `${label} must not be empty.`);
  assert.doesNotMatch(value, /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/, `${label} must not expose a machine token.`);
  assert.doesNotMatch(value, /\b(?:todo|tbd|placeholder|lorem ipsum|coming soon|fixme)\b/i, `${label} must not contain placeholder text.`);
}

function visitStrings(value, label, visitor) {
  if (typeof value === "string") {
    visitor(value, label);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, `${label}[${index}]`, visitor));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) visitStrings(item, `${label}.${key}`, visitor);
  }
}

function assertDeepFrozen(value, label) {
  if (!value || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value), `${label} must be frozen.`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDeepFrozen(item, `${label}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) assertDeepFrozen(item, `${label}.${key}`);
}

assertPlainString(PRODUCT_SENTENCE, "PRODUCT_SENTENCE");
assert.deepEqual(Object.values(PRIMARY_DESTINATIONS), expectedPrimary, "Primary destination labels must match the approved order and spelling.");
assert.deepEqual(duplicates(Object.values(PRIMARY_DESTINATIONS)), [], "Primary destination labels must be unique.");
assert.deepEqual(Object.values(GLOBAL_UTILITIES), expectedUtilities, "Global utility labels must match the approved contract.");
assert.deepEqual(Object.values(CORE_OBJECTS), expectedObjects, "Core object labels must match the approved contract.");
assert.deepEqual(WORKFLOW_STATUSES, expectedStatuses, "Workflow statuses must match the approved contract.");
assert.deepEqual(Object.values(READINESS_AND_SAFETY_LABELS), expectedReadiness, "Readiness and safety labels must match the approved contract.");

for (const [objectName, statuses] of Object.entries(WORKFLOW_STATUSES)) {
  assert.ok(Array.isArray(statuses) && statuses.length > 0, `${objectName} statuses must exist.`);
  assert.deepEqual(duplicates(statuses), [], `${objectName} statuses must be unique within the object.`);
}

for (const group of [
  PRIMARY_DESTINATIONS,
  GLOBAL_UTILITIES,
  CORE_OBJECTS,
  WORKFLOW_STATUSES,
  READINESS_AND_SAFETY_LABELS,
  APPROVED_ACTION_VERBS,
  ADVANCED_INTERNAL_LABELS
]) {
  visitStrings(group, "userFacingLabels", assertPlainString);
}

const legacyTerms = LEGACY_TERMINOLOGY.map((entry) => entry.term);
assert.deepEqual(duplicates(legacyTerms), [], "Legacy terminology entries must be unique.");
for (const term of requiredLegacyTerms) {
  assert.ok(legacyTerms.includes(term), `Missing required legacy terminology disposition for ${term}.`);
}
for (const entry of LEGACY_TERMINOLOGY) {
  for (const field of ["term", "replacement", "disposition", "normalUi", "notes"]) {
    assertPlainString(entry[field], `legacy.${entry.term}.${field}`);
  }
  assert.ok(Array.isArray(entry.allowedContexts), `legacy.${entry.term}.allowedContexts must be an array.`);
  entry.allowedContexts.forEach((context, index) => assertPlainString(context, `legacy.${entry.term}.allowedContexts[${index}]`));
}

assert.deepEqual(
  FORBIDDEN_NORMAL_UI_TERMS.slice().sort(),
  LEGACY_TERMINOLOGY.filter((entry) => entry.normalUi === "Forbidden").map((entry) => entry.term).sort(),
  "Every forbidden normal-UI term must be explicitly registered."
);
assert.deepEqual(duplicates(FORBIDDEN_NORMAL_UI_TERMS), [], "Forbidden normal-UI terms must be unique.");

for (const entry of TECHNICAL_CONTEXT_TERMS) {
  assertPlainString(entry.term, "technical.term");
  assertPlainString(entry.normalUiAlternative, `technical.${entry.term}.normalUiAlternative`);
  assert.ok(entry.allowedContexts.length > 0, `Technical term ${entry.term} must have at least one allowed context.`);
  entry.allowedContexts.forEach((context, index) => assertPlainString(context, `technical.${entry.term}.allowedContexts[${index}]`));
}

visitStrings(founderLanguageRegistry, "founderLanguageRegistry", assertPlainString);
assertDeepFrozen(founderLanguageRegistry, "founderLanguageRegistry");

assert.doesNotMatch(labelsSource, /^\s*import\s/m, "The labels module must not import runtime or other dependencies.");
for (const forbiddenSourcePattern of [
  /\bprocess\s*\./,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bsetTimeout\s*\(/,
  /\bsetInterval\s*\(/,
  /\bconsole\s*\./,
  /\b(?:readFile|writeFile|createServer)\s*\(/,
  /\.listen\s*\(/,
  /\b(?:window|document|globalThis)\s*\./,
  /\bimport\s*\(/
]) {
  assert.doesNotMatch(labelsSource, forbiddenSourcePattern, `The labels module must remain side-effect-free: ${forbiddenSourcePattern}.`);
}

for (const forbiddenModuleReference of ["preview-server", "storage", "environment", "runtime", "network", "renderer", "rendering", "server state"]) {
  const importPattern = new RegExp(`^\\s*import[^\\n]+${forbiddenModuleReference}`, "im");
  assert.doesNotMatch(labelsSource, importPattern, `The labels module must not depend on ${forbiddenModuleReference}.`);
}

assert.ok(docsSource.includes(PRODUCT_SENTENCE), "Founder-language documentation must include the product sentence.");
for (const value of [...expectedPrimary, ...expectedUtilities, ...expectedObjects, ...expectedReadiness]) {
  assert.ok(docsSource.includes(value), `Founder-language documentation must include ${value}.`);
}
const legacySection = docsSource.split("## Legacy terminology replacements")[1]?.split("## Terms forbidden in normal UI")[0] || "";
const documentedLegacyTerms = [...legacySection.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
assert.deepEqual(duplicates(documentedLegacyTerms), [], "Founder-language documentation must not duplicate legacy terminology rows.");
assert.deepEqual(documentedLegacyTerms.slice().sort(), legacyTerms.slice().sort(), "Every legacy term must have a documented disposition.");

function requiredSlice(source, startToken, endToken, label) {
  const start = source.indexOf(startToken);
  assert.ok(start >= 0, `Could not locate ${label} start in preview-server.mjs.`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(end > start, `Could not locate ${label} end in preview-server.mjs.`);
  return source.slice(start, end);
}

function textNodes(source) {
  return [...source.replace(/<!--[\s\S]*?-->/g, "").matchAll(/>([^<>]+)</g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

const primaryNavAt = serverSource.indexOf('<nav class="top-nav"');
assert.ok(primaryNavAt >= 0, "Could not locate the current primary navigation.");
const shellStart = serverSource.lastIndexOf("<body>", primaryNavAt);
const shellEnd = serverSource.indexOf('<main id="app"', primaryNavAt);
assert.ok(shellStart >= 0 && shellEnd > primaryNavAt, "Could not isolate the current founder shell labels.");

const landingSource = requiredSlice(serverSource, "function sectionLandingConfig", "function surfaceTabsHtml", "section landing labels");
const tabsSource = requiredSlice(serverSource, "function surfaceTabsHtml", "function sectionLandingPageHtml", "secondary tab labels");
const reviewStart = serverSource.lastIndexOf("queue-review-hero");
assert.ok(reviewStart >= 0, "Could not locate the Review Desk heading.");
const reviewSource = serverSource.slice(reviewStart, reviewStart + 800);

const landingLabels = [...landingSource.matchAll(/(?:eyebrow|title):"([^"]+)"/g)].map((match) => match[1]);
for (const match of landingSource.matchAll(/\["([^"]+)","[^"]+"(?:,"([^"]+)")?(?:,"[^"]+")?\]/g)) {
  landingLabels.push(match[1]);
  if (match[2]) landingLabels.push(match[2]);
}
const secondaryTabLabels = [...tabsSource.matchAll(/\["([^"]+)","[^"]+"\]/g)].map((match) => match[1]);
const reviewLabels = [...reviewSource.matchAll(/<(?:div|h1)[^>]*>([^<>]+)<\/(?:div|h1)>/g)].map((match) => match[1].trim());
const normalFounderCopy = {
  Shell: textNodes(serverSource.slice(shellStart, shellEnd)),
  "Section landing pages": landingLabels,
  "Secondary tabs": secondaryTabLabels,
  "Review page": reviewLabels
};

function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i");
}

const actualDrift = FORBIDDEN_NORMAL_UI_TERMS
  .map((term) => ({
    term,
    locations: Object.entries(normalFounderCopy)
      .filter(([, values]) => values.some((value) => termPattern(term).test(value)))
      .map(([location]) => location)
  }))
  .filter((entry) => entry.locations.length > 0);
const expectedDrift = CURRENT_TERMINOLOGY_DRIFT.map(({ term, locations }) => ({ term, locations: [...locations] }));
const normalizeDrift = (entries) => entries
  .map((entry) => ({ term: entry.term, locations: [...entry.locations] }))
  .sort((left, right) => left.term.localeCompare(right.term));

assert.deepEqual(
  normalizeDrift(actualDrift),
  normalizeDrift(expectedDrift),
  "Current founder-facing terminology drift changed. Document added or missing drift before proceeding."
);

const driftSection = docsSource.split("## Current terminology drift")[1]?.split("## Writing rules")[0] || "";
const documentedDriftTerms = [...driftSection.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
assert.deepEqual(documentedDriftTerms.slice().sort(), expectedDrift.map((entry) => entry.term).sort(), "The current terminology drift report must document every detected term.");

console.log(`Current founder-facing terminology drift: ${actualDrift.length} pre-existing term(s); no CCX-002 runtime copy change.`);
for (const entry of actualDrift) console.log(`DRIFT ${entry.term}: ${entry.locations.join(", ")}`);
console.log(`vNext founder-language registry verified: ${expectedPrimary.length} destinations, ${expectedUtilities.length} utilities, ${expectedObjects.length} core objects, ${legacyTerms.length} legacy dispositions.`);
