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
  "#work",
  "#safe-mode",
  "#growth",
  "#partners",
  "#production",
  "#social",
  "#social-media",
  "#content-calendar",
  "#posts",
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

function assertClientHelpersDefined(html, label) {
  const scriptBody = [...html.matchAll(/<script(?:\s[^>]*)?>(?<body>[\s\S]*?)<\/script>/gi)]
    .map(match => match.groups.body)
    .join("\n");
  if (/\bsafeAction\s*\(/.test(scriptBody)) {
    assert(
      /\b(?:async\s+function|function|const|let|var)\s+safeAction\b/.test(scriptBody),
      `${label} generated client script references safeAction but does not define it in shared client scope.`
    );
  }
}

function assertClientHelpersResolveAtRuntime(html, label) {
  const scriptBody = [...html.matchAll(/<script(?:\s[^>]*)?>(?<body>[\s\S]*?)<\/script>/gi)]
    .map(match => match.groups.body)
    .join("\n")
    .replace(/\n\s*load\(\);\s*(?=\n|$)/, "\nvoid 0;\n");
  const listeners = {};
  const element = {
    textContent:"",
    innerHTML:"",
    classList:{ add() {}, remove() {} },
    addEventListener() {},
    removeAttribute() {},
    closest() { return null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    style:{}
  };
  const documentStub = {
    cookie:"",
    addEventListener() {},
    createElement() { return { ...element, click() {}, remove() {} }; },
    querySelector() { return element; },
    querySelectorAll() { return []; },
    body:{ appendChild() {} }
  };
  const storageStub = {
    getItem() { return ""; },
    setItem() {},
    removeItem() {}
  };
  const windowStub = {
    __LE_BOOT:{ ready:false, stage:"test", startedAt:new Date().toISOString() },
    addEventListener(type, handler) { listeners[type] = handler; },
    removeEventListener() {},
    location:{ pathname:"/", hash:"#today", search:"" },
    history:{ replaceState() {} },
    localStorage:storageStub,
    sessionStorage:storageStub
  };
  windowStub.window = windowStub;
  const context = {
    window:windowStub,
    document:documentStub,
    location:windowStub.location,
    history:windowStub.history,
    localStorage:storageStub,
    sessionStorage:storageStub,
    console:{ log() {}, warn() {}, error() {} },
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    URLSearchParams,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Map,
    Set,
    Promise,
    Error,
    TypeError,
    ReferenceError,
    encodeURIComponent,
    decodeURIComponent,
    fetch:async () => ({ ok:true, status:200, headers:{ get:() => "application/json" }, text:async () => "{}" }),
    AbortController:class { constructor() { this.signal = {}; } abort() {} },
    XMLHttpRequest:function XMLHttpRequest() {}
  };
  context.globalThis = context;
  assert.doesNotThrow(() => {
    new vm.Script(`${scriptBody}
      if (typeof safeAction !== "function") throw new ReferenceError("safeAction is not defined");
      if (typeof quickCaptureOperator !== "function") throw new ReferenceError("quickCaptureOperator is not defined");
      if (typeof runScheduledPublisherFromCommand !== "function") throw new ReferenceError("runScheduledPublisherFromCommand is not defined");
      for (const helper of ["connectGoogle", "refreshGoogleStatus", "runGoogleScan", "googleInsightAction", "disconnectGoogleWorkspace"]) {
        if (typeof globalThis[helper] !== "function") throw new ReferenceError(helper + " is not defined");
      }
    `, { filename:`${label}:client-runtime-helper-check.js` }).runInNewContext(context);
  }, `${label} generated client helpers should resolve at runtime.`);
}

function assertGoogleInlineHandlersHaveRuntimeHelpers(html, label) {
  const htmlWithoutScripts = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, "");
  const googleHelpers = ["connectGoogle", "refreshGoogleStatus", "runGoogleScan", "googleInsightAction", "disconnectGoogleWorkspace"];
  for (const helper of googleHelpers) {
    if (!htmlWithoutScripts.includes(`${helper}(`)) continue;
    const scriptBody = [...html.matchAll(/<script(?:\s[^>]*)?>(?<body>[\s\S]*?)<\/script>/gi)]
      .map(match => match.groups.body)
      .join("\n");
    assert(
      new RegExp(`\\b(?:async\\s+function|function|const|let|var)\\s+${helper}\\b`).test(scriptBody),
      `${label} inline Google handler references ${helper} but it is not defined in shared client scope.`
    );
  }
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

  const rewriteButtonMatch = source.match(/<button[^>]*>Rewrite with Le-E<\/button>/);
  if (rewriteButtonMatch) {
    assert(!/onclick=/.test(rewriteButtonMatch[0]), "Rewrite with Le-E must not use inline onclick JavaScript.");
    assert(/data-lee-prompt=/.test(rewriteButtonMatch[0]), "Rewrite with Le-E should store prompt text in a data attribute.");
    assert(
      /addEventListener\("click",[\s\S]*?data-lee-prompt[\s\S]*?askLeePromptFromButton/.test(source),
      "Rewrite with Le-E should be handled by delegated data-attribute click handling."
    );
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
    assertClientHelpersDefined(html, route);
    assertClientHelpersResolveAtRuntime(html, route);
    assertGoogleInlineHandlersHaveRuntimeHelpers(html, route);
    totalHandlers += parseInlineHandlers(html, route);
    assert.doesNotMatch(html, /SyntaxError:\s*Unexpected identifier 's'|Failed module:\s*client-error/i, `${route} should not ship a client syntax error fallback.`);
    assert(/liveGatesCount[^,\n]*0|Live Gates: 0|Live gates[^<]*0|Publishing is off/i.test(html), `${route} should preserve the publishing-off/live-gates-0 signal.`);
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
