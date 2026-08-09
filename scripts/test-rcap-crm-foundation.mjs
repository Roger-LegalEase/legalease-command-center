// Packet 1 — RCAP Prospect CRM foundation contracts.
//
// Proves the things a later packet would otherwise be free to break quietly: the flag is
// default-off and server-only, the route alias exists in all three places that must agree,
// the capabilities are really registered (an unregistered capability denies every role), and
// no Wave 1 surface carries external-send authority.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RCAP_CRM_ENV_KEY,
  RCAP_PROSPECTS_ALIAS_HASH,
  RCAP_PROSPECTS_ALIAS_ROUTE,
  RCAP_PROSPECTS_CANONICAL_HASH,
  RCAP_PROSPECTS_CANONICAL_ROUTE,
  RCAP_PROSPECTS_VIEW_KEY,
  parseRcapCrmFlag,
  readRcapCrmConfig
} from "./ui/rcap-crm-config.mjs";
import {
  RCAP_ACCOUNT_RELATIONS,
  RCAP_ATTENTION_REASONS,
  RCAP_BLOCKER_FIELDS,
  RCAP_CAPABILITIES,
  RCAP_CONTACT_ELIGIBILITY,
  RCAP_FACT_CLASSES,
  RCAP_LIST_ROW_ACTIONS,
  RCAP_OVERVIEW_ACTIONS,
  RCAP_PHONE_CLASSES,
  RCAP_PROFILE_SECTIONS,
  RCAP_PROFILE_SECTION_GROUPS,
  RCAP_SAVED_VIEWS,
  RCAP_STAGES,
  RCAP_TRUTH_STATES,
  RCAP_WAVE1_EXTERNAL_ACTION_COUNT,
  isCompleteRcapBlocker,
  normalizeRcapSavedView,
  rcapContactIsSendable,
  rcapCount,
  rcapPhoneIsSalesRoute,
  rcapPrimaryAttention,
  rcapStageFromCanonical,
  rcapTruthLabel,
  rcapValue
} from "./rcap-prospect-registries.mjs";
import { capabilities, roleCapabilities, roleHasCapability, roles } from "./roles.mjs";
import { routeRegistry } from "./ui/navigation.mjs";
import { resolveRouteWithContract } from "./ui/route-compatibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

// ---------------------------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------------------------

assert.equal(RCAP_CRM_ENV_KEY, "COMMAND_CENTER_RCAP_CRM_V1", "The flag name is part of the deployment contract.");

assert.equal(readRcapCrmConfig({}).enabled, false, "The RCAP CRM must be OFF when the variable is absent.");
assert.equal(readRcapCrmConfig().enabled, false, "The RCAP CRM must be OFF when no environment is supplied at all.");
assert.equal(readRcapCrmConfig({ [RCAP_CRM_ENV_KEY]: "true" }).enabled, true, "Exactly \"true\" turns the feature on.");

// Strict parsing: anything that merely looks truthy stays off, so a typo cannot ship the
// feature to production.
for (const value of ["TRUE", "True", "1", "yes", "on", " true", "true ", "", null, undefined, true, 1]) {
  assert.equal(
    readRcapCrmConfig({ [RCAP_CRM_ENV_KEY]: value }).enabled,
    false,
    `Only the exact string "true" may enable the feature; ${JSON.stringify(value)} must not.`
  );
}
assert.equal(parseRcapCrmFlag("true"), true);
assert.equal(parseRcapCrmFlag(true), false, "A boolean is not the string \"true\"; env values are always strings.");

// Server-authoritative: the module reads only what the caller passes. It must not reach for
// process.env, window, or location on its own.
const configSource = read("scripts/ui/rcap-crm-config.mjs");
for (const forbidden of ["process.env", "window.", "location.", "document."]) {
  assert.ok(
    !configSource.includes(forbidden),
    `rcap-crm-config.mjs must not read ${forbidden}: the flag is server-authoritative and cannot be set from a browser.`
  );
}
assert.equal(readRcapCrmConfig({ [RCAP_CRM_ENV_KEY]: "true" }).source, "server-environment");

// ---------------------------------------------------------------------------------------------
// Route and alias
// ---------------------------------------------------------------------------------------------

