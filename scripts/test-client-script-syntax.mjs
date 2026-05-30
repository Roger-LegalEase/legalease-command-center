import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "preview-server.mjs"), "utf8");

const requiredSafeLabels = [
  "Today’s Focus",
  "Today’s Top 3",
  "What Moved",
  "Save Today’s Operating Memory",
  "End-of-Day Reflection"
];

for (const label of requiredSafeLabels) {
  assert(source.includes(label), `${label} should render with browser-safe label text.`);
}

const unsafeStraightApostropheCommercialLabels = [
  "Today's Focus",
  "Today's Top 3",
  "What's Moved",
  "Save Today's Operating Memory"
];

for (const label of unsafeStraightApostropheCommercialLabels) {
  assert(!source.includes(label), `${label} should not be emitted into active browser script source with a straight apostrophe.`);
}

const onclickAttributes = [...source.matchAll(/onclick=(["'])(?<body>[\s\S]*?)\1/g)].map(match => match.groups.body);
for (const body of onclickAttributes) {
  assert(!/(^|[^\\])'(?:[^']*\b(?:Today|What)'s\b)/.test(body), `Inline onclick must not contain an unescaped apostrophe label: ${body}`);
}

assert(source.includes("JSON.stringify(prompt)"), "Dynamic Le-E prompt labels should be serialized before entering inline JavaScript.");
assert(!/SyntaxError:\s*Unexpected identifier 's'|Can't find variable: build[A-Z]/.test(source), "Source should not contain shipped client syntax or helper ReferenceError output.");
assert(/liveGatesCount[^,\n]*0|Live Gates: 0|Live gates[^<]*0/i.test(source), "Live gates 0 signal should remain represented.");

console.log("Client script syntax regression tests passed.");
