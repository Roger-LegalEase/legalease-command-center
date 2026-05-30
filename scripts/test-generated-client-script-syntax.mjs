import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "preview-server.mjs"), "utf8");

const routes = [
  "#overview",
  "#safe-mode",
  "#growth",
  "#partners",
  "#production",
  "#proof",
  "#operator-search",
  "#os-health",
  "#data-integrity",
  "#smoke-test",
  "#evidence-room",
  "#operator-manual",
  "#production-activation-rcap",
  "#handoff-contract",
  "#roles",
  "#tasks",
  "#capture-inbox",
  "#morning-brief",
  "#evening-reflection",
  "#operating-memory",
  "#daily-closeout"
];

const apostropheRegressionLabels = [
  "Today's Focus",
  "Today's Top 3",
  "What's Moved",
  "Save Today's Operating Memory",
  "Apply to Today's Brief Inputs",
  "Tomorrow's Top 3",
  "Roger's Priorities",
  "Partner's Next Step"
];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseInlineScripts(html, label) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>(?<body>[\s\S]*?)<\/script>/gi)];
  assert(scripts.length > 0, `${label} should include inline browser scripts.`);
  scripts.forEach((match, index) => {
    assert.doesNotThrow(() => {
      new vm.Script(match.groups.body, { filename:`${label}:inline-script-${index + 1}.js` });
    }, `${label} inline <script> ${index + 1} should parse as valid JavaScript.`);
  });
  return scripts.length;
}

function parseInlineHandlers(html, label) {
  const handlerNames = ["onclick", "onchange", "onsubmit", "oninput", "onkeydown", "onkeyup"];
  const htmlWithoutScripts = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, "");
  let count = 0;
  for (const handler of handlerNames) {
    const pattern = new RegExp(`\\s${handler}=([\"'])(?<body>[\\s\\S]*?)\\1`, "gi");
    for (const match of htmlWithoutScripts.matchAll(pattern)) {
      count += 1;
      const body = decodeHtml(match.groups.body);
      assert.doesNotThrow(() => {
        new vm.Script(`(function(event){\n${body}\n})`, { filename:`${label}:${handler}-${count}.js` });
      }, `${label} ${handler} handler should parse as valid JavaScript: ${body}`);
    }
  }
  return count;
}

function staticUnsafeHandlerChecks() {
  const handlerNames = ["onclick", "onchange", "onsubmit", "oninput", "onkeydown", "onkeyup"];
  for (const handler of handlerNames) {
    const pattern = new RegExp(`${handler}=([\"'])(?<body>[\\s\\S]*?)\\1`, "gi");
    for (const match of source.matchAll(pattern)) {
      const body = decodeHtml(match.groups.body);
      for (const label of apostropheRegressionLabels) {
        assert(!body.includes(label), `${handler} must not contain unescaped human-facing apostrophe label: ${label}`);
      }
    }
  }

  for (const label of apostropheRegressionLabels) {
    const unsafeSingleQuotedCall = new RegExp(`\\([^\\n)]*'${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`, "i");
    assert(!unsafeSingleQuotedCall.test(source), `Human-facing label must not be passed as unsafe single-quoted JS: ${label}`);
  }
}

function apostropheRegressionSelfCheck() {
  for (const label of apostropheRegressionLabels) {
    assert.throws(
      () => new vm.Script(`openThing('${label}')`),
      SyntaxError,
      `Regression guard should catch unsafe single-quoted JavaScript for ${label}.`
    );
    assert.doesNotThrow(() => {
      new vm.Script(`openThing(${JSON.stringify(label)})`);
    }, `JSON.stringify should safely serialize ${label}.`);
  }
}

async function waitForServer(child) {
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (logs.includes("LegalEase preview server ready")) return logs;
    if (child.exitCode !== null) throw new Error(`Preview server exited before ready:\n${logs}`);
    await wait(100);
  }
  throw new Error(`Timed out waiting for preview server:\n${logs}`);
}

staticUnsafeHandlerChecks();
apostropheRegressionSelfCheck();

const port = Number(process.env.TEST_GENERATED_CLIENT_SCRIPT_PORT || await availablePort());
const dataPath = await mkdtemp(path.join(os.tmpdir(), "legalease-generated-script-"));
const child = spawn(process.execPath, ["scripts/preview-server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT:String(port),
    HOST:"127.0.0.1",
    LOCAL_DEMO_MODE:"true",
    STORAGE_BACKEND:"json",
    COMMAND_CENTER_DATA_PATH:dataPath,
    NODE_DISABLE_COMPILE_CACHE:"1"
  },
  stdio:["ignore", "pipe", "pipe"]
});

let totalScripts = 0;
let totalHandlers = 0;

try {
  await waitForServer(child);
  for (const route of routes) {
    const url = `http://127.0.0.1:${port}/${route}`;
    const response = await fetch(url);
    const html = await response.text();
    assert.equal(response.status, 200, `${route} should return generated HTML.`);
    assert.match(response.headers.get("content-type") || "", /text\/html/i, `${route} should return HTML.`);
    totalScripts += parseInlineScripts(html, route);
    totalHandlers += parseInlineHandlers(html, route);
    assert.doesNotMatch(html, /SyntaxError:\s*Unexpected identifier 's'|Failed module:\s*client-error/i, `${route} should not ship a client syntax error fallback.`);
    assert(/liveGatesCount[^,\n]*0|Live Gates: 0|Live gates[^<]*0/i.test(html), `${route} should preserve the live gates 0 signal.`);
  }
} finally {
  child.kill("SIGTERM");
}

assert(totalScripts >= routes.length, "Generated output should include parse-checked inline scripts for every fetched route.");
assert(totalHandlers > 0, "Generated output should include parse-checked inline event handlers.");

console.log(JSON.stringify({
  routesChecked:routes.length,
  inlineScriptsParsed:totalScripts,
  inlineHandlersParsed:totalHandlers,
  apostropheRegressionLabels:apostropheRegressionLabels.length,
  liveGatesCount:0
}, null, 2));
