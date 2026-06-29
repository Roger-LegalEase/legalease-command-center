// B5 — Tier-1 dataset LOADERS. These feed REAL org rows into the existing prospect-discovery
// pipeline (classify → dedup → score → queue to pending_review). They are the "live discovery"
// the engine's injected runProspectDiscovery dep was always meant to call.
//
// SAFETY POSTURE (unchanged — these loaders only ADD a row source; they cannot weaken it):
//   • Every row originates from an authoritative public dataset (IRS BMF / LSC grantee roster).
//     No org list is invented; an LLM is never asked to produce candidates.
//   • Loaders NEVER attach an email or a guessed website to a discovered org. IRS BMF carries
//     neither; the LSC roster is name+state only. Contact-finding is a deliberate, MANUAL,
//     post-review step the operator does — we never auto-scrape contact info from the open web.
//   • Loaders return rows ONLY. They do not stage, classify-final, score, dedup, or write state;
//     the engine does all of that and stamps every candidate review_state = "pending_review".
//     The ONLY path to "approved" remains the human /api/prospects/approve endpoint.
//   • The whole module is dark unless PROSPECT_LIVE_DISCOVERY is truthy (default OFF). With the
//     flag off, runProspectDiscoverySource() returns zero rows without any network or disk I/O.
//
// NLADA is intentionally NOT built: its member directory is membership-gated and not publicly
// bulk-available, so scraping it would be both fragile and ToS-dubious. loadNlada() returns
// nothing and is flagged "not built — access-restricted" rather than faked.

import { normalizeClassification } from "./outreach-classifications.mjs";

const clean = (v = "") => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v : []);

// The single PROSPECT_LIVE_DISCOVERY gate reader (default OFF). Mirrors outreachLiveSendEnabled.
export function prospectLiveDiscoveryEnabled(env = process.env) {
  return ["true", "1", "yes", "on"].includes(String((env || {}).PROSPECT_LIVE_DISCOVERY || "").toLowerCase());
}

// ---------------------------------------------------------------------------
// NTEE filter — the RCAP-fit segment of the IRS National Taxonomy of Exempt Entities.
// Matched on the 3-char NTEE major+minor code (the trailing suffix letter/digit is ignored,
// e.g. "I80Z" and "I800" both match "I80"). Each code maps to a B5/B2 classification so the
// org routes to the right outreach sequence after the operator approves it.
//
// precision is advisory: "high" buckets are tightly on-target; "medium"/"low" are broader and
// pull some off-target orgs. `default` marks the codes filtered on when no prospectConfig
// .nteePrefixes is set: the high-precision record-clearing core + I99 (crime/legal N.E.C.).
// The non-default codes (R23/R60/J20/J30/J32 — disability/civil-liberties/workforce, tangential
// to record clearing and noisier) stay in the catalog so the operator can broaden coverage via
// nteePrefixes WITHOUT a redeploy if the review queue runs dry.
// ---------------------------------------------------------------------------
export const RCAP_NTEE_FILTER = Object.freeze([
  { prefix: "I80", classification: "legal_aid", label: "Legal Services", precision: "high", default: true },
  { prefix: "I83", classification: "legal_aid", label: "Public Interest Law / Litigation", precision: "high", default: true },
  { prefix: "I40", classification: "nonprofit", label: "Rehabilitation Services for Offenders (reentry)", precision: "high", default: true },
  { prefix: "I43", classification: "nonprofit", label: "Inmate Support", precision: "high", default: true },
  { prefix: "I44", classification: "nonprofit", label: "Prison Alternatives", precision: "high", default: true },
  { prefix: "I99", classification: "nonprofit", label: "Crime & Legal-Related N.E.C.", precision: "medium", default: true },
  { prefix: "R20", classification: "nonprofit", label: "Civil Rights", precision: "high", default: true },
  { prefix: "R22", classification: "nonprofit", label: "Minority Rights", precision: "high", default: true },
  { prefix: "R23", classification: "nonprofit", label: "Disabled Persons' Rights", precision: "medium", default: false },
  { prefix: "R60", classification: "nonprofit", label: "Civil Liberties", precision: "medium", default: false },
  { prefix: "J20", classification: "nonprofit", label: "Employment Procurement / Job Training", precision: "low", default: false },
  { prefix: "J30", classification: "nonprofit", label: "Vocational Rehabilitation", precision: "medium", default: false },
  { prefix: "J32", classification: "nonprofit", label: "Sheltered Employment", precision: "low", default: false }
]);

