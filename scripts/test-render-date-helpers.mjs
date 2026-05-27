import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const references = [...source.matchAll(/\bformatDate\(/g)].length;
assert(references > 0, "formatDate should be referenced by active render code for this regression test.");
assert(/function formatDate\(value\)/.test(source), "formatDate must be defined in the browser route-render scope.");
assert(/if \(!value\) return "Not recorded";/.test(source), "formatDate must safely handle missing values.");
assert(/Number\.isNaN\(date\.getTime\(\)\)/.test(source), "formatDate must safely handle invalid dates.");
assert(/toLocaleDateString\("en-US"/.test(source), "formatDate should use stable en-US formatting.");

const helperIndex = source.indexOf("function formatDate(value)");
const firstReferenceIndex = source.indexOf("formatDate(", helperIndex + 1);
assert(helperIndex > 0, "formatDate helper must exist.");
assert(firstReferenceIndex > helperIndex, "formatDate helper must be defined before active render calls.");

for (const route of ["overview", "operating-memory"]) {
  assert(source.includes(`"${route}"`), `#${route} route should remain registered.`);
}

assert(!/showRenderFailure\([^)]*formatDate/i.test(source), "formatDate should not be handled by render-error fallback.");
assert(source.includes("operatingMemoryPageHtml"), "#operating-memory render path should exist.");
assert(source.includes("commandCenterOverviewHtml"), "#overview render path should exist.");

console.log("render date helper tests passed");
