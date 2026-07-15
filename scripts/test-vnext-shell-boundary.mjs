import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import fs from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMAND_CENTER_UX_VNEXT_ENV_KEY,
  parseCommandCenterVNextFlag,
  readCommandCenterVNextConfig
} from "./ui/vnext-config.mjs";
import {
  SHELL_MODES,
  renderShellBoundary,
  shellModeForConfig
} from "./ui/shell-boundary.mjs";
import { primaryNavigationInventory, routeRegistry } from "./ui/navigation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(root, "scripts", "preview-server.mjs");
const configPath = path.join(root, "scripts", "ui", "vnext-config.mjs");
const boundaryPath = path.join(root, "scripts", "ui", "shell-boundary.mjs");
const serverSource = fs.readFileSync(serverPath, "utf8");
const configSource = fs.readFileSync(configPath, "utf8");
const boundarySource = fs.readFileSync(boundaryPath, "utf8");

assert.equal(COMMAND_CENTER_UX_VNEXT_ENV_KEY, "COMMAND_CENTER_UX_VNEXT");
assert.equal(parseCommandCenterVNextFlag(undefined), false, "A missing flag must default to false.");
assert.equal(parseCommandCenterVNextFlag("true"), true, "The exact string true must enable vNext.");
assert.equal(parseCommandCenterVNextFlag("false"), false, "The exact string false must keep the legacy shell.");
for (const invalidValue of [null, true, false, 1, 0, "1", "0", "TRUE", "False", " true", "true ", "yes", "on", ""]) {
  assert.equal(parseCommandCenterVNextFlag(invalidValue), false, `Invalid flag value ${JSON.stringify(invalidValue)} must fail safely to false.`);
}

const defaultConfig = readCommandCenterVNextConfig();
assert.deepEqual(defaultConfig, { enabled:false, mode:"legacy", source:"server-environment" });
assert.ok(Object.isFrozen(defaultConfig), "The deployment configuration must be immutable.");
assert.deepEqual(readCommandCenterVNextConfig({ COMMAND_CENTER_UX_VNEXT:"true" }), { enabled:true, mode:"vnext", source:"server-environment" });
assert.deepEqual(readCommandCenterVNextConfig({ COMMAND_CENTER_UX_VNEXT:"false" }), defaultConfig);
assert.deepEqual(readCommandCenterVNextConfig({ COMMAND_CENTER_UX_VNEXT:"invalid" }), defaultConfig);
assert.deepEqual(
  readCommandCenterVNextConfig(Object.create({ COMMAND_CENTER_UX_VNEXT:"true" })),
  defaultConfig,
  "Only an explicit server-environment value may enable vNext."
);

const clientControlledInputs = {
  url:"/?COMMAND_CENTER_UX_VNEXT=true",
  query:{ COMMAND_CENTER_UX_VNEXT:"true" },
  hash:"#today?COMMAND_CENTER_UX_VNEXT=true",
  formData:{ COMMAND_CENTER_UX_VNEXT:"true" },
  requestBody:{ COMMAND_CENTER_UX_VNEXT:"true" },
  cookies:{ COMMAND_CENTER_UX_VNEXT:"true" },
  localStorage:{ COMMAND_CENTER_UX_VNEXT:"true" },
  sessionStorage:{ COMMAND_CENTER_UX_VNEXT:"true" }
};
assert.deepEqual(
  readCommandCenterVNextConfig(clientControlledInputs),
  defaultConfig,
  "Client-controlled inputs must not enable the deployment flag."
);

assert.equal(shellModeForConfig(), SHELL_MODES.legacy);
assert.equal(shellModeForConfig({ enabled:false }), SHELL_MODES.legacy);
assert.equal(shellModeForConfig({ enabled:"true" }), SHELL_MODES.legacy);
assert.equal(shellModeForConfig({ enabled:true }), SHELL_MODES.vnext);

const renderCalls = [];
const legacyOutput = renderShellBoundary({
  config:defaultConfig,
  renderLegacyApp:() => { renderCalls.push("legacy"); return "complete-current-application"; },
  renderVNextApp:() => { renderCalls.push("vnext"); return "vnext-compatibility-application"; }
});
assert.equal(legacyOutput, "complete-current-application");
assert.deepEqual(renderCalls, ["legacy"], "The current shell must remain the default branch.");

renderCalls.length = 0;
const vnextOutput = renderShellBoundary({
  config:readCommandCenterVNextConfig({ COMMAND_CENTER_UX_VNEXT:"true" }),
  renderLegacyApp:() => { renderCalls.push("legacy"); return "complete-current-application"; },
  renderVNextApp:() => { renderCalls.push("vnext"); return "vnext-compatibility-application"; }
});
assert.equal(vnextOutput, "vnext-compatibility-application");
assert.deepEqual(renderCalls, ["vnext"], "The exact true value must reach the isolated vNext branch.");
assert.throws(() => renderShellBoundary(), /Both application shell renderers are required/);