const NTEE_BY_PREFIX = new Map(RCAP_NTEE_FILTER.map((e) => [e.prefix, e]));
// The full selectable catalog (validation set for config.nteePrefixes).
export const RCAP_NTEE_PREFIXES = Object.freeze(RCAP_NTEE_FILTER.map((e) => e.prefix));
// The active-by-default subset (used when the operator hasn't set nteePrefixes).
export const DEFAULT_NTEE_PREFIXES = Object.freeze(RCAP_NTEE_FILTER.filter((e) => e.default).map((e) => e.prefix));

// The active NTEE prefixes for a run: prospectConfig.nteePrefixes (validated against the catalog)
// if provided, else the default subset above. NEVER silently widens to the whole catalog.
export function activeNteeSet(config = {}) {
  const requested = list(config.nteePrefixes).map((p) => String(p).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3));
  const valid = requested.filter((p) => NTEE_BY_PREFIX.has(p));
  return new Set(valid.length ? valid : DEFAULT_NTEE_PREFIXES);
}

// Maps an NTEE_CD to its classification, or null if outside the (allowed) RCAP filter.
export function nteeClassification(code = "", allowed = null) {
  const prefix = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  if (prefix.length < 3) return null;
  if (allowed && !allowed.has(prefix)) return null;
  const entry = NTEE_BY_PREFIX.get(prefix);
  if (!entry) return null;
  return { prefix, classification: entry.classification, label: entry.label };
}

// ---------------------------------------------------------------------------
// IRS Business Master File (PRIMARY). Public per-state CSV extracts of all 501(c) orgs:
//   https://www.irs.gov/pub/irs-soi/eo_<st>.csv
// Fixed 28-column layout, comma-delimited, NO quoting (org names never contain commas), ALL-CAPS
// names. No email/website columns — by design (we do not fabricate contact info).
// ---------------------------------------------------------------------------
export const BMF_COLUMNS = Object.freeze([
  "EIN", "NAME", "ICO", "STREET", "CITY", "STATE", "ZIP", "GROUP", "SUBSECTION", "AFFILIATION",
  "CLASSIFICATION", "RULING", "DEDUCTIBILITY", "FOUNDATION", "ACTIVITY", "ORGANIZATION", "STATUS",
  "TAX_PERIOD", "ASSET_CD", "INCOME_CD", "FILING_REQ_CD", "PF_FILING_REQ_CD", "ACCT_PD",
  "ASSET_AMT", "INCOME_AMT", "REVENUE_AMT", "NTEE_CD", "SORT_NAME"
]);

// 50 states + DC + the territories the IRS publishes EO extracts for. A 404 on any one is
// non-fatal: the loader records it and moves on.
export const BMF_STATES = Object.freeze([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks",
  "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny",
  "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy", "dc", "pr", "gu", "vi", "as", "mp"
]);

export function bmfUrl(state = "") {
  return `https://www.irs.gov/pub/irs-soi/eo_${String(state).toLowerCase().trim()}.csv`;
}

// Parse a single BMF CSV line into a column-keyed object; null if the row width is wrong.
export function parseBmfRow(line = "") {
  const f = String(line).split(",");
  if (f.length !== BMF_COLUMNS.length) return null;
  const row = {};
  BMF_COLUMNS.forEach((c, i) => { row[c] = f[i]; });
  return row;
}

