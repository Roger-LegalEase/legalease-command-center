#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

// PORTED 2026-07-26 (hygiene, extended-test triage). The boundary regex only stopped at a sibling
// `function` declaration, so it OVER-CAPTURED: proofWorkspaceHtml is followed by
// `const MORE_DIRECTORY_GROUPS`, a nav catalogue containing the words "Production",
// "RCAP workspace" and similar. That catalogue was being pulled into the `proof` block and tripping
// the forbidden-term assertions below, which is why they read as a Proof-workspace leak when the
// Proof workspace is clean. The boundary now also stops at a sibling const/let/var declaration.
function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n    (?:async function|function|const|let|var) [a-zA-Z0-9_$]+/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const renderBlock = functionBlock("render()");
const proof = functionBlock("proofWorkspaceHtml");
const routeAliases = source.match(/const routeAliases = \{([\s\S]*?)\};/)?.[1] || "";

assert(renderBlock.includes('safeRenderModule("proof", () => proofWorkspaceHtml(pageClass))'), "#proof should render the Proof workspace");
assert(routeAliases.includes('kpis:"proof"') || routeAliases.includes('kpis: "proof"'), "#kpis should route to Proof / Metrics");
assert(routeAliases.includes('metrics:"proof"') || routeAliases.includes('metrics: "proof"'), "#metrics should route to Proof / Metrics");

// PORTED 2026-07-26 (hygiene, extended-test triage). Most of this suite's drift is a deliberate
// COPY-CASE change: the Proof workspace section headings moved from Title Case to sentence case
// ("Proof Summary" -> "Proof summary", "Next Proof Move" -> "Next proof move", "Evidence / Data
// Room" -> "Evidence / data room", and so on). Those are recased below, not removed — every one
// of those sections still exists and is still asserted.
//
// Six strings are genuinely gone from the workspace and are replaced by the copy that now
// carries the same promise, so no guarantee is dropped:
//   - the hero subtitle was rewritten; the new one still says proof stays internal until review
//   - "Internal only" / "Ready for review" badges were replaced by the "review-ready draft"
//     badge (asserted below) plus "Proof stays internal until Roger reviews it." (already here)
//   - the "Track the numbers..." / "Turn evidence into reports..." / "Turn proof, metrics, and
//     wins..." section subtitles were replaced by compact section metas, asserted below
for (const required of [
  "Proof",
  "Outcomes and reporting — the look-back surface for investor, partner, and acquirer evidence. Everything here stays internal until you review it.",
  "review-ready draft",
  "Proof summary",
  "what supports the next update",
  "Recent Proof",
  "Recent proof",
  "latest evidence-room records",
  "Evidence Items",
  "Metrics Updated",
  "Reports Ready",
  "People Helped",
  "Packets Created",
  "Source integrity",
  "high-risk metrics stay unfabricated",
  "Investor proof",
  "Partner Proof",
  "Next proof move",
  "do this first",
  "Evidence / data room",
  "index · reports · data room · SOC 2",
  "Metrics / KPIs",
  "Revenue",
  "Leads",
  "Petitions",
  "Partners",
  "Content output",
  "Proof captured",
  "Manual posts",
  "Runway",
  "Reports",
  "Data Room",
  "Data room",
  "Proof gaps",
  "evidence that needs filling",
  "Add Proof",
  "Add Metric",
  "Generate Report",
  "Add to Data Room",
  "Needs update",
  "No value added yet.",
  "not yet wired",
  "Proof outputs",
  "reports · investor · partner · data room",
  "Acquisition readiness",
  "SOC 2 evidence",
  "Investor update builder",
  "Investor updates are internal drafts until Roger shares them.",
  "No dedicated people-helped source collection is present in state.",
  "No dedicated packets-created source collection is present in state.",
  "Proof stays internal until Roger reviews it."
]) {
  assert(proof.includes(required), `Proof workspace should include ${required}`);
}

for (const action of [
  "Create Proof Item",
  "Update Metrics",
  "Turn into Post",
  "Add Evidence",
  "Link to Win",
  "Turn into Report",
  "Open Source",
  "Attach File",
  "Link Metric",
  "Update Metric",
  "Generate Investor Update",
  "Add Founder Note",
  "Review draft",
  "Review Report",
  "Add Partner Proof",
  "Link to Partner",
  "Add Document",
  "Prepare Export"
]) {
  assert(proof.includes(action), `Proof workspace should include action ${action}`);
}
// PORTED 2026-07-26 (hygiene, extended-test triage). "Review Draft" was recased to
// "Review draft" (handled above). Five action labels are genuinely gone from the Proof workspace:
// "Add Win", "Add to Pitch Deck Notes", "Turn into Partner Report" and "Add Report" have no
// occurrence anywhere in scripts/ or lib/, and "Add Note" survives only on task rows and the
// cockpit capture box, not in Proof. Rather than silently drop them, this asserts the capability
// each represented is still reachable through the action that replaced it, so the workspace
// cannot lose its create / report / data-room affordances unnoticed.
for (const [goneLabel, replacementLabel] of [
  ["Add Win", "Add Proof"],
  ["Add Note", "Add Founder Note"],
  ["Add to Pitch Deck Notes", "Add to Data Room"],
  ["Turn into Partner Report", "Turn into Report"],
  ["Add Report", "Generate Report"]
]) {
  assert(!proof.includes(goneLabel), `${goneLabel} is no longer a Proof action; if it came back, assert it directly instead of via its replacement`);
  assert(proof.includes(replacementLabel), `${replacementLabel} must remain as the replacement for the removed ${goneLabel} action`);
}

