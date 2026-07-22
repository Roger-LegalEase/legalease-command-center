#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "legalease-targeted-reads-"));
const originalFetch = globalThis.fetch;

process.env.SKIP_ENV_LOCAL_FILE = "1";
process.env.NODE_ENV = "test";
process.env.COMMAND_CENTER_TEST_MODE = "true";
process.env.STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://targeted-reads.example.com";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-targeted-read-key";
process.env.STATE_CACHE_TTL_MS = "60000";
process.env.COMMAND_CENTER_DATA_PATH = path.join(temporaryDirectory, "state.json");
process.env.COMMAND_CENTER_SEED_PATH = path.join(temporaryDirectory, "missing-seed.json");

const makeRows = (collection, count) => Array.from({ length:count }, (_, index) => ({
  collection,
  item_id:`${collection}-${String(index).padStart(5, "0")}`,
  payload:{
    id:`${collection}-${String(index).padStart(5, "0")}`,
    title:`Synthetic ${collection} ${index}`,
    status:collection === "tasks" ? "open" : "active"
  },
  version:1 + (index % 3),
  updated_at:"2026-07-22T12:00:00.000Z"
}));

const databaseRows = [
  ...makeRows("codebaseHealthSnapshots", 14_879),
  ...makeRows("tasks", 80),
  ...makeRows("partners", 40),
  {
    collection:"runwayInputs",
    item_id:"singleton",
    payload:{ currentCashBalance:125_000, monthlyBurn:25_000 },
    version:7,
    updated_at:"2026-07-22T12:00:00.000Z"
  }
];
assert.equal(databaseRows.length, 15_000);

const readRequests = [];
const writeRequests = [];
let remainingTasksReadFailures = 0;

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status:init.status || 200,
    headers:{ "content-type":"application/json", ...(init.headers || {}) }
  });
}

function requestedCollections(value = "") {
  const match = String(value).match(/^in\.\(([^)]+)\)$/);
  assert.ok(match, `Every test read must be scoped by collection=in.(...); received ${value || "no filter"}.`);
  return match[1].split(",").map(decodeURIComponent).sort();
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = String(init.method || "GET").toUpperCase();
  if (url.pathname.endsWith("/rest/v1/leos_core_records") && method === "GET") {
    const collections = requestedCollections(url.searchParams.get("collection"));
    assert.equal(url.searchParams.get("select"), "collection,item_id,payload,version,updated_at");
    assert.equal(url.searchParams.get("order"), "collection.asc,item_id.asc");
    if (remainingTasksReadFailures > 0 && collections.length === 1 && collections[0] === "tasks") {
      remainingTasksReadFailures -= 1;
      return jsonResponse({ message:"Synthetic targeted read failure." }, { status:503 });
    }
    const filtered = databaseRows
      .filter((row) => collections.includes(row.collection))
      .sort((left, right) => left.collection.localeCompare(right.collection) || left.item_id.localeCompare(right.item_id));
    const limit = Number(url.searchParams.get("limit") || 1000);
    const offset = Number(url.searchParams.get("offset") || 0);
    const page = filtered.slice(offset, offset + limit);
    readRequests.push({ collections, select:url.searchParams.get("select"), order:url.searchParams.get("order"), rows:page.length });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const range = page.length ? `${offset}-${offset + page.length - 1}/${filtered.length}` : `*/${filtered.length}`;
    return jsonResponse(page, { headers:{ "content-range":range } });
  }
  if (url.pathname.endsWith("/rest/v1/rpc/leos_apply_core_mutations") && method === "POST") {
    const body = JSON.parse(String(init.body || "{}"));
    const mutations = Array.isArray(body.p_mutations) ? body.p_mutations : [];
    writeRequests.push(mutations.map((mutation) => mutation.collection));
    for (const mutation of mutations) {
      if (mutation.operation !== "upsert") continue;
      const index = databaseRows.findIndex((row) => row.collection === mutation.collection && row.item_id === mutation.item_id);
      const next = {
        collection:mutation.collection,
        item_id:mutation.item_id,
        payload:mutation.payload,
        version:Number(index >= 0 ? databaseRows[index].version : 0) + 1,
        updated_at:"2026-07-22T12:05:00.000Z"
      };
      if (index >= 0) databaseRows[index] = next;
      else databaseRows.push(next);
    }
    return jsonResponse([]);
  }
  throw new Error(`Unexpected external request in targeted-read test: ${method} ${url.pathname}`);
};

