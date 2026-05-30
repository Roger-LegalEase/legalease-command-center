import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const routes = {
  "morning-brief": {
    renderer: "morningBriefPageHtml",
    title: /Morning Brief/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "operating-memory": {
    renderer: "operatingMemoryPageHtml",
    title: /Operating Memory|Carry Forward/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "operator-search": {
    renderer: "operatorSearchPageHtml",
    title: /Operator Search|Search LegalEase OS/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "os-health": {
    renderer: "osHealthPageHtml",
    title: /OS Health|System Health/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "data-integrity": {
    renderer: "dataIntegrityPageHtml",
    title: /Data Integrity|System Checks/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "smoke-test": {
    renderer: "smokeTestPageHtml",
    title: /Smoke Test/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "evidence-room": {
    renderer: "evidenceRoomPageHtml",
    title: /Evidence Room/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "operator-manual": {
    renderer: "operatorManualPageHtml",
    title: /Operator Manual/,
    forbidden: null
  },
  roles: {
    renderer: "rolesPageHtml",
    title: /Roles|Role Management/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "safe-mode": {
    renderer: "renderSafeBootShell",
    title: /Safe Mode/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  tasks: {
    renderer: "tasksPageHtml",
    title: /Tasks/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "capture-inbox": {
    renderer: "captureInboxPageHtml",
    title: /Capture Inbox|Captures/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "daily-closeout": {
    renderer: "dailyCloseoutPageHtml",
    title: /Daily Closeout|Closeout/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "evening-reflection": {
    renderer: "eveningReflectionPageHtml",
    title: /Evening Reflection|End-of-Day Reflection/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "handoff-contract": {
    renderer: "handoffContractPageHtml",
    title: /Handoff Contract/,
    forbidden: /RCAP Review Workspace|Production Activation/
  },
  "production-activation-rcap": {
    renderer: "rcapReviewWorkspaceHtml",
    title: /RCAP Review Workspace|Production Activation/,
    forbidden: null
  }
};

const whitelistMatch = source.match(/const pageId = normalizedPage === "safe-mode" \|\| \[(?<routes>[\s\S]*?)\]\.includes\(normalizedPage\)/);
assert(whitelistMatch, "Router whitelist should be explicit.");
const whitelist = whitelistMatch.groups.routes;

for (const [route, expected] of Object.entries(routes)) {
  if (route !== "safe-mode") assert(whitelist.includes(`"${route}"`), `#${route} should be registered in the route whitelist.`);
  assert(source.includes(`safeRenderModule("${route}"`) || route === "safe-mode" || route.startsWith("tasks"), `#${route} should have a dedicated safeRenderModule entry.`);
  assert(source.includes(expected.renderer), `#${route} should use ${expected.renderer}.`);
  const functionStart = source.indexOf(`function ${expected.renderer}`);
  if (functionStart !== -1) {
    const nextFunction = source.indexOf("\n    function ", functionStart + 12);
    const body = source.slice(functionStart, nextFunction === -1 ? functionStart + 30000 : nextFunction);
    assert(expected.title.test(body), `#${route} renderer should include its expected page title.`);
    if (expected.forbidden) assert(!expected.forbidden.test(body), `#${route} renderer should not render RCAP/Production Activation copy.`);
  }
}

assert.match(source, /normalizedPage\) \? normalizedPage : "overview"/, "Unknown routes should fall back to Today, not RCAP.");

const systemMenuMatch = source.match(/<details class="nav-menu"><summary class="nav-menu-summary" data-nav-section="system">System<\/summary><div class="nav-menu-panel">(?<links>[\s\S]*?)<\/div><\/details>/);
assert(systemMenuMatch, "System menu should render.");
const systemMenu = systemMenuMatch.groups.links;
const navBlock = source.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
for (const route of ["morning-brief", "daily-closeout", "operating-memory", "tasks", "capture-inbox", "operator-search", "production-activation-rcap", "handoff-contract", "evidence-room", "dataroom", "os-health", "data-integrity", "smoke-test", "roles", "safe-mode", "operator-manual"]) {
  assert(navBlock.includes(`href="#${route}"`), `Navigation should link to #${route}.`);
}
assert(!systemMenu.includes('href="#automation">System Health'), "System Health must link to #os-health, not legacy Automation.");
assert(!systemMenu.includes('href="#metrics">Diagnostics'), "System diagnostics should not hijack Search/System routes.");

const topNavBlock = source.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
assert(topNavBlock.includes('href="#overview"'), "Top nav should link Today to #overview.");
assert(topNavBlock.includes('href="#operator-search"'), "Top nav should expose Search.");
assert(topNavBlock.includes('data-nav-section="work"'), "Top nav should expose Work.");
assert(topNavBlock.includes('data-nav-section="system"'), "Top nav should expose System.");
assert(topNavBlock.includes('href="#production-activation-rcap"'), "RCAP should live in Partners navigation, not hijack unrelated routes.");

assert(/liveGatesCount[^,\n]*0|Live gates[^<]*0/i.test(source), "Live gates 0 signal should remain present.");

console.log("route map integrity tests passed");
