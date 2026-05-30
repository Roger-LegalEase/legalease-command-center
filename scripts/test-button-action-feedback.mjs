import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

assert(source.includes("function runAction("), "Shared runAction helper should exist.");
assert(source.includes("pendingActions"), "runAction should track pending actions.");
assert(/button\.disabled\s*=\s*true/.test(source), "runAction should disable buttons while pending.");
assert(/Working…|Working\.\.\./.test(source), "runAction should show immediate Working feedback.");
assert(/button\.disabled\s*=\s*false/.test(source), "runAction should restore buttons after completion.");
assert(/actionStatusMessage/.test(source), "Actions should have a clear status message channel.");

for (const fn of [
  "askLeePromptFromButton",
  "quickCapture",
  "captureInboxAction",
  "saveMorningBrief",
  "saveOperatingMemory",
  "saveEveningReflection",
  "saveDailyCloseout",
  "generateTomorrowPlan",
  "refreshOsHealth",
  "startRcapActivation",
  "generateRcapHandoffPacket",
  "operatorSearchAction",
  "startSmokeTestRun",
  "refreshDataIntegrity",
  "runSystemCheck"
]) {
  const functionStart = source.search(new RegExp(`(?:async\\s+)?function ${fn}\\b`));
  assert(functionStart >= 0, `${fn} should exist.`);
  const nextFunction = source.indexOf("\n    function ", functionStart + 12);
  const nextAsyncFunction = source.indexOf("\n    async function ", functionStart + 12);
  const candidates = [nextFunction, nextAsyncFunction].filter(index => index > functionStart);
  const functionEnd = candidates.length ? Math.min(...candidates) : functionStart + 3000;
  const body = source.slice(functionStart, functionEnd);
  assert(body.includes("runAction("), `${fn} should use runAction for immediate feedback and duplicate-click prevention.`);
}

assert(!/runAction[\s\S]{0,300}(send email|publish page|activate dashboard|enable live)/i.test(source), "runAction must not enable external controls.");
assert(/liveGatesCount[^,\n]*0|Live gates[^<]*0/i.test(source), "Live gates 0 signal should remain present.");

console.log("button action feedback tests passed");
