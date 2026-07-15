import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  ALLOWED_DATA_ATTRIBUTE_KEYS,
  escapeAttribute,
  escapeHtml,
  renderDataAttributes
} from "./ui/html.mjs";
import {
  normalizeRecordDeepLink,
  normalizeSourceLink,
  renderSafeLink,
  safeLinkDetails
} from "./ui/links.mjs";
import {
  ACTION_STATUS_KINDS,
  confirmationWasApproved,
  createActionStatus,
  createConfirmationContract,
  renderActionStatus
} from "./ui/feedback.mjs";
import {
  BUTTON_INTENTS,
  BUTTON_VARIANTS,
  STATUS_STATES,
  renderButton,
  renderEmptyState,
  renderErrorState,
  renderFilters,
  renderLoadingState,
  renderPageHeader,
  renderRecordDrawer,
  renderStatusChip,
  renderTabs
} from "./ui/primitives.mjs";
import { normalizeSourceLink as companyMemoryNormalizeSourceLink } from "./company-memory.mjs";

const modulePaths = [
  "scripts/ui/html.mjs",
  "scripts/ui/links.mjs",
  "scripts/ui/feedback.mjs",
  "scripts/ui/primitives.mjs"
];
const moduleSources = Object.fromEntries(modulePaths.map((file) => [file, readFileSync(file, "utf8")]));
const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
const companyMemorySource = readFileSync("scripts/company-memory.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

// Required exports and closed vocabularies.
for (const renderer of [
  escapeHtml,
  escapeAttribute,
  renderSafeLink,
  renderButton,
  renderStatusChip,
  renderEmptyState,
  renderLoadingState,
  renderErrorState,
  renderActionStatus,
  createConfirmationContract,
  renderPageHeader,
  renderTabs,
  renderFilters,
  renderRecordDrawer
]) {
  assert.equal(typeof renderer, "function", "Every required primitive must be exported as a function.");
}
assert.deepEqual(BUTTON_VARIANTS, ["button", "link"]);
assert.deepEqual(BUTTON_INTENTS, ["primary", "secondary", "quiet", "destructive"]);
assert.deepEqual(STATUS_STATES, ["neutral", "informational", "selected", "success", "warning", "danger", "needs-attention"]);
assert.deepEqual(ACTION_STATUS_KINDS, ["informational", "working", "success", "error"]);
assert.deepEqual(ALLOWED_DATA_ATTRIBUTE_KEYS, ["action", "id", "route", "state", "target", "testid"]);

// HTML and attribute escaping: Unicode remains readable; markup and attribute
// boundaries are always encoded.
assert.equal(escapeHtml("Fish & <script>\"x\" 'y'</script>"), "Fish &amp; &lt;script&gt;&quot;x&quot; &#039;y&#039;&lt;/script&gt;");
assert.equal(escapeHtml("Wilma 🐾 — LegalEase"), "Wilma 🐾 — LegalEase");
assert.equal(escapeHtml(""), "");
assert.equal(escapeHtml(null), "");
assert.equal(escapeHtml(undefined), "");
assert.equal(escapeHtml(0), "0");
assert.equal(escapeAttribute("a\nb`c\"d"), "a&#10;b&#96;c&quot;d");
const allowedData = renderDataAttributes({ action:"save", id:"record-1", onclick:"alert(1)", style:"display:none", testid:"save-button" });
assert.match(allowedData, /data-action="save"/);
assert.match(allowedData, /data-id="record-1"/);
assert.match(allowedData, /data-testid="save-button"/);
assert.doesNotMatch(allowedData, /onclick|style/);

// Preserve the existing canonical source-link policy exactly and add only the
// explicit sourceRef-style record contract for exact item deep links.
const legacyNormalizeSourceLink = (input) => {
  const clean = (value = "") => String(value ?? "").trim();
  if (!input || typeof input !== "object") return null;
  const target = clean(input.target);
  if (!target) return null;
  if (input.kind === "external") return /^https:\/\/[^\s]+$/i.test(target) ? { kind:"external", target } : null;
  const page = target.replace(/^#/, "");
  return /^[a-z0-9-]+$/i.test(page) ? { kind:"page", target:`#${page}` } : null;
};
const linkFixtures = [
  { kind:"page", target:"#today" },
  { kind:"page", target:"app-status" },
  { kind:"external", target:"https://example.com/path?q=one" },
  { kind:"external", target:"http://example.com" },
  { kind:"external", target:"javascript:alert(1)" },
  { kind:"page", target:"#two words" },
  { kind:"page", target:"data:text/html,hello" },
  null
];
for (const fixture of linkFixtures) {
  assert.deepEqual(normalizeSourceLink(fixture), legacyNormalizeSourceLink(fixture), `Source-link behavior changed for ${JSON.stringify(fixture)}.`);
}
assert.equal(companyMemoryNormalizeSourceLink, normalizeSourceLink, "Company Memory must re-export the one canonical link policy.");
assert.deepEqual(normalizeRecordDeepLink({ collection:"posts", itemId:"post / 7" }), { kind:"record", target:"#item/posts/post%20%2F%207" });
assert.equal(normalizeRecordDeepLink({ collection:"posts<script>", itemId:"7" }), null);
assert.equal(normalizeRecordDeepLink({ collection:"posts", itemId:"" }), null);
assert.deepEqual(safeLinkDetails({ kind:"page", target:"#today" }), { href:"#today", external:false, kind:"page" });
assert.equal(safeLinkDetails({ kind:"external", target:"javascript:alert(1)" }), null);
assert.equal(safeLinkDetails({ kind:"external", target:"data:text/html,<script>alert(1)</script>" }), null);
assert.equal(safeLinkDetails({ kind:"external", target:"http://example.com" }), null);
assert.equal(safeLinkDetails({ kind:"external", target:'https://example.com/"onmouseover="alert(1)' }), null);
assert.equal(safeLinkDetails({ kind:"page", target:"#bad/route" }), null);
const externalLink = renderSafeLink({ label:"Open result", link:{ kind:"external", target:"https://example.com/result" } });
assert.match(externalLink, /href="https:\/\/example\.com\/result"/);
assert.match(externalLink, /target="_blank" rel="noopener noreferrer"/);
assert.match(renderSafeLink({ label:"Today", link:{ kind:"page", target:"#today" } }), /href="#today"/);
assert.equal(renderSafeLink({ label:"Unsafe", link:{ kind:"external", target:"javascript:alert(1)" } }), "");

// Button behavior, safe attributes, and accessible names.
for (const intent of BUTTON_INTENTS) {
  const output = renderButton({ label:"Save", intent, action:"save" });
  assert.match(output, new RegExp(`ui-button--${intent}`));
  assert.match(output, /aria-label="Save"/);
}
assert.match(renderButton({ label:"Save", intent:"unknown", action:"save" }), /ui-button--secondary/);
assert.match(renderButton({ label:"Create", variant:"unknown", action:"create" }), /^<button/);
assert.match(renderButton({ label:"Save", action:"save", disabled:true }), /disabled aria-disabled="true"/);
const workingButton = renderButton({ label:"Save", workingLabel:"Working…", action:"save", loading:true });
assert.match(workingButton, /aria-busy="true"/);
assert.match(workingButton, /disabled aria-disabled="true"/);
assert.match(workingButton, />Working…</);
assert.doesNotMatch(workingButton, /onclick=/);
assert.match(renderButton({ label:"Publish", icon:"↗", action:"publish" }), /aria-hidden="true">↗<\/span>/);
assert.equal(renderButton({ label:"Unsafe", variant:"link", link:{ kind:"external", target:"javascript:alert(1)" } }), "");
assert.match(renderButton({ label:"Open docs", variant:"link", link:{ kind:"external", target:"https://example.com/docs" } }), /noopener noreferrer/);
const injectedButton = renderButton({ label:'Save <script>alert(1)</script>', action:"save", dataAttributes:{ onclick:"alert(1)", style:"display:none" } });
assert.doesNotMatch(injectedButton, /<script>|onclick=|style=/);
assert.match(injectedButton, /&lt;script&gt;/);
assert.match(renderButton({ label:"Unwired" }), /disabled aria-disabled="true"/, "A button without a form role or explicit action must fail closed.");

// Status and page-state semantics are visible, escaped, and not color-only.
for (const state of STATUS_STATES) {
  const chip = renderStatusChip({ label:"Needs attention", state });
  assert.match(chip, /role="status"/);
  assert.match(chip, />Needs attention<\/span>/);
}
assert.match(renderStatusChip({ label:"Current", state:"unknown" }), /data-state="neutral"/);
const emptyState = renderEmptyState({
  title:"No files yet",
  explanation:"Add a reviewed file when it is ready.",
  primaryAction:{ label:"Add file", action:"add-file", intent:"primary" }
});
assert.match(emptyState, /role="status"/);
assert.match(emptyState, /Add file/);
assert.match(renderLoadingState({ title:"Loading files", explanation:"Checking current records." }), /aria-busy="true"/);
const errorState = renderErrorState({
  title:"Files could not load",
  explanation:'The response included <script>alert(1)</script>.',
  primaryAction:{ label:"Retry", action:"retry" }
});
assert.match(errorState, /role="alert"/);
assert.match(errorState, /data-action="retry"/);
assert.doesNotMatch(errorState, /<script>/);

// Existing action feedback remains one system; this helper only renders a pure
// status contract for later adoption.
assert.deepEqual(createActionStatus({ kind:"working", title:"Working", message:"Saving this file." }), {
  kind:"working", title:"Working", message:"Saving this file.", busy:true
});
assert.ok(Object.isFrozen(createActionStatus({ title:"Saved" })));
assert.match(renderActionStatus({ kind:"success", title:"Saved", message:"Your changes are current." }), /role="status"/);
assert.match(renderActionStatus({ kind:"error", title:"Could not save", message:"Try again." }), /role="alert"/);
assert.match(renderActionStatus({ kind:"unknown", title:"Update" }), /data-state="informational"/);

// Confirmation is immutable plain data, not a second modal system. Dismissal,
// cancellation, missing input, and arbitrary truthy values are never approval.
const confirmation = createConfirmationContract({
  action:"Delete file",
  title:"Delete this file?",
  consequence:"The file will no longer appear in Files.",
  destructive:true
});
assert.ok(Object.isFrozen(confirmation));
assert.equal(confirmation.destructive, true);
assert.equal(confirmationWasApproved(confirmation, "confirm"), true);
for (const response of ["dismiss", "cancel", true, false, null, undefined, "yes"]) {
  assert.equal(confirmationWasApproved(confirmation, response), false);
}
assert.equal(createConfirmationContract({ action:"Delete" }), null);

// Collection and record-shell accessibility.
const header = renderPageHeader({
  eyebrow:"Files",
  title:"Investor Room",
  description:"Current investor materials.",
  primaryAction:{ label:"Add file", action:"add-file", intent:"primary" }
});
assert.match(header, /^<header/);
assert.match(header, /<h1>Investor Room<\/h1>/);
const tabs = renderTabs({
  label:"File views",
  tabs:[
    { label:"Current", link:{ kind:"page", target:"#assets" }, active:true },
    { label:"Archived", link:{ kind:"page", target:"#dataroom" } }
  ]
});
assert.match(tabs, /role="tablist"/);
assert.match(tabs, /aria-selected="true" aria-current="page"/);
assert.match(tabs, /aria-selected="false"/);
const filters = renderFilters({
  label:"Filter files",
  filters:[
    { id:"file-search", label:"Search files", type:"search", value:'<script>alert(1)</script>' },
    { id:"file-status", label:"Status", type:"select", value:"current", options:[{ label:"Current", value:"current" }, { label:"Archived", value:"archived" }] }
  ]
});
assert.match(filters, /aria-label="Filter files"/);
assert.match(filters, /<label for="file-search">Search files<\/label>/);
assert.match(filters, /<label for="file-status">Status<\/label>/);
assert.doesNotMatch(filters, /<script>/);
const drawer = renderRecordDrawer({
  id:"partner-record",
  title:"North Star Legal",
  subtitle:"Partner",
  status:{ label:"In conversation", state:"informational" },
  closeLabel:"Close partner",
  tabs:{ label:"Partner details", tabs:[{ label:"Overview", link:{ kind:"page", target:"#partners" }, active:true }] },
  body:'Notes include <img src=x onerror="alert(1)">.',
  actions:[{ label:"Save", action:"save-partner", intent:"primary" }]
});
assert.match(drawer, /role="dialog" aria-modal="false" aria-labelledby="partner-record-title"/);
assert.match(drawer, /aria-label="Close partner"/);
assert.match(drawer, /data-action="close-drawer"/);
assert.doesNotMatch(drawer, /<img/);
assert.match(drawer, /&lt;img/);

// User-facing text in representative output must not leak machine tokens or
// placeholders. Structural class and data values are intentionally ignored.
const representativeOutput = [externalLink, workingButton, emptyState, errorState, header, tabs, filters, drawer].join("");
const visibleText = representativeOutput.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
assert.doesNotMatch(visibleText, /\b[a-z]+_[a-z0-9_]+\b/);
assert.doesNotMatch(visibleText, /\b(?:TODO|TBD|placeholder|lorem ipsum|coming soon)\b/i);
const renderedTags = [...representativeOutput.matchAll(/<[^>]+>/g)].map((match) => match[0]).join(" ");
assert.doesNotMatch(renderedTags, /\son[a-z]+\s*=|javascript:|data:text\/html/i);

// Modules remain side-effect-free and depend only on sibling pure UI modules.
for (const [file, source] of Object.entries(moduleSources)) {
  assert.doesNotMatch(source, /\bprocess\s*\.|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/);
  assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|globalThis)\s*\./);
  assert.doesNotMatch(source, /\b(?:readFile|writeFile|createServer|listen|setTimeout|setInterval)\s*\(/);
  assert.doesNotMatch(source, /\bconsole\s*\.|\bimport\s*\(/);
  for (const importLine of source.match(/^\s*import[^\n]+$/gm) || []) {
    assert.match(importLine, /from "\.\/(?:html|links)\.mjs";/, `${file} imports a non-UI runtime layer: ${importLine}`);
  }
  assert.doesNotMatch(source, /from ["'][^"']*(?:preview-server|storage|database|network|state|server|outreach|sending|publish|business-engine)[^"']*["']/i);
}

// Bounded adoption fixtures: the auth message produces the same HTML for every
// representative string, and company-memory retains its exact public link API.
const legacyEscape = (value = "") => String(value || "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[character]);
for (const fixture of ["", "Connected.", "Tom & Ana", "<script>alert('x')</script>", "LegalEase 🐾"]) {
  assert.equal(escapeHtml(fixture), legacyEscape(fixture));
}
assert.match(serverSource, /import \{ escapeHtml \} from "\.\/ui\/html\.mjs";/);
assert.match(serverSource, /const helperMessage = escapeHtml\(options\.message \|\| ""\);/);
assert.doesNotMatch(serverSource, /const helperMessage = String\(options\.message \|\| ""\)\.replace/);
assert.match(companyMemorySource, /import \{ normalizeSourceLink \} from "\.\/ui\/links\.mjs";/);
assert.match(companyMemorySource, /export \{ normalizeSourceLink \} from "\.\/ui\/links\.mjs";/);

// The complete legacy htmlShell source is a stable fixture. CCX-006 intentionally
// removes a blocked external font request, loads the shared same-origin token file,
// and applies two narrow contrast remediations; other shell changes must update
// this reviewed fixture deliberately.
const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", shellStart);
assert.ok(shellStart >= 0 && shellEnd > shellStart);
const shellHash = createHash("sha256").update(serverSource.slice(shellStart, shellEnd)).digest("hex");
assert.equal(shellHash, "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187");

assert.equal(packageJson.scripts["test:vnext-ui-primitives"], "node scripts/test-vnext-ui-primitives.mjs");
const extendedRunner = readFileSync("scripts/run-extended-tests.mjs", "utf8");
assert.match(extendedRunner, /f\.startsWith\("test-"\) && f\.endsWith\("\.mjs"\)/, "The focused test must be auto-discovered by the extended chain.");

console.log("vNext UI primitives verified: pure contracts, escaping and link safety, accessibility, and bounded behavior-equivalent adoption.");