assert.equal(RCAP_PROSPECTS_CANONICAL_ROUTE, "partners", "The canonical workspace stays the existing partners route.");
assert.equal(RCAP_PROSPECTS_ALIAS_ROUTE, "relationships");
assert.equal(RCAP_PROSPECTS_CANONICAL_HASH, "#partners?view=rcap-prospects");
assert.equal(RCAP_PROSPECTS_ALIAS_HASH, "#relationships?view=rcap-prospects");

// The alias belongs to `partners` and to nothing else.
const partnersEntry = routeRegistry.find((entry) => entry.canonicalRoute === "partners");
assert.ok(partnersEntry, "The partners route must exist in the registry.");
assert.ok(partnersEntry.aliases.includes("relationships"), "`relationships` must be a registry alias of `partners`.");
assert.equal(
  routeRegistry.filter((entry) => entry.aliases.includes("relationships")).length,
  1,
  "`relationships` must be owned by exactly one canonical route."
);
assert.ok(
  !routeRegistry.some((entry) => entry.canonicalRoute === "relationships"),
  "`relationships` must be an alias, never a second canonical workspace."
);

// The live server literal must agree with the registry, because the shipped router reads the
// literal and the inventory test compares the two.
const serverSource = read("scripts/preview-server.mjs");
const aliasLiteral = serverSource.match(/const routeAliases = \{([^}]+)\};/)?.[1] || "";
assert.ok(aliasLiteral.includes('relationships:"partners"'), "The live routeAliases object must map relationships to partners.");

// And the human-readable alias map, which the inventory test requires to match exactly.
assert.match(
  read("docs/ux-vnext/legacy-alias-map.md"),
  /^\| `#relationships` \| `#partners` \|/m,
  "The legacy alias map must document the relationships alias."
);

// Behaviour: alias and canonical resolve identically, and the saved-view query survives.
const viaAlias = resolveRouteWithContract(RCAP_PROSPECTS_ALIAS_HASH);
const viaCanonical = resolveRouteWithContract(RCAP_PROSPECTS_CANONICAL_HASH);
assert.equal(viaAlias.kind, "page");
assert.equal(viaAlias.canonicalRoute, "partners");
assert.equal(viaAlias.aliasUsed, "relationships");
assert.equal(viaAlias.safeHash, RCAP_PROSPECTS_CANONICAL_HASH, "The alias must normalise onto the canonical hash, query included.");
assert.equal(viaCanonical.safeHash, RCAP_PROSPECTS_CANONICAL_HASH);
assert.equal(viaAlias.destination, viaCanonical.destination, "Alias and canonical must select the same shell destination.");

// A bare alias still lands on the workspace, and existing partner deep links are untouched.
assert.equal(resolveRouteWithContract("#relationships").safeHash, "#partners");
assert.equal(resolveRouteWithContract("#partners").safeHash, "#partners");
const partnerDeepLink = resolveRouteWithContract("#partners/partner/acct-123");
assert.equal(partnerDeepLink.kind, "object", "Existing partner deep links must keep resolving as objects.");
assert.equal(partnerDeepLink.safeHash, "#partners/partner/acct-123");

// Hostile route values are refused rather than reflected. Markup, encoded markup, and path
// traversal are rejected outright by the shared parser.
for (const hostile of [
  '#relationships?view="><script>',
  "#relationships?view=%3Cscript%3E",
  "#relationships/../../etc",
  "#relationships?view=<img onerror=x>"
]) {
  assert.equal(resolveRouteWithContract(hostile).kind, "unsafe", `${hostile} must be rejected as unsafe.`);
}

// A scheme-shaped value INSIDE the query is not rejected by the parser, and does not need to
// be: the resolved hash is still a `#partners?...` fragment, so it can never navigate anywhere.
// The defence that matters is the saved-view allowlist, which reduces anything unrecognised to
// All rather than echoing it. Both halves are asserted so neither can be dropped later.
const schemeShaped = resolveRouteWithContract("#relationships?view=javascript:alert(1)");
assert.equal(schemeShaped.kind, "page");
assert.ok(schemeShaped.safeHash.startsWith("#partners?"), "A scheme-shaped query value must stay inside the partners fragment.");
assert.equal(
  normalizeRcapSavedView("javascript:alert(1)"),
  "all",
  "An unrecognised view value must be normalised to All, never used or echoed as-is."
);

