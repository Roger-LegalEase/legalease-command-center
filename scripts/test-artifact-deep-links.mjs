// Phase O verifier — SHOW ME MY OUTPUT (usability overhaul, approved 2026-07-12).
// Acceptance being pinned:
//   1. Queue-card Open uses the item's sourceRef {collection, itemId} and lands ON the
//      artifact (#item/<collection>/<id>), not on a section list; page links stay as the
//      fallback for items without a ref.
//   2. The #item route parses safely (sanitized collection, decoded id) and renders the
//      artifact viewer with an honest missing-record state.
//   3. Exported report files are readable + downloadable (server route is path-traversal
//      guarded to data/exports/reports only).
//   4. The two dead report families (codebase health, engagement growth) render on the
//      Reports page; Today's Drafts/Meetings modules are clickable, not dead text.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSourceLink } from "./company-memory.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "preview-server.mjs"), "utf8");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("Phase O artifact deep-link tests");

// ---- 1. Open control prefers sourceRef ------------------------------------------------------
{
  const fn = source.match(/function ckOpenControlHtml\(link, cls, sourceRef\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.ok(fn, "ckOpenControlHtml accepts sourceRef");
  assert.ok(fn.indexOf("sourceRef.itemId") < fn.indexOf('link.kind === "page"'),
    "the deep link is checked BEFORE the page fallback");
  assert.ok(fn.includes("encodeURIComponent(String(sourceRef.itemId))"), "item ids are URI-encoded into the hash");
  assert.ok(source.includes('ckOpenControlHtml(item.sourceLink, "button-link", item.sourceRef)'),
    "decisions cards pass their sourceRef");
  assert.ok(source.includes('ckOpenControlHtml(item.sourceLink, "", item.sourceRef)'),
    "Today needs-Roger cards pass their sourceRef");
  ok("queue-card Open lands on the artifact via sourceRef, with the page link as fallback");
}

// ---- 2. #item route + viewer -----------------------------------------------------------------
{
  assert.ok(source.includes('requestedPage.startsWith("item/")'), "router parses #item/<collection>/<id>");
  assert.ok(source.includes("decodeURIComponent(refItemId)"), "item id round-trips through URI encoding");
  assert.ok(source.includes('"safe-mode", "item"]'), "item is a known page");
  assert.ok(source.includes("artifactRef ? requestedPage :"), "canonical-hash rewrite preserves the deep link");
  const viewer = source.match(/function artifactViewerHtml\(pageClass, ref\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.ok(viewer, "artifact viewer exists");
  assert.ok(viewer.includes("This record is not in the loaded data"), "missing records get an honest state, never fabricated");
  assert.ok(viewer.includes("artifactPostPreviewHtml"), "posts and approvals render as the finished post");
  assert.ok(source.includes("function artifactRecordId(record, index)"), "record resolution mirrors the storage id precedence");
  const idFn = source.match(/function artifactRecordId\(record, index\) \{[\s\S]*?\n    \}/)?.[0] || "";
  for (const key of ["record?.id", "record?.contact_id", "record?.postId", "record?.title", "record?.name"]) {
    assert.ok(idFn.includes(key), "id precedence includes " + key);
  }
  ok("#item route parses safely and the viewer renders type-aware with honest fallbacks");
}

// ---- 3. report files readable + downloadable, traversal-guarded -----------------------------
{
  const at = source.indexOf('url.pathname === "/api/reports/file"');
  assert.ok(at > 0, "report-file route exists");
  const block = source.slice(at, at + 1400);
  assert.ok(block.includes('path.resolve(process.cwd(), "data", "exports", "reports")'), "root pinned to the exports directory");
  assert.ok(block.includes("resolved.startsWith(reportsRoot + path.sep)"), "path-traversal guard: resolved path must stay inside it");
  assert.ok(block.includes("Only files under data/exports/reports"), "out-of-root requests are refused with a clear message");
  assert.ok(source.includes("async function viewReportFile("), "in-app report reader exists");
  assert.ok(source.includes("async function downloadReportFile("), "report download exists");
  assert.ok(source.includes(",'reports-file-view')\">Read<"), "Reports page rows wire Read");
  ok("exported report files: readable in-app + downloadable, traversal-guarded server-side");
}

// ---- 4. dead ends wired ----------------------------------------------------------------------
{
  assert.ok(source.includes("function systemReportsSectionHtml()"), "system reports section exists");
  assert.ok(source.includes("state.codebaseHealthSnapshots || [])[0]"), "codebase health renders its latest snapshot");
  assert.ok(source.includes("state.engagementGrowthSnapshots || [])[0]"), "engagement growth renders its latest snapshot");
  assert.ok(source.includes("No codebase health report yet"), "honest empty state for code health");
  assert.ok(source.includes("No engagement and growth report yet"), "honest empty state for growth");
  const drafts = source.match(/function ckDraftsModuleHtml\(ctx\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.ok(drafts.includes("d.sourceRef"), "Today drafts rows deep-link via sourceRef");
  const meetings = source.match(/function ckMeetingsModuleHtml\(ctx\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.ok(meetings.includes("ckOvernightRow"), "Today meetings rows are clickable");
  ok("dead ends wired: system reports render; Today drafts/meetings are clickable");
}

// ---- 5. the sourceRef data contract the deep links depend on --------------------------------
{
  // normalizeSourceLink stays strict (page/external only) — deep links ride on sourceRef, so
  // the link model does not loosen. Pin that.
  assert.equal(normalizeSourceLink({ kind: "page", target: "#queue" })?.target, "#queue");
  assert.equal(normalizeSourceLink({ kind: "page", target: "#item/posts/x" }), null,
    "normalizeSourceLink stays strict; deep links must come from sourceRef, not loosened links");
  ok("link model unchanged: deep links ride the existing sourceRef contract");
}

console.log("\ntest-artifact-deep-links: all " + passed + " checks passed.");