try {
  const [
    { JsonStore, SupabaseCoreStore },
    { TODAY_READ_COLLECTIONS },
    { RELATIONSHIP_READ_COLLECTIONS },
    { FOUNDER_SCOREBOARD_READ_COLLECTIONS }
  ] = await Promise.all([
    import("./storage.mjs"),
    import("./today-page-service.mjs"),
    import("./relationship-service.mjs"),
    import("./founder-scoreboard-service.mjs")
  ]);
  const initialState = { tasks:[], partners:[], codebaseHealthSnapshots:[] };
  const createStore = () => new SupabaseCoreStore(initialState);

  const jsonStore = new JsonStore({ tasks:[{ id:"local-task" }], partners:[{ id:"local-partner" }] });
  const localTasks = await jsonStore.readCollections(["tasks"]);
  assert.deepEqual(Object.keys(localTasks).sort(), ["persistence", "tasks"]);

  await assert.rejects(() => createStore().readCollections([]), /non-empty array/);
  await assert.rejects(() => createStore().readCollections(["authSessions"]), /authSessions/);
  await assert.rejects(() => createStore().readCollections(["notRegistered"]), /Unsupported storage collection/);

  readRequests.length = 0;
  const tasksStore = createStore();
  const tasksOnly = await tasksStore.readCollections(["tasks"]);
  assert.deepEqual(Object.keys(tasksOnly).sort(), ["persistence", "tasks"]);
  assert.equal(tasksOnly.tasks.length, 80);
  assert.ok(tasksOnly.tasks.every((task) => Number.isSafeInteger(task._version)));
  assert.deepEqual(readRequests.map((request) => request.collections), [["tasks"]]);
  assert.deepEqual(tasksStore.readPerformanceCounters(), {
    supabaseRequests:1,
    readStateCalls:0,
    targetedReadCalls:1,
    returnedRowCount:80,
    requestedCollectionSets:[["tasks"]]
  });

  readRequests.length = 0;
  const singleton = await createStore().readCollections(["runwayInputs"]);
  assert.equal(Array.isArray(singleton.runwayInputs), false);
  assert.equal(singleton.runwayInputs.currentCashBalance, 125_000);
  assert.equal(singleton.runwayInputs._version, 7);

  readRequests.length = 0;
  const combinedStore = createStore();
  const combined = await combinedStore.readCollections(["tasks", "partners", "tasks"]);
  assert.deepEqual(Object.keys(combined).sort(), ["partners", "persistence", "tasks"]);
  assert.equal(combined.partners.length, 40);
  assert.equal(combined.tasks.length, 80);
  assert.deepEqual(readRequests.map((request) => request.collections), [["partners", "tasks"]]);

  readRequests.length = 0;
  const concurrentStore = createStore();
  const concurrent = await Promise.all([
    concurrentStore.readCollections(["partners", "tasks"]),
    concurrentStore.readCollections(["tasks", "partners"]),
    concurrentStore.readCollections(["partners", "partners", "tasks"])
  ]);
  assert.equal(concurrent.length, 3);
  assert.equal(readRequests.length, 1, "Concurrent identical normalized reads must share one Supabase request.");

  readRequests.length = 0;
  writeRequests.length = 0;
  const invalidationStore = createStore();
  const warm = await invalidationStore.readCollections(["partners", "tasks"]);
  invalidationStore.resetReadPerformanceCounters();
  readRequests.length = 0;
  await invalidationStore.writeCollections({
    tasks:warm.tasks.map((task, index) => index === 0 ? { ...task, title:"Updated targeted task" } : task)
  });
  await invalidationStore.readCollections(["partners"]);
  assert.equal(readRequests.length, 0, "Writing tasks must not evict the partners collection cache.");
  await invalidationStore.readCollections(["tasks"]);
  assert.deepEqual(readRequests.map((request) => request.collections), [["tasks"]]);
  assert.ok(writeRequests.flat().every((collection) => collection === "tasks"));

  invalidationStore.resetReadPerformanceCounters();
  readRequests.length = 0;
  remainingTasksReadFailures = 2;
  invalidationStore._invalidateCollectionCache(["tasks"]);
  await assert.rejects(() => invalidationStore.readCollections(["tasks"]), /Synthetic targeted read failure/);
  await invalidationStore.readCollections(["partners"]);
  assert.equal(readRequests.length, 0, "A failed tasks read must not poison the warm partners cache.");
  await invalidationStore.readCollections(["tasks"]);
  assert.deepEqual(readRequests.map((request) => request.collections), [["tasks"]]);

  readRequests.length = 0;
  const todayStore = createStore();
  const todayState = await todayStore.readCollections(TODAY_READ_COLLECTIONS);
  const todayFirstReadCounters = todayStore.readPerformanceCounters();
  assert.equal(todayFirstReadCounters.supabaseRequests, 1);
  assert.equal(todayFirstReadCounters.returnedRowCount, 120);
  assert.equal(todayFirstReadCounters.readStateCalls, 0);
  await todayStore.readCollections(TODAY_READ_COLLECTIONS);
  assert.equal(todayStore.readPerformanceCounters().supabaseRequests, 1, "Repeated Today reads must be served from collection caches.");
  assert.equal(todayState.codebaseHealthSnapshots, undefined);

  readRequests.length = 0;
  const relationshipStore = createStore();
  await relationshipStore.readCollections(RELATIONSHIP_READ_COLLECTIONS);
  const relationshipCollections = readRequests[0].collections;
  for (const unrelated of ["posts", "postImages", "dataRoomItems", "codebaseHealthSnapshots", "reports"]) {
    assert.equal(relationshipCollections.includes(unrelated), false, `Relationships must not request ${unrelated}.`);
  }

  readRequests.length = 0;
  const scoreboardStore = createStore();
  await scoreboardStore.readCollections(FOUNDER_SCOREBOARD_READ_COLLECTIONS);
  const scoreboardCollections = readRequests[0].collections;
  for (const unrelated of ["leeMessages", "dataRoomItems", "posts", "postImages", "conversationNotes"]) {
    assert.equal(scoreboardCollections.includes(unrelated), false, `Scoreboard must not request ${unrelated}.`);
  }

  const founderApiFiles = [
    "automation-control-center-api.mjs",
    "communication-composer-api.mjs",
    "files-api-integration.mjs",
    "founder-calendar-api.mjs",
    "founder-company-health-api.mjs",
    "founder-scoreboard-api.mjs",
    "founder-support-api.mjs",
    "lee-inbox-api.mjs",
    "outreach-api-integration.mjs",
    "partner-api-integration.mjs",
    "relationship-api-integration.mjs",
    "social-weekly-planner-api.mjs"
  ];
  for (const filename of founderApiFiles) {
    const source = await readFile(new URL(filename, import.meta.url), "utf8");
    assert.doesNotMatch(source, /store\.readState\s*\(/, `${filename} must use targeted reads.`);
  }
  const previewSource = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const founderDispatch = previewSource.slice(
    previewSource.indexOf("if (url.pathname === DISCOVERY_ONBOARDING_ENDPOINT"),
    previewSource.indexOf('if (url.pathname === "/api/reports/aggregate"')
  );
  assert.ok(founderDispatch.length > 10_000, "Founder route dispatch evidence must cover the vNext route block.");
  assert.doesNotMatch(founderDispatch, /store\.readState\s*\(/, "Founder/vNext route dispatch must not hydrate full state.");
  const appShellSource = await readFile(new URL("./ui/app-shell.mjs", import.meta.url), "utf8");
  const targetedBoot = appShellSource.slice(
    appShellSource.indexOf('if (document.body?.dataset.commandCenterShell === "vnext")'),
    appShellSource.indexOf("        return;", appShellSource.indexOf('if (document.body?.dataset.commandCenterShell === "vnext")'))
  );
  assert.match(targetedBoot, /hydrateStatePayload\([\s\S]*render\(\);[\s\S]*targeted-route-ready/);
  assert.doesNotMatch(targetedBoot, /\/api\/(?:state|boot-state)/);

  assert.ok(readRequests.every((request) => request.collections.length > 0));
  const evidence = {
    fakeRows:15_000,
    simulatedLegacyFullRead:{ supabaseRequests:15, returnedRows:15_000 },
    targetedTodayFirstRead:{ supabaseRequests:todayFirstReadCounters.supabaseRequests, returnedRows:todayFirstReadCounters.returnedRowCount },
    targetedTodayCachedRead:{ supabaseRequests:0, returnedRows:0 },
    readStateCalls:todayFirstReadCounters.readStateCalls,
    fullTableSweeps:0
  };
  console.log("TARGETED_READ_EVIDENCE", JSON.stringify(evidence));
  console.log("PASS test-targeted-collection-reads");
} finally {
  globalThis.fetch = originalFetch;
  await rm(temporaryDirectory, { recursive:true, force:true });
}
