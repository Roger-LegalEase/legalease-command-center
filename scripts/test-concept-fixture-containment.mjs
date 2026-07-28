#!/usr/bin/env node
// The design concept's synthetic fixtures may not reach a production render path.
//
// WHY THIS EXISTS. docs/design/legalease-command-center-concept/ contains a static prototype whose
// people, organisations, addresses, counts and dates are synthetic design fixtures. Its own README
// says they "must never be copied into production renderers or default application state". That was
// a rule written in prose, which meant it was enforced by whoever remembered it. This suite is the
// same rule, enforced by the build.
//
// The rule bites hardest exactly where this release worked: the concept's sidebar shows a fixture
// person in the account block, and this release BUILT that account block. It reads the authenticated
// session and has no default, no placeholder and no sample — and if a future change gives it one
// taken from the concept, this fails.
//
// WHAT IT CHECKS
//
//   1. The fixture list is real. Every name below must actually appear in the concept package. A
//      list that has drifted from the package protects nothing, so a stale entry fails here rather
//      than passing silently.
//   2. No fixture appears in any file the server can send to a browser: every scripts/**.mjs that
//      is not a test, and every file under assets/.
//   3. No fixture appears in what a browser is actually served, with the Founder OS flags ON — the
//      shell HTML, and every Founder OS read endpoint behind it. Source scanning cannot see a value
//      assembled at runtime or read out of seeded state; this can.
//
// Run: node scripts/test-concept-fixture-containment.mjs

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const CONCEPT_DIRECTORY = "docs/design/legalease-command-center-concept";
const CONCEPT_SOURCES = [
  `${CONCEPT_DIRECTORY}/command-center-concept.html`,
  `${CONCEPT_DIRECTORY}/build_prototype.py`
];

// The synthetic identities the concept package was sanitised to, listed in the commit that
// sanitised it. Each is checked against the package below, so this list cannot rot.
const FIXTURE_PEOPLE = Object.freeze([
  "Roger Sample",
  "Jordan Example",
  "Riley Example",
  "Avery Example",
  "Devon Example",
  "Taylor Example",
  "Casey Example"
]);

const FIXTURE_ORGANISATIONS = Object.freeze([
  "Sample Partner Organization",
  "Community Records Alliance",
  "Fresh Start Collective",
  "Example Ventures",
  "Example County"
]);

const FIXTURE_CONTACT_DETAILS = Object.freeze([
  "partner@example.org"
]);

const FIXTURES = Object.freeze([...FIXTURE_PEOPLE, ...FIXTURE_ORGANISATIONS, ...FIXTURE_CONTACT_DETAILS]);

// Files a browser can be served. Tests are excluded because a test may legitimately name a fixture
// in order to assert it is absent — this file does exactly that.
const RENDER_PATH_ROOTS = ["scripts", "assets"];
const EXCLUDED = [
  /^scripts\/test-/,
  /^scripts\/test-support\//,
  /^scripts\/fixtures\//,
  // Harnesses and capture scripts. They seed throwaway servers and drive browsers; nothing they
  // contain is served to a person. run-browser-tests.mjs has carried a "Taylor Example" inbox
  // signal since PR #109, months before this concept package existed — a coincidence of the same
  // obvious test surname, not a copy from it.
  /^scripts\/run-browser-tests\.mjs$/,
  /^scripts\/run-extended-tests\.mjs$/,
  /^scripts\/compare-extended-tests\.mjs$/,
  /^scripts\/capture-[^/]+\.mjs$/,
  /^scripts\/partners-visual-harness\.mjs$/,
  /\/node_modules\//
];

async function* walk(directory) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes:true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const TEXT_EXTENSIONS = new Set([".mjs", ".js", ".cjs", ".css", ".json", ".html", ".svg", ".txt"]);

async function renderPathFiles() {
  const files = [];
  for (const root of RENDER_PATH_ROOTS) {
    for await (const file of walk(root)) {
      if (EXCLUDED.some((pattern) => pattern.test(file))) continue;
      if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
      files.push(file);
    }
  }
  return files.sort();
}

