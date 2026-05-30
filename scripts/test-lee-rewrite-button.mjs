import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "preview-server.mjs"), "utf8");

const rewriteButtonMatch = source.match(/<button[^>]*>[\s\S]*?Rewrite with Le-E[\s\S]*?<\/button>/);
if (rewriteButtonMatch) {
  const rewriteButton = rewriteButtonMatch[0];
  assert(
    /data-lee-prompt=/.test(rewriteButton) || /disabled/.test(rewriteButton),
    "Rewrite with Le-E should use a data prompt handler or be intentionally disabled."
  );
  assert(
    !/onclick=["'][^"']*askLeePrompt\s*\(\s*'[^"']*Rewrite/i.test(rewriteButton),
    "Rewrite with Le-E must not pass natural-language text through a raw single-quoted onclick."
  );
}

assert(!/eval\s*\(/.test(source), "Le-E rewrite path must not use eval.");
assert(!/new\s+Function\s*\(/.test(source), "Le-E rewrite path must not use new Function.");

const unsafeInlineRewritePatterns = [
  /onclick=["'][^"']*Today(?:'|’)s/i,
  /onclick=["'][^"']*What(?:'|’)s/i,
  /onclick=["'][^"']*Rewrite[^"']*'[^"']*(?:Today|What)/i
];
for (const pattern of unsafeInlineRewritePatterns) {
  assert(!pattern.test(source), `Unsafe inline rewrite handler pattern found: ${pattern}`);
}

const escapedPrompts = [
  "Rewrite today's intention from current open work.",
  "Rewrite today’s intention from current open work.",
  "What's moved today?",
  "Today's Focus"
];
for (const prompt of escapedPrompts) {
  assert.doesNotThrow(() => {
    new vm.Script(`askLeePrompt(${JSON.stringify(prompt)})`);
  }, `Prompt should be safe when serialized through JSON.stringify: ${prompt}`);
}

assert(
  /addEventListener\("click",[\s\S]*?data-lee-prompt/.test(source) || /Rewrite unavailable\. The OS is still usable\./.test(source) || !rewriteButtonMatch,
  "Rewrite with Le-E should be delegated, safely disabled, or removed from the daily UI."
);

assert(/textContent/.test(source), "Le-E rewrite UI paths should preserve textContent-safe updates.");
assert(/liveGatesCount[^\n]*0|Live gates[^\n]*0|Publishing is off/i.test(source), "Publishing-off/live-gates-0 signal should remain present.");

console.log(JSON.stringify({
  rewriteButton:"safe-or-disabled",
  evalUsed:false,
  newFunctionUsed:false,
  liveGatesCount:0
}, null, 2));
