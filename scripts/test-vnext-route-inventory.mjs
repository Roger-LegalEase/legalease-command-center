import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MIGRATION_CLASSIFICATIONS,
  VNEXT_DESTINATIONS,
  primaryNavigationInventory,
  routeRegistry
} from "./ui/navigation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverSource = fs.readFileSync(path.join(root, "scripts", "preview-server.mjs"), "utf8");
const routeMapSource = fs.readFileSync(path.join(root, "docs", "ux-vnext", "route-map.md"), "utf8");
const aliasMapSource = fs.readFileSync(path.join(root, "docs", "ux-vnext", "legacy-alias-map.md"), "utf8");
const capabilityMapSource = fs.readFileSync(path.join(root, "docs", "ux-vnext", "capability-map.md"), "utf8");

function requiredMatch(pattern, label) {
  const match = serverSource.match(pattern);
  assert.ok(match, `Could not locate the live ${label} source in preview-server.mjs.`);
  return match;
}

function liveCanonicalRoutes() {
  const literal = requiredMatch(/const knownPages = (\[[^;]+\]);/, "knownPages whitelist")[1];
  const routes = JSON.parse(literal);
  assert.ok(Array.isArray(routes) && routes.every((value) => typeof value === "string"), "knownPages must remain a string array.");
  return routes;
}

function liveAliases() {
  const body = requiredMatch(/const routeAliases = \{([^}]+)\};/, "routeAliases object")[1];
  const pairs = [...body.matchAll(/(?:"([^"]+)"|([A-Za-z0-9_-]+))\s*:\s*"([^"]+)"/g)]
    .map((match) => [match[1] || match[2], match[3]]);
  assert.ok(pairs.length > 0, "routeAliases must contain parseable alias/target pairs.");
  return pairs;
}

function livePrimaryNavigation() {
  const start = serverSource.indexOf('<nav class="top-nav"');
  const end = serverSource.indexOf("</nav>", start);
  assert.ok(start >= 0 && end > start, "Could not locate the live primary navigation markup.");
  const markup = serverSource.slice(start, end + "</nav>".length);
  return [...markup.matchAll(/href="#([^"]+)" data-nav-section="([^"]+)">([^<]+)/g)]
    .map((match) => ({ route: match[1], section: match[2], label: match[3].trim() }));
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

const canonicalRoutes = liveCanonicalRoutes();
const canonicalSet = new Set(canonicalRoutes);
const registryRoutes = routeRegistry.map((entry) => entry.canonicalRoute);
const registrySet = new Set(registryRoutes);

assert.deepEqual(duplicates(canonicalRoutes), [], "The live knownPages whitelist contains duplicate routes.");
assert.deepEqual(duplicates(registryRoutes), [], "The registry contains duplicate canonical routes.");
assert.deepEqual(duplicates(routeRegistry.map((entry) => entry.id)), [], "The registry contains duplicate stable IDs.");
assert.deepEqual(duplicates(routeRegistry.map((entry) => entry.canonicalHash)), [], "The registry contains duplicate canonical hashes.");
assert.deepEqual(
  [...registrySet].filter((route) => !canonicalSet.has(route)).sort(),
  [],
  "The registry contains routes that are absent from the live renderer whitelist."
);
assert.deepEqual(
  [...canonicalSet].filter((route) => !registrySet.has(route)).sort(),
  [],
  "Canonical renderer routes are missing from the registry."
);
assert.equal(routeRegistry.length, canonicalRoutes.length, "Every live canonical route must appear exactly once.");

const documentedRoutes = [...routeMapSource.matchAll(/^\| `#([^`]+)` \|/gm)].map((match) => match[1]);
assert.deepEqual(duplicates(documentedRoutes), [], "The route map documents a canonical route more than once.");
assert.deepEqual(
  documentedRoutes.slice().sort(),
  canonicalRoutes.slice().sort(),
  "The human-readable route map must document every live canonical route exactly once."
);

for (const entry of routeRegistry) {
  assert.equal(entry.id, `route-${entry.canonicalRoute}`, `Stable ID mismatch for ${entry.canonicalRoute}.`);
  assert.equal(entry.canonicalHash, `#${entry.canonicalRoute}`, `Canonical hash mismatch for ${entry.canonicalRoute}.`);
  assert.ok(entry.currentLabel, `Current label is required for ${entry.canonicalRoute}.`);
  assert.ok(entry.renderer, `Renderer identifier is required for ${entry.canonicalRoute}.`);
  assert.ok(entry.currentSurface, `Current surface is required for ${entry.canonicalRoute}.`);
  assert.ok(MIGRATION_CLASSIFICATIONS.includes(entry.migrationClassification), `Invalid migration classification for ${entry.canonicalRoute}.`);
  assert.ok(VNEXT_DESTINATIONS.includes(entry.vnextDestination), `Invalid vNext destination for ${entry.canonicalRoute}.`);
}

