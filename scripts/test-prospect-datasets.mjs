// B5 — Tier-1 dataset LOADER tests. Proves the live-discovery loaders feed REAL rows into the
// existing pipeline while preserving every safety property:
//   1.  NTEE filter maps only RCAP-fit codes, and only to valid B2 classifications.
//   2.  BMF CSV parsing: fixed 28-col, header skip, malformed-row skip.
//   3.  filterBmfCsv: NTEE filter + ACTIVE-only (STATUS 01) + classification mapping + NTEE provenance.
//   4.  Loaders NEVER attach an email or website (no fabricated/scraped contact info).
//   5.  loadIrsBmf: multi-state, reachable/failed accounting, cap, manual-upload (readFile) mode.
//   6.  PROSPECT_LIVE_DISCOVERY OFF => dispatcher returns ZERO rows with NO network/disk I/O.
//   7.  LSC roster => all legal_aid, name+state only, state filter + official-file override.
//   8.  NLADA => not built (access-restricted): zero rows, flagged honestly.
//   9.  End-to-end: loader rows through actProspects land 100% pending_review (no auto-approve,
//       no send), with the NTEE classification preserved.

import assert from "node:assert";
import {
  RCAP_NTEE_FILTER, RCAP_NTEE_PREFIXES, DEFAULT_NTEE_PREFIXES, nteeClassification, activeNteeSet,
  parseBmfRow, filterBmfCsv, loadIrsBmf, loadLscGrantees, LSC_GRANTEES, loadNlada,
  runProspectDiscoverySource, prospectLiveDiscoveryEnabled, bmfUrl, BMF_COLUMNS
} from "./prospect-datasets.mjs";
import { isOutreachClassification, actProspects, PROSPECT_REVIEW } from "./prospect-discovery.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

const DAILY_TICK = new Date("2026-07-01T10:00:00Z");

// A minimal BMF fixture (real 28-column layout). Mix of matches, a non-match, an inactive org,
// and a malformed short row.
const H = BMF_COLUMNS.join(",");
function bmfLine({ ein, name, city, state, status = "01", ntee }) {
  // 28 columns; only the ones the loader reads carry meaning, the rest are filler.
  const f = new Array(28).fill("");
  f[0] = ein; f[1] = name; f[4] = city; f[5] = state; f[11] = "201501"; f[16] = status; f[26] = ntee;
  return f.join(",");
}
const BMF_RI = [
  H,
  bmfLine({ ein: "050001111", name: "RHODE ISLAND LEGAL SERVICES INC", city: "PROVIDENCE", state: "RI", ntee: "I80Z" }),
  bmfLine({ ein: "050002222", name: "TURNING AROUND MINISTRIES INC", city: "NEWPORT", state: "RI", ntee: "I40" }),
  bmfLine({ ein: "050003333", name: "DISABILITY RIGHTS RHODE ISLAND", city: "PROVIDENCE", state: "RI", ntee: "R230" }),
  bmfLine({ ein: "050004444", name: "SABATTUS HOUSING INC", city: "WARWICK", state: "RI", ntee: "L21" }),       // not RCAP-fit
  bmfLine({ ein: "050005555", name: "DEFUNCT LEGAL AID INC", city: "BRISTOL", state: "RI", status: "20", ntee: "I80" }), // inactive
  "050006666,BROKEN ROW MISSING COLUMNS,RI,I80"                                                                  // malformed (4 cols)
].join("\n");

const BMF_MA = [
  H,
  bmfLine({ ein: "040007777", name: "GREATER BOSTON LEGAL SERVICES", city: "BOSTON", state: "MA", ntee: "I80" })
].join("\n");

// A fake fetch: serves fixtures for RI/MA, 404 for a deliberately-broken state.
function fakeFetch(map) {
  let calls = 0;
  const impl = async (url) => {
    calls += 1;
    if (url === bmfUrl("ri")) return { ok: true, status: 200, async text() { return BMF_RI; } };
    if (url === bmfUrl("ma")) return { ok: true, status: 200, async text() { return BMF_MA; } };
    return { ok: false, status: 404, async text() { return ""; } };
  };
  impl.calls = () => calls;
  return impl;
}