// One BMF row -> a pipeline candidate row. NO email, NO website (BMF has neither).
function bmfRowToCandidate(row = {}, ntee = {}, stateHint = "") {
  const ein = String(row.EIN || "").replace(/[^0-9]/g, "");
  const state = clean(row.STATE) || String(stateHint || "").toUpperCase();
  return {
    organization_name: clean(row.NAME),         // ALL-CAPS as published; prettified at display time
    ein,
    city: clean(row.CITY),
    state,
    classification: ntee.classification,         // authoritative NTEE-derived classification
    ntee_code: clean(row.NTEE_CD),
    ntee_label: ntee.label,
    ruling_date: clean(row.RULING),              // YYYYMM
    source_url: bmfUrl(state || stateHint)
    // intentionally: no email, no website, no contact_name
  };
}

// Filter raw BMF CSV text to RCAP-fit, ACTIVE (STATUS "01") orgs. Pure + synchronous so it is
// trivially testable on a fixture. `cap` bounds the rows returned (the engine also caps staging).
export function filterBmfCsv(text = "", { allowed = null, stateHint = "", cap = Infinity, activeOnly = true } = {}) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (out.length >= cap) break;
    const line = lines[i];
    if (!line) continue;
    if (i === 0 && /^EIN,NAME,/.test(line)) continue;          // header
    const row = parseBmfRow(line);
    if (!row) continue;
    if (activeOnly && clean(row.STATUS) !== "01") continue;     // active orgs only
    const ntee = nteeClassification(row.NTEE_CD, allowed);
    if (!ntee) continue;
    if (!clean(row.NAME)) continue;
    out.push(bmfRowToCandidate(row, ntee, stateHint));
  }
  return out;
}

function resolveBmfStates(config = {}) {
  const requested = list(config.states).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const known = new Set(BMF_STATES);
  const valid = requested.filter((s) => known.has(s));
  return valid.length ? valid : [...BMF_STATES];
}

async function fetchBmfText(fetchImpl, state) {
  const url = bmfUrl(state);
  const resp = await fetchImpl(url, {
    headers: { "User-Agent": "LegalEase-Prospect-Discovery/1.0 (+public IRS BMF extract; contact roger@legalease.com)" }
  });
  if (!resp || !resp.ok) throw new Error(`HTTP ${resp ? resp.status : "no-response"} for ${url}`);
  return await resp.text();
}

// PRIMARY loader. Downloads (or reads pre-uploaded) per-state BMF extracts, filters to the RCAP
// NTEE segment, maps each to a classification. Returns { rows, live, meta }. meta.reachable lets
// the caller report whether the IRS domain was actually reachable from this environment.
//
// Manual-upload escape hatch: if deps.bmfDataDir / env.BMF_DATA_DIR / config.bmfDataDir is set,
// the loader reads eo_<st>.csv from that directory instead of downloading (so the operator can
// drop the files in if the IRS host is blocked from the deploy env).
export async function loadIrsBmf({ config = {}, env = process.env, deps = {} } = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const allowed = activeNteeSet(config);
  const states = resolveBmfStates(config);
  const maxRows = Math.max(1, Number(config.maxStagedPerRun) || 200);
  const dataDir = clean(deps.bmfDataDir || (env || {}).BMF_DATA_DIR || config.bmfDataDir);

  const rows = [];
  const meta = {
    source: "irs_bmf",
    mode: dataDir ? "local_upload" : "download",
    reachable: null,
    nteePrefixes: [...allowed],
    statesTried: [],
    statesOk: [],
    statesFailed: [],
    matched: 0
  };

  for (const st of states) {
    if (rows.length >= maxRows) break;
    meta.statesTried.push(st);
    let text = "";
    try {
      if (dataDir) {
        if (typeof deps.readFile !== "function") throw new Error("no readFile dep for local BMF mode");
        text = await deps.readFile(`${dataDir.replace(/\/+$/, "")}/eo_${st}.csv`);
      } else {
        if (typeof fetchImpl !== "function") throw new Error("no fetch available for BMF download");
        text = await fetchBmfText(fetchImpl, st);
      }
      meta.reachable = meta.reachable === false ? false : true;
    } catch (error) {
      meta.statesFailed.push({ state: st, error: String(error && error.message || error) });
      if (meta.reachable === null) meta.reachable = false;
      continue;
    }
    meta.statesOk.push(st);
    const matched = filterBmfCsv(text, { allowed, stateHint: st, cap: maxRows - rows.length });
    rows.push(...matched);
  }
  meta.matched = rows.length;
  return { rows, live: true, meta };
}