// PORTED 2026-07-26 (hygiene, extended-test triage). The `.proof-preview` CSS class no longer
// exists; evidence-card actions are laid out by `.command-panel-actions`. The attachment control
// is what this assertion was protecting, so it is asserted structurally (the control lives in the
// actions row and is disabled with a stated reason) rather than via a dead class name.
assert.match(source, /\.command-panel-actions\s*\{[^}]*\}/s, "Evidence cards should keep a styled actions row");
assert.match(proof, /<div class="command-panel-actions">(?:(?!<\/div>).)*?<button[^>]*disabled[^>]*title="File attachments can be added next\."[^>]*>Attach File<\/button>/s, "Attach File should sit in the evidence actions row, disabled with a clear reason when not wired");
assert(proof.includes("File attachments can be added next."), "Attach File should be disabled with a clear reason when not wired");
assert.equal((proof.match(/Not added yet\./g) || []).length, 0, "Proof metrics should use compact Needs update copy instead of repeated Not added yet.");
// Section headings are sentence case now; these three orderings are unchanged in intent. Each
// index is checked to be present first, because indexOf(-1) would make the comparison pass
// vacuously if a heading were renamed again.
for (const heading of ["<h2>Recent proof", "<h2>Evidence / data room", "<h2>Reports", "<h2>Proof outputs", "<h2>Data room"]) {
  assert(proof.includes(heading), `Proof workspace should render the ${heading}</h2> section`);
}
assert(proof.indexOf("<h2>Recent proof") < proof.indexOf("<h2>Evidence / data room"), "Evidence should appear close to Recent proof in the main proof column");
assert(proof.indexOf("<h2>Evidence / data room") < proof.indexOf("<h2>Reports"), "Evidence should be visible before lower report sections");
assert(proof.indexOf("<h2>Proof outputs") < proof.indexOf("<h2>Data room"), "Reports, investor proof, partner proof, and data room should be grouped under Proof outputs");

for (const forbidden of [
  "API status",
  "OAuth",
  "token",
  "webhook",
  "audit event",
  "internal state",
  "generated client",
  "route map",
  "artifact",
  "live gates",
  "external action dispatcher",
  "schema",
  "diagnostics",
  "RCAP Program Review",
  "Recovery Mode",
  "Production",
  "RCAP review packet approved",
  "First campaign upload created",
  "Partner follow-up completed",
  "Image generation workflow ready",
  "Content queue organized",
  "Customer note",
  "Partner follow-up email note",
  "Clean Slate partner note",
  "Campaign upload screenshot",
  "Manual posting result",
  "Weekly Evidence Pack",
  "Impact Report",
  "Data Room Export",
  "Pitch Decks",
  "Formation Docs",
  "Cap Table",
  "Monthly Updates",
  "RCAP partner"
]) {
  assert(!proof.includes(forbidden), `Proof normal UI should not include ${forbidden}`);
}

assert(proof.includes("buildEvidenceOverview(state)"), "Proof should read the evidence overview helper.");
assert(proof.includes("buildEvidenceIndex(state)"), "Proof should read the evidence index helper.");
assert(proof.includes("state.soc2Evidence"), "Proof should keep SOC 2 evidence sourced from state.soc2Evidence.");
assert(proof.includes("overview.report_count"), "Proof report counts should come from the evidence overview.");
assert(proof.includes("dataRoomEvidence.length"), "Data Room counts should come from indexed data room evidence.");
// PORTED 2026-07-26 (hygiene, extended-test triage). These two regexes were written with DOUBLED
// backslashes inside regex literals, so `[\\s\\S]` matched a literal backslash followed by s or S
// and `\\d` matched a backslash followed by d. Neither could ever match real template text, so
// both assertions were VACUOUS — they passed regardless of what the Proof template rendered. This
// is the same single/double-backslash class that has bitten this repo before. Corrected to real
// character classes; both still pass, because the values are derived (peopleHelped.value /
// packetsCreated.value) rather than typed in.
assert(!/People Helped[\s\S]{0,500}\b\d+\b/.test(proof), "People helped must not render a hard-coded number in the Proof template.");
assert(!/Packets Created[\s\S]{0,500}\b\d+\b/.test(proof), "Packets created must not render a hard-coded number in the Proof template.");

assert(source.includes("leeBubbleHtml"), "Le-E bubble should remain part of the app shell");
assert(source.includes("liveGatesCount:0"), "Safe fallback state should keep liveGatesCount at 0");

console.log("proof workspace tests passed.");
