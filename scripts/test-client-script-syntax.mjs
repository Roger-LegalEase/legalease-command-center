#!/usr/bin/env node
// Client script syntax guard — the served shell's inline <script> blocks must PARSE.
//
// Regression test for the "Unexpected identifier 'card'" outage: client code written inside
// htmlShell's server-side template literal used \" escapes, which the template consumes — the
// browser received "<div class="card-actions">..." (string terminated early) and the ENTIRE
// app script failed to parse, killing every page. node --check never sees this because the
// breakage only exists in the EMITTED script, not in preview-server.mjs itself.
//
// Two layers:
//   1. Source scan: no single-backslash \" (or \n/\t) inside the client-script region of the
//      shell template — to emit a literal backslash for the browser, write \\" instead.
//   2. Live check: boot the server, fetch the authenticated shell, extract every inline
//      <script> block, and V8-parse each one (node --check). This is what a browser does
//      before running a single line.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

// ---- Layer 1: source scan --------------------------------------------------------------------
// The client script region sits between the shell's <script> markers inside htmlShell. Rather
// than track line numbers, scan from the htmlShell declaration to the end of the file for the
// broken escape pattern: a \" not preceded by another backslash.
const shellStart = source.indexOf("function htmlShell()");
assert(shellStart >= 0, "htmlShell should exist");
// The shell function ends at the next top-level function declaration; server code after it
// legitimately uses \" inside ordinary strings and must not be scanned.
const shellEndMatch = source.slice(shellStart + 10).match(/\n(?:async )?function \w+/);
const shellEnd = shellEndMatch ? shellStart + 10 + shellEndMatch.index : source.length;
const clientRegion = source.slice(shellStart, shellEnd);
const badEscapes = [];
const lines = clientRegion.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (/(?<!\\)\\"/.test(lines[i])) badEscapes.push(`htmlShell+${i + 1}: ${lines[i].trim().slice(0, 100)}`);
  // \n inside the template emits a real newline; flag it only when it sits inside a
  // single/double-quoted client string on this line (a newline would split that string).
  if (/"[^"]*(?<!\\)\\n[^"]*"|'[^']*(?<!\\)\\n[^']*'/.test(lines[i])) {
    badEscapes.push(`htmlShell+${i + 1} (\\n in client string): ${lines[i].trim().slice(0, 100)}`);
  }
  // Regex character-class escapes (\s \d \w \b ...) written with a single backslash are
  // consumed by the template: the browser receives /s+/ instead of /\s+/ — a regex that
  // still PARSES (so the live-parse layer passes) but silently eats literal characters.
  // Regression: the Review Desk overlay text stripped every "s" from captions because
  // queueOverlayText shipped .replace(/s+/g, " "). Write \\s to emit \s for the browser.
  if (/(?<!\\)\\[sSdDwWbB](?![a-zA-Z])/.test(lines[i])) {
    badEscapes.push(`htmlShell+${i + 1} (template-consumed regex escape): ${lines[i].trim().slice(0, 100)}`);
  }
}
assert.equal(badEscapes.length, 0,
  `Client code inside the shell template uses single-backslash escapes the template will consume.\nWrite \\\\" to emit \\" for the browser.\n${badEscapes.join("\n")}`);
console.log("  ✓ no template-consumed escapes in the client script region");

// ---- Layer 2: live shell parse ---------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "client-syntax-"));
const server = await startPreviewServer();

try {
  const login = await loginOwner(server);
  const response = await fetch(`${server.baseUrl}/`, { headers:{ cookie:login.cookie } });
  assert.equal(response.status, 200, "Authenticated shell should load.");
  const html = await response.text();
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert(scripts.length >= 2, `Expected at least 2 inline scripts, found ${scripts.length}.`);
  scripts.forEach((body, index) => {
    const path = join(dir, `inline-${index}.js`);
    writeFileSync(path, body);
    const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    assert.equal(result.status, 0,
      `Inline <script> #${index} does not parse — the browser would show a blank app.\n${(result.stderr || "").slice(0, 500)}`);
  });
  console.log(`  ✓ all ${scripts.length} served inline scripts parse in V8`);
  assert(html.includes("Today at LegalEase"), "Shell should contain the Today at LegalEase page.");
  console.log("  ✓ Today at LegalEase present in the served shell");
} finally {
  await server.stop();
}

console.log("\ntest-client-script-syntax: all checks passed");