// ---------------------------------------------------------------------------
// LSC grantees (SMALL SUPPLEMENT). The ~130 Legal Services Corporation grant recipients are not
// a bulk dataset, so this is a curated roster: name + state only (NO fabricated EIN/email/site).
// All map to legal_aid. Many overlap with IRS BMF I80 records — dedup (by normalized name) flags
// the overlap downstream, so seeding both is safe.
//
// This embedded list is a high-confidence curated subset for confirmation, NOT the authoritative
// full roster. To use the official list, drop a JSON array of {organization_name,state} at
// data/lsc-grantees.json (deps.lscRosterPath) and the loader prefers it.
// ---------------------------------------------------------------------------
export const LSC_GRANTEES = Object.freeze([
  // CA
  { organization_name: "Bay Area Legal Aid", state: "CA" },
  { organization_name: "Legal Aid Foundation of Los Angeles", state: "CA" },
  { organization_name: "Legal Services of Northern California", state: "CA" },
  { organization_name: "Central California Legal Services", state: "CA" },
  { organization_name: "Inland Counties Legal Services", state: "CA" },
  { organization_name: "Neighborhood Legal Services of Los Angeles County", state: "CA" },
  { organization_name: "Legal Aid Society of San Diego", state: "CA" },
  { organization_name: "California Indian Legal Services", state: "CA" },
  { organization_name: "Greater Bakersfield Legal Assistance", state: "CA" },
  // CO / CT / DE
  { organization_name: "Colorado Legal Services", state: "CO" },
  { organization_name: "Connecticut Legal Services", state: "CT" },
  { organization_name: "Statewide Legal Services of Connecticut", state: "CT" },
  { organization_name: "Community Legal Aid Society", state: "DE" },
  // FL
  { organization_name: "Bay Area Legal Services", state: "FL" },
  { organization_name: "Community Legal Services of Mid-Florida", state: "FL" },
  { organization_name: "Coast to Coast Legal Aid of South Florida", state: "FL" },
  { organization_name: "Florida Rural Legal Services", state: "FL" },
  { organization_name: "Jacksonville Area Legal Aid", state: "FL" },
  { organization_name: "Legal Aid Service of Broward County", state: "FL" },
  { organization_name: "Legal Services of Greater Miami", state: "FL" },
  { organization_name: "Legal Services of North Florida", state: "FL" },
  { organization_name: "Three Rivers Legal Services", state: "FL" },
  // GA / ID / IL
  { organization_name: "Atlanta Legal Aid Society", state: "GA" },
  { organization_name: "Georgia Legal Services Program", state: "GA" },
  { organization_name: "Idaho Legal Aid Services", state: "ID" },
  { organization_name: "Legal Aid Chicago", state: "IL" },
  { organization_name: "Land of Lincoln Legal Aid", state: "IL" },
  { organization_name: "Prairie State Legal Services", state: "IL" },
  // IN / IA / KS
  { organization_name: "Indiana Legal Services", state: "IN" },
  { organization_name: "Iowa Legal Aid", state: "IA" },
  { organization_name: "Kansas Legal Services", state: "KS" },
  // KY / LA / ME
  { organization_name: "Legal Aid of the Bluegrass", state: "KY" },
  { organization_name: "Kentucky Legal Aid", state: "KY" },
  { organization_name: "Legal Aid Society", state: "KY" },
  { organization_name: "Appalachian Research and Defense Fund of Kentucky", state: "KY" },
  { organization_name: "Acadiana Legal Service Corporation", state: "LA" },
  { organization_name: "Southeast Louisiana Legal Services", state: "LA" },
  { organization_name: "Pine Tree Legal Assistance", state: "ME" },
  // MD / MA
  { organization_name: "Maryland Legal Aid", state: "MD" },
  { organization_name: "Community Legal Aid", state: "MA" },
  { organization_name: "Greater Boston Legal Services", state: "MA" },
  { organization_name: "Northeast Legal Aid", state: "MA" },
  { organization_name: "South Coastal Counties Legal Services", state: "MA" },
  // MI / MN
  { organization_name: "Lakeshore Legal Aid", state: "MI" },
  { organization_name: "Legal Aid of Western Michigan", state: "MI" },
  { organization_name: "Legal Services of Eastern Michigan", state: "MI" },
  { organization_name: "Michigan Indian Legal Services", state: "MI" },
  { organization_name: "Mid-Minnesota Legal Aid", state: "MN" },
  { organization_name: "Southern Minnesota Regional Legal Services", state: "MN" },
  { organization_name: "Legal Aid Service of Northeastern Minnesota", state: "MN" },
  // MS / MO / MT / NE / NV
  { organization_name: "Mississippi Center for Legal Services", state: "MS" },
  { organization_name: "North Mississippi Rural Legal Services", state: "MS" },
  { organization_name: "Legal Services of Eastern Missouri", state: "MO" },
  { organization_name: "Legal Aid of Western Missouri", state: "MO" },
  { organization_name: "Montana Legal Services Association", state: "MT" },
  { organization_name: "Legal Aid of Nebraska", state: "NE" },
  { organization_name: "Nevada Legal Services", state: "NV" },
  // NH / NJ / NM / NY
  { organization_name: "New Hampshire Legal Assistance", state: "NH" },
  { organization_name: "Legal Services of New Jersey", state: "NJ" },
  { organization_name: "New Mexico Legal Aid", state: "NM" },
  { organization_name: "Legal Services NYC", state: "NY" },
  { organization_name: "The Legal Aid Society", state: "NY" },
  { organization_name: "Legal Assistance of Western New York", state: "NY" },
  { organization_name: "Legal Services of the Hudson Valley", state: "NY" },
  { organization_name: "Nassau Suffolk Law Services", state: "NY" },
  { organization_name: "Empire Justice Center", state: "NY" },
  // NC / ND / OH
  { organization_name: "Legal Aid of North Carolina", state: "NC" },
  { organization_name: "Legal Services of North Dakota", state: "ND" },
  { organization_name: "Legal Aid Society of Cleveland", state: "OH" },
  { organization_name: "Legal Aid Society of Columbus", state: "OH" },
  { organization_name: "Community Legal Aid Services", state: "OH" },
  { organization_name: "Advocates for Basic Legal Equality", state: "OH" },
  { organization_name: "Southeastern Ohio Legal Services", state: "OH" },
  // OK / OR / PA
  { organization_name: "Legal Aid Services of Oklahoma", state: "OK" },
  { organization_name: "Legal Aid Services of Oregon", state: "OR" },
  { organization_name: "Oregon Law Center", state: "OR" },
  { organization_name: "Community Legal Services", state: "PA" },
  { organization_name: "Philadelphia Legal Assistance", state: "PA" },
  { organization_name: "MidPenn Legal Services", state: "PA" },
  { organization_name: "Neighborhood Legal Services", state: "PA" },
  { organization_name: "North Penn Legal Services", state: "PA" },
  // RI / SC / SD
  { organization_name: "Rhode Island Legal Services", state: "RI" },
  { organization_name: "South Carolina Legal Services", state: "SC" },
  { organization_name: "East River Legal Services", state: "SD" },
  { organization_name: "Dakota Plains Legal Services", state: "SD" },
  // TN / TX
  { organization_name: "Legal Aid Society of Middle Tennessee and the Cumberlands", state: "TN" },
  { organization_name: "Legal Aid of East Tennessee", state: "TN" },
  { organization_name: "West Tennessee Legal Services", state: "TN" },
  { organization_name: "Memphis Area Legal Services", state: "TN" },
  { organization_name: "Lone Star Legal Aid", state: "TX" },
  { organization_name: "Legal Aid of NorthWest Texas", state: "TX" },
  { organization_name: "Texas RioGrande Legal Aid", state: "TX" },
  // UT / VT / VA
  { organization_name: "Utah Legal Services", state: "UT" },
  { organization_name: "Vermont Legal Aid", state: "VT" },
  { organization_name: "Legal Aid Justice Center", state: "VA" },
  { organization_name: "Central Virginia Legal Aid Society", state: "VA" },
  { organization_name: "Blue Ridge Legal Services", state: "VA" },
  { organization_name: "Legal Aid Society of Eastern Virginia", state: "VA" },
  // WA / WV / WI / WY
  { organization_name: "Northwest Justice Project", state: "WA" },
  { organization_name: "Legal Aid of West Virginia", state: "WV" },
  { organization_name: "Legal Action of Wisconsin", state: "WI" },
  { organization_name: "Wisconsin Judicare", state: "WI" },
  { organization_name: "Legal Aid Society of Milwaukee", state: "WI" },
  { organization_name: "Legal Aid of Wyoming", state: "WY" },
  // DC / PR / territories
  { organization_name: "Legal Aid Society of the District of Columbia", state: "DC" },
  { organization_name: "Neighborhood Legal Services Program", state: "DC" },
  { organization_name: "Community Law Office", state: "PR" },
  { organization_name: "Puerto Rico Legal Services", state: "PR" },
  { organization_name: "Servicios Legales de Puerto Rico", state: "PR" },
  { organization_name: "Micronesian Legal Services Corporation", state: "GU" },
  { organization_name: "Guam Legal Services Corporation", state: "GU" }
]);

