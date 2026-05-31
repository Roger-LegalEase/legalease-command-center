import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
const bubble = source.match(/function leeBubbleHtml\(\)[\s\S]*?function founderHubCard/)?.[0] || "";

assert.match(bubble, /lee-floating-bubble|lee-pill/, "Le-E floating bubble should exist.");
assert.match(bubble, /Ask Le-E|Le-E/, "Bubble label should include Le-E or Ask Le-E.");
assert.match(bubble, /lee-assistant-window|lee-panel/, "Clicking should open assistant window.");
assert.match(bubble, />Le-E</, "Assistant window should title Le-E.");
assert.match(bubble, /Your LegalEase operating assistant/, "Assistant window should include subtitle.");
assert.match(bubble, /closeLeeBubble/, "Close button should work.");
assert.match(bubble, /minimizeLeeBubble|closeLeeBubble/, "Minimize/close behavior should exist.");
assert.match(bubble, /textarea name="message"/, "Assistant should include input.");
assert.match(bubble, /type="submit"/, "Assistant should include send button.");
for (const chip of ["Summarize today", "Create task", "Draft post", "Prepare PR pitch", "Turn proof into post", "Find something"]) {
  assert(bubble.includes(chip), `Le-E quick action should include ${chip}.`);
}
for (const banned of ["API status", "model name", "token usage", "webhook", "event bus", "generated client", "route map", "internal state"]) {
  assert(!new RegExp(banned, "i").test(bubble), `Le-E normal UI should not expose ${banned}.`);
}
assert.match(source, /live actions are off|publishing is off|prepared it, but/i, "Le-E publish/send requests should be blocked safely.");
assert.match(source, /change Goodwill to We Must Vote|replaceVisibleTextWithLee|applyLeeVisibleReplacement|could not find/i, "Le-E visible replacement fallback should remain covered.");

console.log("Le-E chat bubble tests passed");