const liveAliasPairs = liveAliases();
const liveAliasNames = liveAliasPairs.map(([alias]) => alias);
assert.deepEqual(duplicates(liveAliasNames), [], "The live routeAliases object contains duplicate alias keys.");

for (const [alias, target] of liveAliasPairs) {
  assert.ok(canonicalSet.has(target), `Live alias ${alias} points to missing canonical route ${target}.`);
}

const registryAliasPairs = routeRegistry.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonicalRoute]));
const registryAliasNames = registryAliasPairs.map(([alias]) => alias);
assert.deepEqual(duplicates(registryAliasNames), [], "Duplicate/conflicting alias ownership exists in the registry.");

const liveAliasMap = new Map(liveAliasPairs);
const registryAliasMap = new Map(registryAliasPairs);
assert.deepEqual(
  [...registryAliasMap].filter(([alias, target]) => liveAliasMap.get(alias) !== target).sort(),
  [],
  "The registry contains missing, extra, or retargeted aliases."
);
assert.deepEqual(
  [...liveAliasMap].filter(([alias, target]) => registryAliasMap.get(alias) !== target).sort(),
  [],
  "Live aliases are missing from the registry or have a conflicting owner."
);

for (const [alias, target] of registryAliasPairs) {
  assert.ok(registrySet.has(target), `Registry alias ${alias} points to missing canonical route ${target}.`);
}

const currentAliasSection = aliasMapSource
  .split("## Current hash aliases")[1]
  ?.split("## Parameterized and non-hash compatibility entry points")[0] || "";
const documentedAliasPairs = [...currentAliasSection.matchAll(/^\| `#([^`]+)` \| `#([^`]+)` \|/gm)]
  .map((match) => [match[1], match[2]]);
assert.deepEqual(duplicates(documentedAliasPairs.map(([alias]) => alias)), [], "The alias map documents an alias more than once.");
assert.deepEqual(
  documentedAliasPairs.slice().sort(([left], [right]) => left.localeCompare(right)),
  liveAliasPairs.slice().sort(([left], [right]) => left.localeCompare(right)),
  "The human-readable alias map must document every live alias and target exactly once."
);

const capabilityIds = [...capabilityMapSource.matchAll(/^\| (CAP-\d{3}) —/gm)].map((match) => match[1]);
assert.ok(capabilityIds.length > 0, "The capability map must contain machine-countable capability rows.");
assert.deepEqual(duplicates(capabilityIds), [], "The capability map contains duplicate capability IDs.");

const primaryNavigation = livePrimaryNavigation();
assert.ok(primaryNavigation.length > 0, "Primary navigation must contain at least one item.");
assert.deepEqual(duplicates(primaryNavigation.map((item) => item.route)), [], "Primary navigation contains duplicate routes.");

for (const item of primaryNavigation) {
  const entry = routeRegistry.find((candidate) => candidate.canonicalRoute === item.route);
  assert.ok(entry, `Primary navigation route ${item.route} is missing from the registry.`);
  assert.ok(entry.currentPrimaryNavigation, `Primary navigation route ${item.route} lacks navigation metadata.`);
  assert.equal(entry.currentPrimaryNavigation.label, item.label, `Primary label drift for ${item.route}.`);
  assert.equal(entry.currentPrimaryNavigation.section, item.section, `Primary section drift for ${item.route}.`);
  assert.ok(VNEXT_DESTINATIONS.includes(entry.vnextDestination), `Primary navigation route ${item.route} lacks a valid vNext destination.`);
}

assert.deepEqual(
  primaryNavigationInventory
    .map(({ route, label, section }) => ({ route, label, section }))
    .sort((left, right) => left.route.localeCompare(right.route)),
  primaryNavigation.slice().sort((left, right) => left.route.localeCompare(right.route)),
  "Machine-readable primary navigation inventory has drifted from the live markup."
);

console.log(`vNext route inventory verified: ${routeRegistry.length} canonical routes, ${registryAliasPairs.length} aliases, ${primaryNavigation.length} primary navigation items.`);