// LSC loader. Prefers an official roster file if the deploy provides one; else the curated list.
// Every row is legal_aid; never carries an email or website (manual contact-finding only).
export async function loadLscGrantees({ config = {}, env = process.env, deps = {} } = {}) {
  const maxRows = Math.max(1, Number(config.maxStagedPerRun) || 200);
  let roster = LSC_GRANTEES;
  let mode = "curated";
  const rosterPath = clean(deps.lscRosterPath || (env || {}).LSC_ROSTER_PATH || config.lscRosterPath);
  if (rosterPath && typeof deps.readFile === "function") {
    try {
      const parsed = JSON.parse(await deps.readFile(rosterPath));
      if (Array.isArray(parsed) && parsed.length) { roster = parsed; mode = "official_file"; }
    } catch {
      // fall back to the curated list; not fatal
    }
  }
  const states = list(config.states).map((s) => String(s).toUpperCase().trim()).filter(Boolean);
  const rows = roster
    .filter((g) => clean(g.organization_name))
    .filter((g) => !states.length || states.includes(String(g.state || "").toUpperCase()))
    .slice(0, maxRows)
    .map((g) => ({
      organization_name: clean(g.organization_name),
      state: clean(g.state),
      classification: "legal_aid",
      source_url: "https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help/find-legal-aid"
      // no EIN/email/website — curated roster is name+state only
    }));
  return { rows, live: true, meta: { source: "lsc_grantees", mode, available: roster.length, returned: rows.length } };
}

