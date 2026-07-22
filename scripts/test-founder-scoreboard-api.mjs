import assert from "node:assert/strict";
import {
  FOUNDER_SCOREBOARD_API_ENDPOINTS,
  handleFounderScoreboardApiRequest,
  isFounderScoreboardApiPath
} from "./founder-scoreboard-api.mjs";

const NOW = "2026-07-21T15:30:00.000Z";
const OWNER = Object.freeze({ authenticated:true, role:"owner", id:"roger" });
const OPERATOR = Object.freeze({ authenticated:true, role:"operator", id:"operator-1" });

function initialState() {
  return {
    runwayInputs:{
      currentCashBalance:125000,
      monthlyBurn:25000,
      asOfDate:"2026-07-20",
      updatedAt:"2026-07-20T10:00:00.000Z",
      updatedBy:"roger"
    },
    partners:[{ id:"partner-1", name:"Community Partner", stage:"proposal_sent", visibility:"all" }],
    tasks:[{ id:"task-1", title:"Follow up", status:"open", dueDate:"2026-07-21", visibility:"all", sourceType:"partner", sourceId:"partner-1" }],
    privateSecrets:{ apiToken:"never-return-this-sentinel" }
  };
}

function fakeStore(seed = initialState(), { writable = true } = {}) {
  let state = structuredClone(seed);
  const reads = [];
  const writes = [];
  const store = {
    async readCollections(collectionNames) {
      reads.push([...collectionNames]);
      return Object.fromEntries(collectionNames.map((collection) => [collection, structuredClone(state[collection] ?? [])]));
    }
  };
  if (writable) {
    store.writeCollections = async (patch) => {
      writes.push(structuredClone(patch));
      state = { ...state, ...structuredClone(patch) };
      return structuredClone(state);
    };
  }
  return { store, reads, writes, state:() => structuredClone(state) };
}

assert.equal(isFounderScoreboardApiPath("/api/ui/scoreboard"), true);
assert.equal(isFounderScoreboardApiPath("/api/ui/scoreboard/finance"), true);
assert.equal(isFounderScoreboardApiPath("/api/ui/scoreboard-extra"), false);
assert.deepEqual(FOUNDER_SCOREBOARD_API_ENDPOINTS, [
  "GET /api/ui/scoreboard",
  "POST /api/ui/scoreboard/finance"
]);

const unmatched = await handleFounderScoreboardApiRequest({ pathname:"/api/ui/today" });
assert.deepEqual(unmatched, { matched:false });

let disabledRead = false;
const disabled = await handleFounderScoreboardApiRequest({
  enabled:false,
  pathname:"/api/ui/scoreboard",
  store:{ readState:async () => { disabledRead = true; return {}; } },
  actor:OWNER,
  now:NOW
});
assert.equal(disabled.status, 404);
assert.equal(disabled.body.outcome, "not_available");
assert.equal(disabledRead, false, "disabled API must not read founder state");

const readOnly = fakeStore();
const get = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"GET",
  pathname:"/api/ui/scoreboard",
  store:readOnly.store,
  actor:OWNER,
  now:NOW
});
assert.equal(get.matched, true);
assert.equal(get.status, 200);
assert.equal(get.body.ok, true);
assert.equal(get.body.scoreboard.available, true);
assert.equal(get.body.scoreboard.groups.length, 6);
assert.equal(get.body.scoreboard.cards.length, 35);
assert.equal(get.body.scoreboard.safety.missingValuesRenderedAsZero, false);
assert.equal(get.body.mutations, 0);
assert.equal(get.body.externalActions, 0);
assert.equal(Object.hasOwn(get.body, "state"), false);
assert.doesNotMatch(JSON.stringify(get.body), /never-return-this-sentinel|privateSecrets/);