// ------------------------------------------------------------------------------------------------
// 1. The fixture list is the package's, not a guess.
// ------------------------------------------------------------------------------------------------

const conceptText = (await Promise.all(CONCEPT_SOURCES.map((file) => readFile(file, "utf8")))).join("\n");
for (const fixture of FIXTURES) {
  assert.ok(
    conceptText.includes(fixture),
    `"${fixture}" is listed here as a concept fixture but does not appear in ${CONCEPT_DIRECTORY}. `
    + "Either the package changed and this list must follow it, or this entry was never a fixture."
  );
}

// ------------------------------------------------------------------------------------------------
// 2. No fixture is in a file the server can serve.
// ------------------------------------------------------------------------------------------------

const files = await renderPathFiles();
assert.ok(files.length > 50, `Expected to scan the render path; found only ${files.length} files.`);

const staticHits = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const fixture of FIXTURES) {
    if (source.includes(fixture)) staticHits.push(`${file}: ${fixture}`);
  }
}
assert.deepEqual(staticHits, [], [
  "A design-concept fixture reached a production render path:",
  ...staticHits.map((hit) => `  ${hit}`),
  "",
  `Fixtures in ${CONCEPT_DIRECTORY} are illustrative. A renderer must read the real record, and`,
  "where there is no real record it must draw nothing rather than the concept's stand-in."
].join("\n"));

// ------------------------------------------------------------------------------------------------
// 3. No fixture is in what a browser is actually served.
// ------------------------------------------------------------------------------------------------

const server = await startPreviewServer({
  seed:{ partners:[], tasks:[], posts:[], approvalQueue:[], queueItems:[], activityEvents:[] },
  env:{
    COMMAND_CENTER_UX_VNEXT:"true",
    FOUNDER_OS_SHELL:"true",
    FOUNDER_OS_TODAY:"true",
    FOUNDER_OS_RELATIONSHIPS:"true",
    FOUNDER_OS_CAMPAIGNS:"true",
    FOUNDER_OS_SCOREBOARD:"true",
    FOUNDER_OS_LEE_PANEL:"true"
  }
});

try {
  const session = await loginOwner(server);
  const headers = { cookie:session.cookie };
  const surfaces = ["/", "/api/ui/today", "/api/ui/campaigns", "/api/ui/scoreboard", "/api/ui/partners?view=list&limit=50"];
  const liveHits = [];
  for (const surface of surfaces) {
    const response = await fetch(new URL(surface, server.baseUrl), { headers, signal:AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, `${surface} must be readable for this check to mean anything.`);
    const body = await response.text();
    for (const fixture of FIXTURES) {
      if (body.includes(fixture)) liveHits.push(`${surface}: ${fixture}`);
    }
  }
  assert.deepEqual(liveHits, [], [
    "A design-concept fixture was served to the browser:",
    ...liveHits.map((hit) => `  ${hit}`)
  ].join("\n"));

  // The account block is the specific position the concept fills with a fixture person. It must
  // render the authenticated session's own name, and nothing else may stand in for it.
  const shell = await (await fetch(server.baseUrl, { headers })).text();
  const account = shell.match(/<strong data-shell-account-name>([^<]*)<\/strong>/);
  assert.ok(account, "The Founder OS shell must render the account block for an authenticated session.");
  assert.equal(account[1], "Owner", "The account block must render the authenticated session's own name.");

  // And with no session there is no account block at all — not a placeholder one.
  const anonymous = await (await fetch(server.baseUrl)).text();
  assert.doesNotMatch(anonymous, /data-shell-account-name/, "An unauthenticated response must render no account block.");

  console.log(`PASS test-concept-fixture-containment (${FIXTURES.length} fixtures, ${files.length} render-path files, ${surfaces.length} served surfaces)`);
} finally {
  await server.stop();
}