// ---------------------------------------------------------------------------
// NLADA — NOT BUILT (access-restricted). Membership-gated directory, not publicly bulk-available.
// We deliberately do not scrape it. Returns nothing and says so honestly.
// ---------------------------------------------------------------------------
export async function loadNlada() {
  return {
    rows: [],
    live: true,
    not_built: true,
    meta: { source: "nlada", built: false, reason: "access-restricted: membership-gated directory; not publicly bulk-available; scraping a gated directory is out of scope" }
  };
}

// ---------------------------------------------------------------------------
// Dispatcher — what the server's runProspectDiscovery dep delegates to, once per enabled source.
// Hard-gated by PROSPECT_LIVE_DISCOVERY (default OFF => zero rows, no I/O).
// ---------------------------------------------------------------------------
export async function runProspectDiscoverySource({ source, config = {}, env = process.env, deps = {} } = {}) {
  if (!prospectLiveDiscoveryEnabled(env)) return { rows: [], live: false, reason: "flag_off" };
  const id = source && source.id;
  if (id === "irs_bmf") return loadIrsBmf({ config, env, deps });
  if (id === "lsc_grantees") return loadLscGrantees({ config, env, deps });
  if (id === "nlada") return loadNlada();
  return { rows: [], live: true, reason: `unknown_source:${id || "none"}` };
}