// ---------------------------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------------------------
//
// The `prospects` route once declared a capability name that did not exist, which denied every
// role including owner. These assertions make that class of bug loud.

for (const capability of Object.values(RCAP_CAPABILITIES)) {
  assert.ok(capabilities.includes(capability), `${capability} must be registered in roles.mjs or it denies every role.`);
}
assert.ok(roleHasCapability("owner", RCAP_CAPABILITIES.approve), "Owner must be able to approve RCAP work.");
assert.ok(roleHasCapability("admin", RCAP_CAPABILITIES.approve), "Admin must be able to approve RCAP work.");
assert.ok(roleHasCapability("operator", RCAP_CAPABILITIES.manage), "An operator must be able to prepare RCAP work.");
assert.equal(
  roleHasCapability("operator", RCAP_CAPABILITIES.approve),
  false,
  "An operator must NOT approve RCAP work: preparation and approval are separate."
);
for (const capability of Object.values(RCAP_CAPABILITIES)) {
  assert.equal(roleHasCapability("viewer", capability), false, `Viewer must not hold ${capability}.`);
}
// No role gained anything beyond the three new names.
for (const role of roles) {
  for (const capability of roleCapabilities[role]) {
    assert.ok(capabilities.includes(capability), `Role ${role} references unregistered capability ${capability}.`);
  }
}

// ---------------------------------------------------------------------------------------------
// Truth states — unknown is never zero
// ---------------------------------------------------------------------------------------------

assert.deepEqual(
  RCAP_TRUTH_STATES.map((state) => state.key),
  ["known", "unknown", "unavailable", "not_connected", "stale", "blocked", "not_applicable", "outcome_unknown"]
);

assert.equal(rcapCount(0).value, 0, "A real zero must survive as zero.");
assert.equal(rcapCount(0).known, true);
assert.equal(rcapCount(7).label, "7");
for (const state of ["unavailable", "not_connected", "unknown", "blocked"]) {
  const count = rcapCount(0, state);
  assert.equal(count.value, null, `An ${state} count must not be 0.`);
  assert.equal(count.known, false);
  assert.notEqual(count.label, "0", `An ${state} count must not render as "0".`);
}
assert.equal(rcapCount("not a number").value, null, "A non-numeric count is unknown, not zero.");
assert.equal(rcapCount(-3).value, null, "A negative count is unknown, not a business conclusion.");

assert.equal(rcapValue("Detroit").known, true);
assert.equal(rcapValue("").known, false, "An empty string is not a known value.");
assert.equal(rcapValue(null).label, rcapTruthLabel("unknown"));
assert.equal(rcapValue("anything", "unavailable").known, false, "An unavailable source cannot yield a known value.");

// ---------------------------------------------------------------------------------------------
// Stage projection — display never writes canonical state
// ---------------------------------------------------------------------------------------------

assert.equal(RCAP_STAGES.length, 10);
assert.deepEqual(RCAP_STAGES.filter((stage) => stage.sideExit).map((stage) => stage.key), ["nurture", "inactive"]);

assert.equal(rcapStageFromCanonical("prospect").key, "research");
assert.equal(rcapStageFromCanonical("Meeting Booked").key, "meeting", "Casing and spacing must not defeat the mapping.");
assert.equal(rcapStageFromCanonical("closed_lost").key, "inactive");
assert.equal(rcapStageFromCanonical("active").key, "partner");
// An unrecognised canonical value must be honest, not flattering.
const unmapped = rcapStageFromCanonical("some_new_stage");
assert.equal(unmapped.key, "research");
assert.equal(unmapped.state, "unknown", "An unmapped canonical stage must report an unknown truth state.");
assert.equal(unmapped.canonical, "some_new_stage", "The canonical value must be preserved for display-side debugging.");
assert.equal(rcapStageFromCanonical("").state, "unknown");

// There must be no inverse: nothing here may turn a display label into a canonical write.
const registrySource = read("scripts/rcap-prospect-registries.mjs");
assert.ok(
  !/export function rcapStageToCanonical/.test(registrySource),
  "No display-to-canonical stage writer may exist: a label must never move a commercial stage."
);