// ---- 1. NTEE filter integrity --------------------------------------------
function testNteeFilter() {
  for (const e of RCAP_NTEE_FILTER) {
    assert.ok(isOutreachClassification(e.classification), `${e.prefix} -> valid vocab classification (${e.classification})`);
    assert.equal(e.prefix.length, 3, `${e.prefix} is a 3-char NTEE prefix`);
  }
  // suffix-insensitive matching on the 3-char major+minor code
  assert.equal(nteeClassification("I80Z").classification, "legal_aid", "I80Z -> legal_aid");
  assert.equal(nteeClassification("I800").classification, "legal_aid", "trailing digit suffix matches");
  assert.equal(nteeClassification("R230").classification, "nonprofit", "R230 -> nonprofit");
  assert.equal(nteeClassification("L21"), null, "L21 (housing) not in RCAP filter");
  assert.equal(nteeClassification("J22"), null, "J22 (vocational training) not in the active set");
  assert.equal(nteeClassification(""), null, "empty NTEE -> null");
  // active-set restriction
  const onlyLegal = activeNteeSet({ nteePrefixes: ["I80", "I83"] });
  assert.equal(nteeClassification("I80", onlyLegal).classification, "legal_aid", "restricted set keeps I80");
  assert.equal(nteeClassification("I40", onlyLegal), null, "restricted set drops I40");
  // DEFAULT (no config) = high-precision core + I99, NOT the whole catalog.
  assert.deepEqual([...DEFAULT_NTEE_PREFIXES].sort(), ["I40", "I43", "I44", "I80", "I83", "I99", "R20", "R22"], "default = core 8 codes");
  assert.deepEqual([...activeNteeSet({})].sort(), [...DEFAULT_NTEE_PREFIXES].sort(), "empty config => default subset");
  assert.ok(!DEFAULT_NTEE_PREFIXES.includes("R23") && !DEFAULT_NTEE_PREFIXES.includes("J20"), "noisy buckets off by default");
  // ...but the dropped buckets remain SELECTABLE via config (broaden later, no redeploy)
  assert.ok(RCAP_NTEE_PREFIXES.includes("J20") && RCAP_NTEE_PREFIXES.includes("R60"), "dropped buckets stay in the catalog");
  assert.deepEqual([...activeNteeSet({ nteePrefixes: ["J20", "R23"] })].sort(), ["J20", "R23"], "operator can opt the dropped buckets back in");
  assert.deepEqual([...activeNteeSet({ nteePrefixes: ["ZZZ", "I80"] })], ["I80"], "unknown prefixes dropped");
  ok("NTEE filter: default = core 8 (incl. I99); noisy buckets off-by-default but config-selectable");
}

// ---- 2 + 3 + 4. CSV parse + filter + no-contact-info ----------------------
function testBmfParseFilter() {
  assert.equal(parseBmfRow("a,b,c"), null, "wrong-width row -> null");
  const good = parseBmfRow(BMF_RI.split("\n")[1]);
  assert.equal(good.EIN, "050001111", "parses EIN");
  assert.equal(good.NTEE_CD, "I80Z", "parses NTEE_CD");

  const rows = filterBmfCsv(BMF_RI, { stateHint: "ri" });
  const names = rows.map((r) => r.organization_name);
  assert.ok(names.includes("RHODE ISLAND LEGAL SERVICES INC"), "keeps I80 legal services");
  assert.ok(names.includes("TURNING AROUND MINISTRIES INC"), "keeps I40 reentry");
  assert.ok(names.includes("DISABILITY RIGHTS RHODE ISLAND"), "keeps R23 disability rights");
  assert.ok(!names.includes("SABATTUS HOUSING INC"), "drops non-RCAP NTEE (L21)");
  assert.ok(!names.includes("DEFUNCT LEGAL AID INC"), "drops INACTIVE org (STATUS != 01)");
  assert.equal(rows.length, 3, "exactly the 3 active RCAP-fit orgs (malformed row skipped)");

  const legal = rows.find((r) => r.ntee_code === "I80Z");
  assert.equal(legal.classification, "legal_aid", "I80 -> legal_aid");
  assert.equal(legal.ntee_label, "Legal Services", "carries NTEE label provenance");
  assert.equal(rows.find((r) => r.ntee_code === "I40").classification, "nonprofit", "I40 -> nonprofit");

  // CRITICAL: loaders never invent contact info.
  for (const r of rows) {
    assert.ok(!("email" in r) || !r.email, `no email on ${r.organization_name}`);
    assert.ok(!("website" in r) || !r.website, `no website on ${r.organization_name}`);
    assert.ok(r.ein && r.state, "EIN + state preserved from BMF");
  }
  // cap is honored
  assert.equal(filterBmfCsv(BMF_RI, { stateHint: "ri", cap: 1 }).length, 1, "cap bounds rows");
  ok("BMF parse/filter: NTEE + active-only + classification mapping + NTEE provenance, never any email/website");
}

