import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOUNDER_COMPANY_HEALTH_CONTRACT,
  FOUNDER_COMPANY_HEALTH_STYLESHEET_PATH,
  founderCompanyHealthBrowserSource,
  renderFounderCompanyHealthLoading
} from "./ui/pages/founder-company-health.mjs";

assert.equal(FOUNDER_COMPANY_HEALTH_STYLESHEET_PATH, "assets/ui/founder-company-health.css");
assert.equal(FOUNDER_COMPANY_HEALTH_CONTRACT.endpoint, "/api/ui/company-health");
assert.deepEqual(FOUNDER_COMPANY_HEALTH_CONTRACT.routes, ["company-health", "os-health", "health", "app-status", "system"]);

const html = renderFounderCompanyHealthLoading();
assert.match(html, /data-founder-company-health/);
assert.match(html, /Company Health/);
assert.match(html, /data-health-overall/);
assert.match(html, /data-health-count="healthy"/);
assert.match(html, /data-health-count="needsAttention"/);
assert.match(html, /data-health-count="unavailable"/);
assert.match(html, /Last successful operation/);
assert.match(html, /Nine essential areas/);
assert.match(html, /data-health-advanced-toggle/);
assert.match(html, /data-health-advanced-panel[^>]* hidden/);
assert.match(html, /aria-live="polite"/);
assert.equal((html.match(/founder-health__card-skeleton/g) || []).length, 9);
assert.doesNotMatch(html, /raw log|environment name|secret|collection|provider payload|storage backend/i);

const source = founderCompanyHealthBrowserSource();
assert.doesNotThrow(() => new Function(source), "generated Company Health browser source must parse");
for (const required of [
  "credentials:\"same-origin\"",
  "?advanced=true",
  "Healthy",
  "Needs attention",
  "Unavailable",
  "Last successful",
  "Advanced checks are not available for this account.",
  "Existing results remain unchanged.",
  "vnext:session-expired",
  "requestAnimationFrame",
  "fullStateRequests:0",
  "externalActions:0",
  "providerCalls:0"
]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(source, /\b(?:alert|confirm|prompt)\s*\(/);
assert.doesNotMatch(source, /method:\s*\"POST\"|x-csrf-token|writeState|writeCollections|location\.reload/);
assert.doesNotMatch(source, /\/api\/(?:state|admin|debug)/);
assert.doesNotMatch(source, /provider\.(?:send|publish|release)|sendEmail\s*\(|publishPost\s*\(/i);

const css = readFileSync(new URL("../assets/ui/founder-company-health.css", import.meta.url), "utf8");
for (const required of [
  ".founder-health__overall",
  ".founder-health__grid",
  ".founder-health__advanced-panel",
  "data-status=\"healthy\"",
  "data-status=\"needs_attention\"",
  "overflow-x: clip",
  ":focus-visible",
  "@media (max-width: 430px)",
  "grid-template-columns: 1fr",
  "prefers-reduced-motion"
]) assert.match(css, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(css, /position:\s*fixed/i, "Company Health controls must not cover mobile navigation");

console.log("PASS test-founder-company-health-ui");
