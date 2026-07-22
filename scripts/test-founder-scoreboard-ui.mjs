import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOUNDER_SCOREBOARD_CONTRACT,
  FOUNDER_SCOREBOARD_STYLESHEET_PATH,
  founderScoreboardBrowserSource,
  renderFounderScoreboardLoading
} from "./ui/pages/founder-scoreboard.mjs";

assert.equal(FOUNDER_SCOREBOARD_STYLESHEET_PATH, "assets/ui/founder-scoreboard.css");
assert.equal(FOUNDER_SCOREBOARD_CONTRACT.endpoint, "/api/ui/scoreboard");
assert.equal(FOUNDER_SCOREBOARD_CONTRACT.financeEndpoint, "/api/ui/scoreboard/finance");
assert.deepEqual(FOUNDER_SCOREBOARD_CONTRACT.routes, ["revenue", "scoreboard", "metrics", "kpis"]);

const html = renderFounderScoreboardLoading();
assert.match(html, /data-founder-scoreboard/);
assert.match(html, /Founder command center/);
assert.match(html, /Missing information stays unavailable/);
assert.match(html, /data-scoreboard-finance-form/);
assert.match(html, /name="currentCashBalance"/);
assert.match(html, /name="monthlyBurn"/);
assert.match(html, /name="asOfDate"/);
assert.match(html, /name="expectedUpdatedAt"/);
assert.match(html, /data-status="live"/);
assert.match(html, /data-status="manual"/);
assert.match(html, /data-status="needs_attention"/);
assert.match(html, /data-status="unavailable"/);
assert.match(html, /aria-live="polite"/);
assert.equal((html.match(/founder-scoreboard__skeleton/g) || []).length, 6);

const source = founderScoreboardBrowserSource();
assert.doesNotThrow(() => new Function(source), "generated Scoreboard browser source must parse");
for (const required of [
  "credentials:\"same-origin\"",
  "x-csrf-token",
  "Saving…",
  "Financial inputs saved.",
  "Existing values remain unchanged.",
  "Previous unavailable",
  "vnext:session-expired",
  "vnext:scoreboard-updated",
  "requestAnimationFrame",
  "duplicateClicksBlocked",
  "fullStateRequests:0",
  "externalActions"
]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(source, /\b(?:alert|confirm|prompt)\s*\(/);
assert.doesNotMatch(source, /location\.reload|window\.open\s*\(/);
assert.doesNotMatch(source, /\/api\/(?:state|admin|debug)/);
assert.doesNotMatch(source, /provider\.(?:send|publish|release)|sendEmail\s*\(|publishPost\s*\(/i);
assert.doesNotMatch(source, /writeState|writeCollections/);

const css = readFileSync(new URL("../assets/ui/founder-scoreboard.css", import.meta.url), "utf8");
for (const required of [
  ".founder-scoreboard__finance-form",
  ".founder-scoreboard__grid",
  "data-status=\"needs_attention\"",
  "overflow-x: clip",
  ":focus-visible",
  "@media (max-width: 430px)",
  "grid-template-columns: 1fr",
  "prefers-reduced-motion"
]) assert.match(css, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(css, /position:\s*fixed/i, "Scoreboard controls must not cover mobile navigation");

console.log("PASS test-founder-scoreboard-ui");
