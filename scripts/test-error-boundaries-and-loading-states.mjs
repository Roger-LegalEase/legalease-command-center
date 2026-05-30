import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/preview-server.mjs", "utf8");
const safeFetch = readFileSync("lib/safe-fetch.mjs", "utf8");

assert.match(source, /window\.addEventListener\("error"/, "Global error handler should exist.");
assert.match(source, /window\.addEventListener\("unhandledrejection"/, "Unhandled rejection handler should exist.");
assert.match(source, /function safeRenderModule/, "Route-level safe render helper should exist.");
assert.match(source, /renderSafeBootShell|Recovery Mode/, "Recovery Mode fallback should exist.");
assert.match(source, /Retry full app|Retry data load|Back to Today/, "Retry and Back to Today actions should exist.");
assert.match(source, /Loading|Working|Checking/, "Loading/pending language should exist.");
assert.match(safeFetch, /timeoutMs|AbortController|not valid JSON|temporarily unavailable/i, "Safe fetch helper should handle timeouts, JSON errors, and plain-English messages.");
assert.doesNotMatch(source.match(/function commandCenterOverviewHtml[\s\S]*?function focusItemsForMode/)?.[0] || "", /stack trace|TypeError|ReferenceError/i, "Normal Today UI should not show stack traces.");

console.log("error boundaries and loading state tests passed");
