import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { renderVNextDesktopShell } from "./ui/app-shell.mjs";
import { canonicalRouteForShell, resolveShellDestination } from "./ui/app-shell-navigation.mjs";
import { normalizeRecordDeepLink } from "./ui/links.mjs";
import { routeRegistry } from "./ui/navigation.mjs";
import {
  ITEM_COLLECTION_DESTINATIONS,
  OBJECT_SOURCE_MAPPINGS,
  ROUTE_COMPATIBILITY_CONTRACT,
  ROUTE_COMPATIBILITY_TOTALS,
  buildExactObjectLink,
  buildGenericItemLink,
  createObjectNotAvailableContract,
  resolveRouteCompatibility,
  routeCompatibilityBrowserSource
} from "./ui/route-compatibility.mjs";

const serverSource = readFileSync("scripts/preview-server.mjs", "utf8");
const compatibilitySource = readFileSync("scripts/ui/route-compatibility.mjs", "utf8");
const shellSource = readFileSync("scripts/ui/app-shell.mjs", "utf8");
const linksSource = readFileSync("scripts/ui/links.mjs", "utf8");
const configSource = readFileSync("scripts/ui/vnext-config.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const aliases = routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute]));
const canonicalRoutes = new Set(routeRegistry.map((entry) => entry.canonicalRoute));
assert.equal(ROUTE_COMPATIBILITY_TOTALS.canonicalRoutes, 75);
assert.equal(ROUTE_COMPATIBILITY_TOTALS.aliases, 53);
assert.equal(routeRegistry.length, 75);
assert.equal(aliases.length, 53);
assert.equal(new Set(routeRegistry.map((entry) => entry.canonicalRoute)).size, 75);
assert.equal(new Set(aliases.map(([alias]) => alias)).size, 53);

for (const entry of routeRegistry) {
  const result = resolveRouteCompatibility(entry.canonicalHash);
  assert.equal(result.kind, "page", `${entry.canonicalHash} must resolve deterministically.`);
  const expectedRoute = ROUTE_COMPATIBILITY_CONTRACT.aliasTargets[entry.canonicalRoute] || entry.canonicalRoute;
  assert.equal(result.canonicalRoute, expectedRoute);
  assert.equal(result.aliasUsed, expectedRoute === entry.canonicalRoute ? null : entry.canonicalRoute);
  assert.equal(result.safeHash, `#${expectedRoute}`);
  assert.equal(resolveShellDestination(entry.canonicalHash), result.destination);
}

for (const [alias, target] of aliases) {
  assert.ok(canonicalRoutes.has(target), `${alias} points to an existing canonical route.`);
  const result = resolveRouteCompatibility(`#${alias}`);
  assert.equal(result.kind, "page");
  assert.equal(result.canonicalRoute, target);
  assert.equal(result.safeHash, `#${target}`);
  assert.equal(canonicalRouteForShell(alias), target);
  assert.equal(result.destination, resolveRouteCompatibility(`#${target}`).destination);
  assert.equal(resolveShellDestination(alias), result.destination);
  if (alias === target) assert.equal(result.aliasUsed, null, "The intentional self-alias is a stable one-hop canonical route, not a redirect loop.");
  else assert.equal(result.aliasUsed, alias);
  const chainedTarget = ROUTE_COMPATIBILITY_CONTRACT.aliasTargets[target];
  assert.ok(!chainedTarget || chainedTarget === target, `${alias} must not enter an alias chain or loop.`);
}

assert.deepEqual(resolveRouteCompatibility("#social?view=calendar"), {
  kind:"page",
  requestedHash:"#social?view=calendar",
  requestedRoute:"social",
  canonicalRoute:"growth",
  aliasUsed:"social",
  destination:"Social",
  objectType:null,
  sourceKind:null,
  sourceId:null,
  safeHash:"#growth?view=calendar",
  recoveryReason:null
});
assert.equal(resolveRouteCompatibility("/sources/import-social-calendar").canonicalRoute, "sources");

const objectFixtures = [
  ["Post", "", "post-001", "#social/post/post-001", "posts", "Social"],
  ["Campaign", "", "campaign-001", "#outreach/campaign/campaign-001", "campaigns", "Outreach"],
  ["Partner", "", "partner-001", "#partners/partner/partner-001", "partners", "Partners"],
  ["File", "data-room-item", "data-room-001", "#files/data-room-item/data-room-001", "dataRoomItems", "Files"]
];
for (const [objectType, sourceKind, sourceId, hash, collection, destination] of objectFixtures) {
  assert.deepEqual(buildExactObjectLink({ objectType, sourceKind, sourceId }), { kind:"record", target:hash });
  const result = resolveRouteCompatibility(hash);
  assert.equal(result.kind, "object");
  assert.equal(result.objectType, objectType);
  assert.equal(result.sourceKind, collection);
  assert.equal(result.sourceId, sourceId);
  assert.equal(result.destination, destination);
  assert.equal(result.canonicalRoute, "item");
  assert.equal(result.legacyHash, `#item/${collection}/${sourceId}`);
  assert.equal(canonicalRouteForShell(hash), "item");
  assert.equal(resolveShellDestination(hash), destination);
}

assert.deepEqual(Object.keys(OBJECT_SOURCE_MAPPINGS), ["Post", "Campaign", "Partner", "File"]);
assert.deepEqual(OBJECT_SOURCE_MAPPINGS.File.sources, {
  report:"reports",
  "data-room-item":"dataRoomItems",
  "evidence-note":"evidencePackNotes",
  "soc2-evidence":"soc2Evidence",
  "soc2-policy":"soc2Policies",
  "brand-asset":"brandAssets"
});
assert.equal(Object.isFrozen(OBJECT_SOURCE_MAPPINGS.File.sources), true);

const currentIdFormats = [
  "11111111-1111-4111-8111-111111111111",
  "post-slug-2026",
  "row_17",
  "Report 2026 / Final",
  "LegalEase—current"
];
for (const sourceId of currentIdFormats) {
  const link = buildGenericItemLink({ collection:"posts", sourceId });
  assert.ok(link, `${sourceId} must remain linkable.`);
  const result = resolveRouteCompatibility(link.target);
  assert.equal(result.sourceId, sourceId);
  assert.equal(result.sourceKind, "posts");
}
assert.deepEqual(normalizeRecordDeepLink({ collection:"posts", itemId:"post / 7" }), {
  kind:"record",
  target:"#item/posts/post%20%2F%207"
});
assert.deepEqual(normalizeRecordDeepLink(buildExactObjectLink({ objectType:"Post", sourceId:"post-001" })), {
  kind:"record",
  target:"#social/post/post-001"
});

const genericFixtures = [
  ["posts", "Social", "Post"],
  ["campaigns", "Outreach", "Campaign"],
  ["partners", "Partners", "Partner"],
  ["reports", "Files", "File"],
  ["tasks", "Inbox", null],
  ["soc2Changes", "Settings", null]
];
for (const [collection, destination, objectType] of genericFixtures) {
  const result = resolveRouteCompatibility(`#item/${collection}/record-1`);
  assert.equal(result.kind, "object");
  assert.equal(result.destination, destination);
  assert.equal(result.objectType, objectType);
  assert.equal(result.safeHash, `#item/${collection}/record-1`);
  assert.equal(ITEM_COLLECTION_DESTINATIONS[collection], destination);
}

const unknown = resolveRouteCompatibility("#old-but-safe-bookmark");
assert.equal(unknown.kind, "unknown");
assert.equal(unknown.recoveryReason, "unknown_route");
assert.equal(unknown.destination, "Today");
assert.equal(unknown.safeHash, "#old-but-safe-bookmark");

const unsafeHashes = [
  "#javascript:alert(1)",
  "#data:text/html,hello",
  "#item/posts/%E0%A4%A",
  "#item/posts/%3Cscript%3Ealert(1)%3C%2Fscript%3E",
  "#item/posts/../secret",
  "#item/posts/..%2Fsecret",
  "#item/posts/back\\slash",
  "#item/posts/",
  `#item/posts/${"x".repeat(241)}`,
  `#${"x".repeat(2049)}`
];
for (const hash of unsafeHashes) {
  const result = resolveRouteCompatibility(hash);
  assert.equal(result.kind, "unsafe", `${hash.slice(0, 80)} must fail closed.`);
  assert.equal(result.requestedHash, "", "Unsafe raw input must not be echoed.");
  assert.equal(result.requestedRoute, "", "Unsafe raw input must not be echoed.");
  assert.equal(result.safeHash, null);
  assert.equal(result.destination, "Today");
}
assert.equal(buildExactObjectLink({ objectType:"File", sourceKind:"unknown", sourceId:"record-1" }), null);
assert.equal(buildExactObjectLink({ objectType:"Post", sourceId:"../record" }), null);
assert.equal(buildGenericItemLink({ collection:"posts<script>", sourceId:"record-1" }), null);

const unavailable = createObjectNotAvailableContract(resolveRouteCompatibility("#social/post/missing-post"));
assert.deepEqual(unavailable, {
  available:false,
  title:"Record not available",
  message:"This record is not in the loaded data. It may have been removed, or this account may not be allowed to view it."
});
assert.equal(Object.isFrozen(unavailable), true);
assert.match(serverSource, /This record is not in the loaded data/);

const browserContext = { window:{} };
vm.runInNewContext(routeCompatibilityBrowserSource(), browserContext, { timeout:1000 });
const browserAlias = browserContext.window.__LE_VNEXT_ROUTE_COMPATIBILITY.resolve("#social");
assert.equal(browserAlias.canonicalRoute, "growth");
assert.equal(browserAlias.destination, "Social");
const browserObject = browserContext.window.__LE_VNEXT_ROUTE_COMPATIBILITY.resolve("#files/data-room-item/file-1");
assert.equal(browserObject.sourceKind, "dataRoomItems");
assert.equal(browserObject.sourceId, "file-1");

const legacyFixture = `<!doctype html><html><head></head><body>
  <div class="shell"><header class="app-topbar"></header><main id="app"><h1>Legacy</h1></main></div>
  <div id="toast"></div><script>
      const pathRoute = String(location.pathname || "/").replace(/^\\/+|\\/+$/g, "");
      const requestedPage = "legacy-parser";
      if (pageId === "safe-mode") {}
  </script></body></html>`;
const vnextFixture = renderVNextDesktopShell(legacyFixture);
assert.match(vnextFixture, /window\.__LE_VNEXT_ROUTE_COMPATIBILITY/);
assert.match(vnextFixture, /const vnextRouteResolution = window\.__LE_VNEXT_ROUTE_COMPATIBILITY\.resolve/);
assert.match(vnextFixture, /history\.replaceState\(null, "", vnextRouteResolution\.safeHash\)/);
assert.doesNotMatch(vnextFixture, /const requestedPage = "legacy-parser"/);
assert.doesNotMatch(vnextFixture, /location\.(?:reload|replace|assign)\s*\(/);
assert.match(vnextFixture, /Page not found/);
assert.match(vnextFixture, /The link may be old or incomplete\. No data was changed\./);
assert.match(vnextFixture, /href="#today"/);
assert.match(vnextFixture, /id="vnext-global-search-trigger"/);
assert.match(shellSource, /syncRouteRecovery/);
assert.match(shellSource, /renderPageHeader/);
assert.match(shellSource, /renderButton/);

for (const [label, source] of [["compatibility", compatibilitySource], ["links", linksSource]]) {
  assert.doesNotMatch(source, /\bprocess\s*\.|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/);
  assert.doesNotMatch(source, /\b(?:document|localStorage|sessionStorage)\s*\./);
  assert.doesNotMatch(source, /^\s*(?:await\s+)?(?:readFile|writeFile|createServer|listen)\s*\(/m);
  assert.doesNotMatch(source, /from ["'][^"']*(?:preview-server|storage|database|network|state|server|outreach|sending|publish|business-engine)[^"']*["']/i, `${label} imports a forbidden runtime layer.`);
}
assert.equal((compatibilitySource.match(/window\.__LE_VNEXT_ROUTE_COMPATIBILITY/g) || []).length, 1, "The only browser-global reference is emitted inside the inert bootstrap string.");
assert.doesNotMatch(linksSource, /\bwindow\s*\./);
assert.match(compatibilitySource, /from "\.\/navigation\.mjs"/);
assert.doesNotMatch(compatibilitySource, /COMMAND_CENTER_UX_VNEXT/);
assert.match(configSource, /COMMAND_CENTER_UX_VNEXT_ENV_KEY = "COMMAND_CENTER_UX_VNEXT"/);
assert.match(configSource, /readCommandCenterVNextConfig\(serverEnvironment = \{\}\)/);
assert.doesNotMatch(shellSource, /COMMAND_CENTER_UX_VNEXT|localStorage|sessionStorage|document\.cookie/);

const shellStart = serverSource.indexOf("function htmlShell()");
const shellEnd = serverSource.indexOf("\nfunction renderLegacyApp()", shellStart);
assert.ok(shellStart >= 0 && shellEnd > shellStart);
const legacyShellHash = createHash("sha256").update(serverSource.slice(shellStart, shellEnd)).digest("hex");
assert.equal(legacyShellHash, "d9c94bd1cbe726d98c5a4952db74641ef6864b85216b9a60eedd90c572ae7187");

assert.equal(packageJson.scripts["test:vnext-route-compatibility"], "node scripts/test-vnext-route-compatibility.mjs");
assert.match(readFileSync("scripts/run-extended-tests.mjs", "utf8"), /f\.startsWith\("test-"\) && f\.endsWith\("\.mjs"\)/);

console.log(`vNext route compatibility verified: ${routeRegistry.length} canonical routes, ${aliases.length} aliases, four exact object families, safe recovery, and byte-stable legacy output.`);
