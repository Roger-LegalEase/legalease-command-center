import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const routes = {
  "morning-brief": { renderer: "morningBriefPageHtml", title: /Morning Brief/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "operating-memory": { renderer: "operatingMemoryPageHtml", title: /Notes &amp; Decisions|Notes & Decisions/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "operator-search": { renderer: "operatorSearchPageHtml", title: /<h1 class="big-title">Search<\/h1>/, forbidden: /RCAP Review Workspace|Production Activation|Operator Search/ },
  "os-health": { renderer: "osHealthPageHtml", title: /App Status/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "data-integrity": { renderer: "dataIntegrityPageHtml", title: /Data Check/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "smoke-test": { renderer: "smokeTestPageHtml", title: /Self-Check/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "evidence-room": { renderer: "evidenceRoomPageHtml", title: /<h1 class="big-title">Proof<\/h1>/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "operator-manual": { renderer: "operatorManualPageHtml", title: /<h1 class="big-title">Guide<\/h1>/, forbidden: null },
  roles: { renderer: "rolesPageHtml", title: /Team Roles/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "safe-mode": { renderer: "renderSafeBootShell", title: /Recovery Mode/, forbidden: /RCAP Review Workspace|Production Activation/ },
  tasks: { renderer: "tasksPageHtml", title: /Tasks/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "capture-inbox": { renderer: "captureInboxPageHtml", title: /<h1 class="big-title">Inbox<\/h1>/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "daily-closeout": { renderer: "dailyCloseoutPageHtml", title: /Daily Closeout/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "evening-reflection": { renderer: "eveningReflectionPageHtml", title: /Daily Closeout/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "handoff-contract": { renderer: "handoffContractPageHtml", title: /Handoff Notes/, forbidden: /RCAP Review Workspace|Production Activation/ },
  "production-activation-rcap": { renderer: "rcapReviewWorkspaceHtml", title: /Launch Checklist|Recovery plan/, forbidden: null },
  work: { renderer: "workPageHtml", title: /<h1 class="big-title">Work<\/h1>/, forbidden: /Production Activation/ },
  social: { renderer: "socialPageHtml", title: /<h1 class="big-title">Social<\/h1>/, forbidden: /Launch Checklist|Production Activation|Settings|<h1 class="big-title">Proof<\/h1>/ },
  proof: { renderer: "proofPageHtml", title: /<h1 class="big-title">Proof<\/h1>/, forbidden: /Production Activation/ }
};

const whitelistMatch = source.match(/const pageId = normalizedPage === "safe-mode" \|\| \[(?<routes>[\s\S]*?)\]\.includes\(normalizedPage\)/);
assert(whitelistMatch, "Router whitelist should be explicit.");
const whitelist = whitelistMatch.groups.routes;

for (const [route, expected] of Object.entries(routes)) {
  if (route !== "safe-mode") assert(whitelist.includes(`"${route}"`), `#${route} should be registered in the route whitelist.`);
  assert(source.includes(`safeRenderModule("${route}"`) || route === "safe-mode" || route.startsWith("tasks") || route === "proof", `#${route} should have a dedicated safeRenderModule entry.`);
  assert(source.includes(expected.renderer), `#${route} should use ${expected.renderer}.`);
  const functionStart = source.indexOf(`function ${expected.renderer}`);
  if (functionStart !== -1) {
    const nextFunction = source.indexOf("\n    function ", functionStart + 12);
    const body = source.slice(functionStart, nextFunction === -1 ? functionStart + 30000 : nextFunction);
    assert(expected.title.test(body), `#${route} renderer should include its expected founder-facing page title.`);
    if (expected.forbidden) assert(!expected.forbidden.test(body), `#${route} renderer should not render Recovery checklist copy by accident.`);
  }
}

for (const alias of ["social-media", "content-calendar", "posts"]) {
  assert(source.includes(`"${alias}"`), `#${alias} should be registered as a Social alias.`);
}
assert.match(source, /\["social-media", "content-calendar", "posts"\]\.includes\(requestedPage\) \? "social"/, "Social aliases should normalize to #social.");

assert.match(source, /normalizedPage\) \? normalizedPage : "overview"/, "Unknown routes should fall back to Today, not Launch Checklist.");
assert.match(source, /requestedPage === "today" \? "overview"/, "#today should alias to the Today page.");

const navBlock = source.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
assert(navBlock.includes('href="#overview"'), "Top nav should link Today to #overview.");
assert(navBlock.includes('href="#work"'), "Top nav should expose Work.");
assert(navBlock.includes('href="#social"'), "Top nav should expose Social.");
assert(navBlock.includes('href="#proof"'), "Top nav should expose Proof.");
assert(navBlock.includes('href="#operator-search"'), "Top nav should expose Search.");
assert(!navBlock.includes('data-nav-section="settings"'), "Settings should not replace Social as a primary nav item.");
assert(source.includes('href="#settings"'), "Settings should remain available from a secondary control.");
assert(!navBlock.includes(">Partners<"), "Partners should not be a top-level nav item.");
assert(!navBlock.includes(">System<"), "System should not be a top-level nav item.");
assert(!navBlock.includes("RCAP Review"), "Navigation should use founder-facing recovery language.");

assert(/liveGatesCount[^,\n]*0|Publishing is off/i.test(source), "Publishing-off/live-gates-0 signal should remain present.");

console.log("route map integrity tests passed");
