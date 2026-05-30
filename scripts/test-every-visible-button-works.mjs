import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

function blockBetween(startPattern, endPattern) {
  const start = source.search(startPattern);
  assert(start >= 0, `Missing block start: ${startPattern}`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert(end > 0, `Missing block end: ${endPattern}`);
  return rest.slice(0, end);
}

const today = blockBetween(/function commandCenterOverviewHtml\(posts\)/, /function focusItemsForMode/);
const actionBlock = blockBetween(/function setFounderCaptureType/, /async function captureInboxAction/);

assert(source.includes("function runAction("), "Shared runAction helper should exist.");
assert(source.includes("pendingActions"), "Actions should prevent duplicate clicks.");
assert(/target\.disabled\s*=\s*true/.test(source), "runAction should disable buttons immediately.");
assert(/Working…/.test(source), "runAction should show Working feedback.");
assert(/actionStatusMessage/.test(source), "Actions should produce visible success/failure feedback.");

for (const label of [
  "Set today’s focus",
  "Edit priorities",
  "Save",
  "Save as task",
  "Save as decision",
  "Save as blocker",
  "Add task",
  "Mark done",
  "Move to tomorrow",
  "Add decision",
  "Add blocker",
  "Resolve",
  "Add update",
  "Plan tomorrow",
  "Start daily closeout",
  "View app status"
]) {
  assert((today + source).includes(label), `Today button/link should exist: ${label}`);
}

for (const fn of [
  "founderSetTodayFocus",
  "founderEditPriorities",
  "founderAddTask",
  "founderAddDecision",
  "founderAddBlocker",
  "founderAddUpdate",
  "founderPlanTomorrow",
  "quickCapture",
  "updateTaskAction"
]) {
  assert(source.includes(`function ${fn}`) || source.includes(`async function ${fn}`), `${fn} should exist.`);
}

for (const fn of [
  "founderSetTodayFocus",
  "founderEditPriorities",
  "founderAddTask",
  "founderAddDecision",
  "founderAddBlocker",
  "founderAddUpdate",
  "founderPlanTomorrow"
]) {
  assert(actionBlock.includes(`function ${fn}`), `${fn} should be in the founder action block.`);
}

const unsafeButtonWords = /\b(Triage|RCAP|Production Activation|Operating Memory|Operator Search|OS Health|Data Integrity|Smoke Test|Safe Mode|Handoff Contract|Live Gates)\b/;
const buttonLabels = [...today.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1].replace(/<[^>]+>/g, "").trim());
for (const label of buttonLabels) {
  assert(label, "Every visible Today button should have accessible text.");
  assert(!unsafeButtonWords.test(label), `Button label should use founder language: ${label}`);
  assert(!/\b(todo|noop|placeholder|comingSoon|undefined|null)\b/i.test(label), `Button label should not look placeholder: ${label}`);
}

assert(!/onclick="[^"]*(?:todo|noop|placeholder|comingSoon|undefined|null)/i.test(today), "Today should not include placeholder onclick handlers.");
assert(/data-capture-type="task"/.test(today), "Save as task should have a real capture type.");
assert(/data-capture-type="decision"/.test(today), "Save as decision should have a real capture type.");
assert(/data-capture-type="blocker"/.test(today), "Save as blocker should have a real capture type.");
assert(/route_task/.test(source), "Save as task should route captured item to a task.");
assert(/location\.hash='daily-closeout'/.test(source), "Plan tomorrow should open Daily Closeout.");

console.log("every visible button works tests passed");