// ---- 5. loadIrsBmf: multi-state, reachability accounting, manual-upload ----
async function testLoadIrsBmf() {
  const fetchImpl = fakeFetch();
  // ak is a real state code the fake fetch 404s (only ri/ma have fixtures); zz would be dropped
  // before fetch as an unknown code, so we use ak to exercise the 404 path.
  const res = await loadIrsBmf({ config: { states: ["ri", "ma", "ak"] }, env: {}, deps: { fetchImpl } });
  assert.equal(res.live, true, "live:true");
  assert.equal(res.meta.reachable, true, "IRS reachable (at least one state ok)");
  assert.deepEqual(res.meta.statesOk.sort(), ["ma", "ri"], "ri + ma fetched ok");
  assert.equal(res.meta.statesFailed[0].state, "ak", "ak recorded as failed (404)");
  // default filter excludes R23 (Disability Rights), so RI yields I80+I40 (2) and MA yields I80 (1).
  assert.equal(res.rows.length, 3, "2 RI + 1 MA RCAP-fit rows under the default NTEE set");
  assert.ok(res.rows.every((r) => !r.email && !r.website), "no contact info from any state");
  assert.ok(res.meta.nteePrefixes.includes("I80") && !res.meta.nteePrefixes.includes("R23"), "meta records the default active prefixes");

  // unreachable host => reachable:false, zero rows, no throw
  const downFetch = async () => { throw new Error("ENOTFOUND www.irs.gov"); };
  const down = await loadIrsBmf({ config: { states: ["ri"] }, env: {}, deps: { fetchImpl: downFetch } });
  assert.equal(down.meta.reachable, false, "unreachable IRS => reachable:false");
  assert.equal(down.rows.length, 0, "unreachable => zero rows (no crash)");

  // manual-upload mode: read pre-uploaded CSV from disk via readFile dep (IRS host blocked)
  const local = await loadIrsBmf({
    config: { states: ["ri"], bmfDataDir: "/data/bmf" }, env: {},
    deps: { readFile: async (p) => { assert.equal(p, "/data/bmf/eo_ri.csv", "reads eo_ri.csv from upload dir"); return BMF_RI; } }
  });
  assert.equal(local.meta.mode, "local_upload", "local upload mode");
  assert.equal(local.rows.length, 2, "parses uploaded RI file (I80 + I40 under default set)");
  ok("loadIrsBmf: multi-state download, reachability accounting, and manual-upload (readFile) mode");
}

// ---- 6. flag OFF => dispatcher inert (no I/O) -----------------------------
async function testFlagGate() {
  assert.equal(prospectLiveDiscoveryEnabled({}), false, "flag default OFF");
  assert.equal(prospectLiveDiscoveryEnabled({ PROSPECT_LIVE_DISCOVERY: "true" }), true, "flag on when truthy");
  const fetchImpl = fakeFetch();
  const off = await runProspectDiscoverySource({
    source: { id: "irs_bmf" }, config: { states: ["ri"] }, env: {}, deps: { fetchImpl }
  });
  assert.deepEqual(off, { rows: [], live: false, reason: "flag_off" }, "flag OFF => zero rows");
  assert.equal(fetchImpl.calls(), 0, "flag OFF => fetch NEVER called (no network I/O)");

  const on = await runProspectDiscoverySource({
    source: { id: "irs_bmf" }, config: { states: ["ri"] }, env: { PROSPECT_LIVE_DISCOVERY: "true" }, deps: { fetchImpl }
  });
  assert.ok(on.rows.length >= 1 && fetchImpl.calls() >= 1, "flag ON => loader runs");
  ok("PROSPECT_LIVE_DISCOVERY OFF => dispatcher returns zero rows with NO network/disk I/O");
}