for (const [label, source] of [["configuration", configSource], ["shell boundary", boundarySource]]) {
  for (const forbiddenPattern of [
    /\bprocess\s*\./,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\b(?:window|document|localStorage|sessionStorage)\s*\./,
    /\b(?:readFile|writeFile|createServer)\s*\(/,
    /\.listen\s*\(/,
    /\bsetTimeout\s*\(/,
    /\bsetInterval\s*\(/,
    /\bconsole\s*\./,
    /\bimport\s*\(/
  ]) {
    assert.doesNotMatch(source, forbiddenPattern, `The ${label} module must remain side-effect-free: ${forbiddenPattern}.`);
  }
  for (const forbiddenImport of [
    "preview-server",
    "storage",
    "database",
    "network",
    "access-control",
    "authorization",
    "outreach",
    "publishing",
    "social-publish",
    "safety-posture",
    "business-engine"
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`^\\s*import[^\\n]+${forbiddenImport}`, "im"),
      `The ${label} module must not import ${forbiddenImport}.`
    );
  }
}

assert.match(serverSource, /import \{ readCommandCenterVNextConfig \} from "\.\/ui\/vnext-config\.mjs";/);
assert.match(serverSource, /import \{ renderShellBoundary \} from "\.\/ui\/shell-boundary\.mjs";/);
assert.match(serverSource, /import \{ renderVNextDesktopShell \} from "\.\/ui\/app-shell\.mjs";/);
assert.match(serverSource, /loadLocalEnv\(\);\s*const commandCenterVNextConfig = readCommandCenterVNextConfig\(process\.env\);/);
assert.match(serverSource, /function renderLegacyApp\(\) \{\s*return htmlShell\(\);\s*\}/);
assert.match(serverSource, /function renderVNextApp\(\) \{[\s\S]*?return renderVNextDesktopShell\(renderLegacyApp\(\)\);\s*\}/);
assert.match(serverSource, /function renderCommandCenterApp\(\) \{\s*return renderShellBoundary\(\{[\s\S]*?config: commandCenterVNextConfig,[\s\S]*?renderLegacyApp,[\s\S]*?renderVNextApp[\s\S]*?\}\);\s*\}/);
assert.match(serverSource, /const html = sanitizeOutboundText\(renderCommandCenterApp\(\)\);/);

const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("function renderLegacyApp()", shellStart);
assert.ok(shellStart >= 0 && shellEnd > shellStart, "The complete current shell renderer must remain intact.");
assert.doesNotMatch(
  serverSource.slice(shellStart, shellEnd),
  /COMMAND_CENTER_UX_VNEXT/,
  "The deployment flag must never be embedded in client-side HTML or JavaScript."
);
assert.ok(serverSource.indexOf("const accessDecision = authorizeRequest") < serverSource.indexOf("sanitizeOutboundText(renderCommandCenterApp())"), "Authorization must remain before shell rendering.");

function requiredMatch(pattern, label) {
  const match = serverSource.match(pattern);
  assert.ok(match, `Could not locate ${label} in the live server source.`);
  return match;
}

const knownPages = JSON.parse(requiredMatch(/const knownPages = (\[[^;]+\]);/, "knownPages")[1]);
const aliasBody = requiredMatch(/const routeAliases = \{([^}]+)\};/, "routeAliases")[1];
const liveAliases = new Map(
  [...aliasBody.matchAll(/(?:"([^"]+)"|([A-Za-z0-9_-]+))\s*:\s*"([^"]+)"/g)]
    .map((match) => [match[1] || match[2], match[3]])
);
const registryAliases = new Map(routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute])));
assert.deepEqual([...new Set(knownPages)].sort(), routeRegistry.map((entry) => entry.canonicalRoute).sort(), "Canonical routes must remain unchanged.");
assert.deepEqual([...liveAliases].sort(), [...registryAliases].sort(), "Aliases and their canonical targets must remain unchanged.");
assert.match(serverSource, /const pageId = knownPages\.includes\(normalizedPage\) \? normalizedPage : "today";/, "Unknown routes must retain the Today fallback.");
assert.match(serverSource, /if \(requestedPage\.startsWith\("item\/"\)\)/, "Parameterized item deep links must remain supported.");
assert.match(serverSource, /pathRoute === "sources\/import-social-calendar" \? "#sources" : "#cockpit"/, "Social calendar imports must retain their route behavior.");
assert.match(serverSource, /url\.pathname === "\/privacy" \|\| url\.pathname === "\/terms"/, "Static legal routes must remain outside the application shell.");
for (const callback of ["google", "linkedin", "x", "meta"]) {
  assert.ok(serverSource.includes(`/api/${callback}/callback`), `${callback} OAuth callback handling must remain present.`);
}
assert.match(serverSource, /function renderSafeBootShell\(details = \{\}\)/, "Safe boot rendering must remain present.");

const navStart = serverSource.indexOf('<nav class="top-nav"');
const navEnd = serverSource.indexOf("</nav>", navStart);
assert.ok(navStart >= 0 && navEnd > navStart, "The current primary navigation must remain present.");
const livePrimaryNavigation = [...serverSource.slice(navStart, navEnd).matchAll(/href="#([^"]+)" data-nav-section="([^"]+)">([^<]+)/g)]
  .map((match) => ({ route:match[1], section:match[2], label:match[3].trim() }));
assert.equal(livePrimaryNavigation.length, primaryNavigationInventory.length, "The flag-off shell must preserve every current primary navigation item.");
for (const item of livePrimaryNavigation) {
  const inventoryItem = primaryNavigationInventory.find((entry) => entry.route === item.route);
  assert.deepEqual(
    inventoryItem && { route:inventoryItem.route, section:inventoryItem.section, label:inventoryItem.label },
    item,
    `The flag-off shell navigation contract changed for ${item.route}.`
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function shellResponse(flagValue) {
  const port = await availablePort();
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "legalease-vnext-shell-"));
  const dataPath = path.join(temporaryDirectory, "state.json");
  const childEnvironment = {
    PATH:process.env.PATH,
    TMPDIR:os.tmpdir(),
    NODE_ENV:"test",
    COMMAND_CENTER_TEST_MODE:"true",
    SKIP_ENV_LOCAL_FILE:"1",
    NODE_DISABLE_COMPILE_CACHE:"1",
    PORT:String(port),
    HOST:"127.0.0.1",
    LOCAL_DEMO_MODE:"true",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_ALLOW_JSON:"true",
    COMMAND_CENTER_DATA_PATH:dataPath,
    COMMAND_CENTER_REQUIRE_AUTH:"false",
    COMMAND_CENTER_AUTH_DISABLED:"true",
    OUTREACH_LIVE_SEND:"false",
    REACTIVATION_LIVE_SEND:"false",
    ALERT_EMAIL_LIVE_SEND:"false",
    ENABLE_LIVE_LINKEDIN_POSTING:"false",
    ENABLE_LIVE_FACEBOOK_POSTING:"false",
    ENABLE_LIVE_INSTAGRAM_POSTING:"false",
    ENABLE_LIVE_X_POSTING:"false",
    ENABLE_LIVE_THREADS_POSTING:"false"
  };
  if (flagValue !== undefined) childEnvironment.COMMAND_CENTER_UX_VNEXT = flagValue;

  const child = spawn(process.execPath, [serverPath], {
    cwd:root,
    env:childEnvironment,
    stdio:["ignore", "pipe", "pipe"]
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });

  try {
    const startedAt = Date.now();
    while (!logs.includes("LegalEase preview server ready")) {
      if (child.exitCode !== null) throw new Error(logs || `Server exited with ${child.exitCode}.`);
      if (Date.now() - startedAt > 15_000) throw new Error(logs || "Timed out waiting for the preview server.");
      await wait(50);
    }
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();
    assert.equal(response.status, 200, `Shell mode ${String(flagValue)} must respond.`);
    return html;
  } finally {
    child.kill("SIGTERM");
    const stoppedAt = Date.now();
    while (child.exitCode === null && Date.now() - stoppedAt < 5_000) await wait(25);
    if (child.exitCode === null) child.kill("SIGKILL");
    await rm(temporaryDirectory, { recursive:true, force:true });
  }
}

const missingFlagHtml = await shellResponse(undefined);
const falseFlagHtml = await shellResponse("false");
const invalidFlagHtml = await shellResponse("not-a-boolean");
const trueFlagHtml = await shellResponse("true");
assert.equal(falseFlagHtml, missingFlagHtml, "An explicit false flag must preserve the default shell byte-for-byte.");
assert.equal(invalidFlagHtml, missingFlagHtml, "An invalid flag must fail to the default shell byte-for-byte.");
assert.notEqual(trueFlagHtml, missingFlagHtml, "The enabled branch must render the isolated vNext shell.");
assert.match(missingFlagHtml, /<nav class="top-nav" aria-label="Primary">/);
assert.doesNotMatch(missingFlagHtml, /data-vnext-shell="desktop"/);
assert.match(trueFlagHtml, /data-vnext-shell="desktop"/);
assert.match(trueFlagHtml, /<main id="app">/);
assert.doesNotMatch(trueFlagHtml, /<nav class="top-nav" aria-label="Primary">/);
assert.match(missingFlagHtml, /window\.addEventListener\("hashchange"/);
assert.match(trueFlagHtml, /window\.addEventListener\("hashchange"/);
assert.match(missingFlagHtml, /function renderSafeBootShell\(details = \{\}\)/);
assert.match(trueFlagHtml, /function renderSafeBootShell\(details = \{\}\)/);

console.log("vNext shell boundary verified: strict server-only flag, byte-stable legacy default, isolated desktop shell, and shared route/application contracts.");