// ---------------------------------------------------------------------------------------------
// Contact eligibility and phone policy
// ---------------------------------------------------------------------------------------------

assert.equal(rcapContactIsSendable("direct_public_business"), true);
assert.equal(rcapContactIsSendable("existing_gmail_relationship"), true);
for (const blocked of ["client_intake", "unverified", "unavailable", "suppressed", "bounced", "do_not_contact"]) {
  assert.equal(rcapContactIsSendable(blocked), false, `${blocked} must never be sendable.`);
}
assert.equal(rcapContactIsSendable("not_a_real_key"), false, "An unknown eligibility must fail closed.");
assert.equal(rcapContactIsSendable(""), false);

// Rule 7: a client-intake line is not a sales route even though it is a valid number.
assert.equal(rcapPhoneIsSalesRoute("business_route"), true);
for (const blocked of ["client_intake", "main_switchboard", "personal_professional", "unknown", "not_available", "nonsense"]) {
  assert.equal(rcapPhoneIsSalesRoute(blocked), false, `${blocked} must not be usable as a sales route.`);
}

// Every eligibility that is not sendable must carry a warning, so the UI can always say why.
for (const entry of RCAP_CONTACT_ELIGIBILITY) {
  if (!entry.sendable) assert.ok(entry.warn, `${entry.key} is not sendable and must warn.`);
  assert.ok(entry.label, `${entry.key} needs a plain-language label.`);
}
assert.equal(RCAP_PHONE_CLASSES.filter((entry) => entry.salesRoute).length, 1, "Exactly one phone class is a sales route.");

// ---------------------------------------------------------------------------------------------
// Attention — exactly one reason, most urgent wins
// ---------------------------------------------------------------------------------------------

assert.equal(rcapPrimaryAttention([]).key, "none");
assert.equal(rcapPrimaryAttention(["no_next_action"]).key, "no_next_action");
assert.equal(
  rcapPrimaryAttention(["no_next_action", "reply_needs_response", "profile_stale"]).key,
  "reply_needs_response",
  "The most urgent reason must win."
);
assert.equal(rcapPrimaryAttention(["blocked", "related_account_conflict"]).key, "related_account_conflict");
assert.equal(rcapPrimaryAttention(["not_a_reason"]).key, "none", "Unknown reasons must be discarded, not rendered.");
assert.equal(rcapPrimaryAttention("not an array").key, "none");
assert.equal(rcapPrimaryAttention(["none", "draft_ready"]).key, "draft_ready");
// Priorities must be unique so the winner is deterministic.
const priorities = RCAP_ATTENTION_REASONS.map((entry) => entry.priority);
assert.equal(new Set(priorities).size, priorities.length, "Attention priorities must be unique.");
// No engine vocabulary may reach the founder surface.
for (const entry of RCAP_ATTENTION_REASONS) {
  assert.ok(
    !/queue|engine|cron|webhook|sendgrid|claim|suppression/i.test(entry.label),
    `Attention label "${entry.label}" leaks internal vocabulary.`
  );
}

// ---------------------------------------------------------------------------------------------
// Saved views and profile contract
// ---------------------------------------------------------------------------------------------

assert.equal(normalizeRcapSavedView("blocked"), "blocked");
assert.equal(normalizeRcapSavedView("nope"), "all", "An unknown saved view must fall back to All, not throw.");
assert.equal(normalizeRcapSavedView(""), "all");
assert.equal(RCAP_SAVED_VIEWS.filter((view) => view.summaryStrip).length, 6, "The summary strip shows exactly six counts.");

assert.equal(RCAP_PROFILE_SECTIONS.length, 15, "The profile contract is exactly fifteen sections.");
assert.deepEqual(
  RCAP_PROFILE_SECTIONS.map((section) => section.number),
  Array.from({ length: 15 }, (_, index) => index + 1),
  "Sections must be numbered 1..15 in order."
);
// Every section belongs to a declared group, and the groups cover all fifteen exactly once.
const groupedNumbers = RCAP_PROFILE_SECTION_GROUPS.flatMap((group) => group.sections);
assert.deepEqual(groupedNumbers.slice().sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1));
for (const section of RCAP_PROFILE_SECTIONS) {
  assert.ok(
    RCAP_PROFILE_SECTION_GROUPS.some((group) => group.key === section.group && group.sections.includes(section.number)),
    `Section ${section.number} is not correctly grouped.`
  );
}