// ---- 7. LSC roster --------------------------------------------------------
async function testLscRoster() {
  const res = await loadLscGrantees({ config: {}, env: {}, deps: {} });
  assert.ok(res.rows.length >= 50, `curated LSC roster has a meaningful count (${res.rows.length})`);
  assert.ok(res.rows.every((r) => r.classification === "legal_aid"), "every LSC org is legal_aid");
  assert.ok(res.rows.every((r) => !r.email && !r.website && !r.ein), "LSC rows are name+state only (no contact info / no EIN)");
  assert.ok(res.rows.every((r) => r.organization_name && r.state), "every LSC org has name + state");
  assert.equal(res.meta.mode, "curated", "uses curated list by default");

  // state filter
  const ca = await loadLscGrantees({ config: { states: ["CA"] }, env: {}, deps: {} });
  assert.ok(ca.rows.length >= 1 && ca.rows.every((r) => r.state === "CA"), "state filter restricts roster");

  // official-file override
  const official = await loadLscGrantees({
    config: { lscRosterPath: "/data/lsc.json" }, env: {},
    deps: { readFile: async () => JSON.stringify([{ organization_name: "Official Legal Aid", state: "TX" }]) }
  });
  assert.equal(official.meta.mode, "official_file", "prefers official roster file when provided");
  assert.equal(official.rows[0].organization_name, "Official Legal Aid", "uses official file rows");
  ok("LSC roster: all legal_aid, name+state only, state filter + official-file override");
}

// ---- 8. NLADA not built ---------------------------------------------------
async function testNladaNotBuilt() {
  const res = await loadNlada();
  assert.equal(res.rows.length, 0, "NLADA yields zero rows");
  assert.equal(res.not_built, true, "flagged not_built");
  assert.match(res.meta.reason, /access-restricted/i, "honest access-restricted reason");
  // via dispatcher (flag on) — still nothing, never throws
  const viaDispatch = await runProspectDiscoverySource({ source: { id: "nlada" }, env: { PROSPECT_LIVE_DISCOVERY: "true" } });
  assert.equal(viaDispatch.rows.length, 0, "dispatcher NLADA => zero rows");
  ok("NLADA not built (access-restricted): zero rows, flagged honestly, never scraped");
}

// ---- 9. end-to-end: loader rows -> pipeline -> all pending_review ----------
async function testEndToEndPendingOnly() {
  const fetchImpl = fakeFetch();
  // The engine's discovery dep, wired exactly like the server wires it, with the flag ON.
  const dep = async ({ source, config }) => runProspectDiscoverySource({
    source, config, env: { PROSPECT_LIVE_DISCOVERY: "true" }, deps: { fetchImpl }
  });
  const state = {
    prospectConfig: { enabledSources: ["irs_bmf", "lsc_grantees"], states: ["ri"] },
    prospectCandidates: [], prospectDiscoveryRuns: [], outreachOrganizations: [], outreachContacts: []
  };
  const res = await actProspects(state, { now: DAILY_TICK, env: { PROSPECT_LIVE_DISCOVERY: "true" }, runProspectDiscovery: dep });
  const cands = res.state.prospectCandidates;
  assert.ok(cands.length >= 3, `staged real BMF + LSC orgs (${cands.length})`);
  // SAFETY: every discovered candidate is pending_review — nothing auto-approved.
  assert.ok(cands.every((c) => c.review_state === PROSPECT_REVIEW.PENDING), "100% pending_review (no auto-approve)");
  assert.ok(cands.every((c) => isOutreachClassification(c.classification)), "every candidate carries a valid B2 classification");
  assert.ok(cands.every((c) => !c.email), "no discovered candidate has an email (cannot be sendable)");
  // NTEE classification preserved through the pipeline
  const legal = cands.find((c) => c.ntee_code === "I80Z");
  assert.ok(legal && legal.classification === "legal_aid", "IRS NTEE classification preserved end-to-end");
  // LSC org came through too
  assert.ok(cands.some((c) => c.source === "lsc_grantees" && c.classification === "legal_aid"), "LSC legal_aid org staged");
  ok("end-to-end: loader rows flow through the pipeline and land 100% pending_review (no send path)");
}

async function main() {
  console.log("\nB5 — Tier-1 dataset loader tests\n");
  testNteeFilter();
  testBmfParseFilter();
  await testLoadIrsBmf();
  await testFlagGate();
  await testLscRoster();
  await testNladaNotBuilt();
  await testEndToEndPendingOnly();
  console.log(`\n${passed} checks passed.\n`);
}

main().catch((error) => { console.error("\nPROSPECT DATASETS TEST FAILED:\n", error); process.exit(1); });