const mutable = fakeStore();
const save = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"POST",
  pathname:"/api/ui/scoreboard/finance",
  input:{
    currentCashBalance:"140500.25",
    monthlyBurn:"23400",
    asOfDate:"2026-07-21",
    expectedUpdatedAt:"2026-07-20T10:00:00.000Z"
  },
  store:mutable.store,
  actor:OWNER,
  now:NOW
});
assert.equal(save.status, 200);
assert.equal(save.body.ok, true);
assert.equal(save.body.outcome, "saved");
assert.equal(save.body.mutations, 1);
assert.equal(save.body.externalActions, 0);
assert.equal(save.body.finance.currentCashBalance, 140500.25);
assert.equal(save.body.finance.monthlyBurn, 23400);
assert.equal(save.body.scoreboard.manualFinance.asOfDate, "2026-07-21");
assert.deepEqual(Object.keys(mutable.writes[0]), ["runwayInputs"]);
assert.equal(mutable.writes[0].runwayInputs.updatedBy, "roger");
assert.equal(Object.hasOwn(save.body, "state"), false);
assert.equal(Object.hasOwn(save.body, "patch"), false);
assert.equal(Object.hasOwn(save.body, "changedCollections"), false);
assert.doesNotMatch(JSON.stringify(save.body), /never-return-this-sentinel|privateSecrets/);

const unauthorized = fakeStore();
const denied = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"POST",
  pathname:"/api/ui/scoreboard/finance",
  input:{ currentCashBalance:10, expectedUpdatedAt:"2026-07-20T10:00:00.000Z" },
  store:unauthorized.store,
  actor:OPERATOR,
  now:NOW
});
assert.equal(denied.status, 403);
assert.equal(denied.body.outcome, "unauthorized");
assert.equal(denied.body.mutations, 0);
assert.equal(unauthorized.writes.length, 0);

const conflict = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"POST",
  pathname:"/api/ui/scoreboard/finance",
  input:{ currentCashBalance:1, expectedUpdatedAt:"2026-07-20T10:00:00.000Z" },
  store:mutable.store,
  actor:OWNER,
  now:"2026-07-21T15:31:00.000Z"
});
assert.equal(conflict.status, 409);
assert.equal(conflict.body.outcome, "conflict");
assert.equal(conflict.body.code, "financial_inputs_changed");
assert.equal(mutable.writes.length, 1, "conflict must not write");

const unsupportedInput = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"POST",
  pathname:"/api/ui/scoreboard/finance",
  input:{ currentCashBalance:100, changeProduction:true },
  store:mutable.store,
  actor:OWNER,
  now:NOW
});
assert.equal(unsupportedInput.status, 400);
assert.equal(unsupportedInput.body.mutations, 0);
assert.equal(mutable.writes.length, 1);

const unsupportedQuery = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"GET",
  pathname:"/api/ui/scoreboard",
  searchParams:new URLSearchParams("debug=true"),
  store:mutable.store,
  actor:OWNER,
  now:NOW
});
assert.equal(unsupportedQuery.status, 400);

const noWriter = fakeStore(initialState(), { writable:false });
const unavailableWrite = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"POST",
  pathname:"/api/ui/scoreboard/finance",
  input:{ currentCashBalance:100, expectedUpdatedAt:"2026-07-20T10:00:00.000Z" },
  store:noWriter.store,
  actor:OWNER,
  now:NOW
});
assert.equal(unavailableWrite.status, 503);
assert.equal(unavailableWrite.body.outcome, "unavailable");
assert.equal(unavailableWrite.body.mutations, 0);

const wrongMethod = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"DELETE",
  pathname:"/api/ui/scoreboard",
  store:mutable.store,
  actor:OWNER,
  now:NOW
});
assert.equal(wrongMethod.status, 405);
assert.equal(wrongMethod.body.outcome, "method_not_allowed");

const missingStore = await handleFounderScoreboardApiRequest({
  enabled:true,
  method:"GET",
  pathname:"/api/ui/scoreboard",
  actor:OWNER,
  now:NOW
});
assert.equal(missingStore.status, 503);
assert.equal(missingStore.body.mutations, 0);

console.log("PASS test-founder-scoreboard-api");