// Rule 23: facts and recommendations must be distinguishable, and only evidence-bearing
// classes may claim to require a source.
assert.equal(RCAP_FACT_CLASSES.length, 6);
assert.equal(RCAP_FACT_CLASSES.find((entry) => entry.key === "verified_fact").requiresSource, true);
assert.equal(RCAP_FACT_CLASSES.find((entry) => entry.key === "recommendation").requiresSource, false);
assert.equal(RCAP_FACT_CLASSES.find((entry) => entry.key === "pilot_hypothesis").requiresSource, false);

// ---------------------------------------------------------------------------------------------
// Blockers must be complete or they are not blockers
// ---------------------------------------------------------------------------------------------

const completeBlocker = Object.fromEntries(RCAP_BLOCKER_FIELDS.map((field) => [field, "stated"]));
assert.equal(isCompleteRcapBlocker(completeBlocker), true);
for (const field of RCAP_BLOCKER_FIELDS) {
  const partial = { ...completeBlocker, [field]: "" };
  assert.equal(isCompleteRcapBlocker(partial), false, `A blocker missing ${field} must not pass as complete.`);
}
assert.equal(isCompleteRcapBlocker({}), false);
assert.equal(isCompleteRcapBlocker(null), false);

// ---------------------------------------------------------------------------------------------
// No external authority anywhere in Wave 1
// ---------------------------------------------------------------------------------------------

const allActions = [...RCAP_OVERVIEW_ACTIONS, ...RCAP_LIST_ROW_ACTIONS];
assert.equal(
  allActions.filter((action) => action.external).length,
  RCAP_WAVE1_EXTERNAL_ACTION_COUNT,
  "Wave 1 grants no external-send authority from any RCAP surface."
);
assert.equal(RCAP_WAVE1_EXTERNAL_ACTION_COUNT, 0);

// Rule 2: no send from Overview. Draft email opens a review destination and writes nothing.
const draft = RCAP_OVERVIEW_ACTIONS.find((action) => action.key === "draft_email");
assert.equal(draft.external, false);
assert.equal(draft.writes, null, "Draft email must not itself write a record.");
assert.equal(draft.opens, "outreach-review", "Draft email opens the review surface and nothing else.");
assert.equal(RCAP_OVERVIEW_ACTIONS.filter((action) => action.primary).length, 1, "Exactly one dominant action per decision surface.");
assert.ok(RCAP_OVERVIEW_ACTIONS.length <= 4, "Overview shows at most four visible actions.");

// The list must offer no send control at all.
assert.ok(
  !RCAP_LIST_ROW_ACTIONS.some((action) => /send|email|draft/i.test(action.key)),
  "The prospect list must expose no send or draft control."
);

// Writes may only target contracts that already exist and are already safe.
for (const action of RCAP_OVERVIEW_ACTIONS) {
  if (action.writes) {
    assert.ok(
      ["activityEvents", "tasks"].includes(action.writes),
      `${action.key} writes ${action.writes}, which is not an existing safe Wave 1 contract.`
    );
  }
}

// Coordination risk is declared, so Packet 4 can warn before outreach.
assert.ok(RCAP_ACCOUNT_RELATIONS.some((relation) => relation.coordinationRisk), "Some relations must carry coordination risk.");
for (const relation of RCAP_ACCOUNT_RELATIONS) {
  assert.ok(relation.label, `${relation.key} needs a label.`);
}

console.log("RCAP CRM foundation contracts verified:", JSON.stringify({
  flagDefault: readRcapCrmConfig({}).enabled,
  aliases: partnersEntry.aliases.length,
  stages: RCAP_STAGES.length,
  sections: RCAP_PROFILE_SECTIONS.length,
  savedViews: RCAP_SAVED_VIEWS.length,
  capabilitiesAdded: Object.values(RCAP_CAPABILITIES).length,
  externalActions: RCAP_WAVE1_EXTERNAL_ACTION_COUNT
}));
