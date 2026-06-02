#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

assert(source.includes("Proof to Content"), "Growth should still include Proof to Content");
assert(
  source.includes("function founderReadableText"),
  "Growth right rail should have a helper that converts object values into readable strings"
);
assert(
  source.includes("Weekly evidence pack ready for review."),
  "Weekly evidence pack reports should use a founder-facing fallback"
);
assert(
  source.includes("Evidence pack can become a post, pitch, or investor update."),
  "Proof to Content should have readable body fallback copy"
);
assert(
  !source.includes("weekly_evidence_pack</strong>"),
  "Proof to Content should not render raw weekly_evidence_pack labels"
);
assert(
  source.includes(".growth-main-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,.82fr);"),
  "Growth main grid should give the right rail a stronger minimum width"
);
assert(
  source.includes(".growth-main-grid > aside .growth-row { grid-template-columns:1fr;"),
  "Growth right-rail rows should stack content above actions"
);
assert(
  source.includes(".growth-main-grid > aside .growth-item-actions { width:100%;"),
  "Growth right-rail action buttons should use a separate wrapped row"
);
assert(
  source.includes(".growth-main-grid > aside .growth-row span { overflow-wrap:anywhere;"),
  "Growth right-rail copy should wrap safely"
);
assert(
  source.includes("-webkit-line-clamp:3"),
  "Growth right-rail copy should be line-clamped for long descriptions"
);
assert(
  source.includes("@media (max-width:1180px) { .growth-main-grid { grid-template-columns:1fr; }"),
  "Growth right rail should stack before it becomes cramped"
);

console.log("growth right rail layout tests passed.");
