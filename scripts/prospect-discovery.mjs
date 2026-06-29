// B5 — Prospect Discovery OS (Phase 0: infrastructure, NO send path).
//
// What B5 does and — equally important — what it CANNOT do:
//   • Discovery pulls org records from Tier-1 AUTHORITATIVE datasets ONLY (IRS BMF, LSC
//     grantees, NLADA). An LLM may CLASSIFY fetched text, but it NEVER invents an org list:
//     every candidate originates from a fetched dataset row supplied by the discovery dep.
//   • B5 has NO send path. Its only outward action is PROMOTION of human-approved candidates
//     into the B2 outreach collections (outreachOrganizations / outreachContacts). Promoted
//     contacts land Not-Enrolled, so promotion alone can never cause an email.
//   • Code can ONLY ever write review_state "pending_review" (and the engine-internal
//     "promoted" / "promotion_failed"). The "approved" transition exists in EXACTLY ONE
//     place — the human /api/prospects/approve endpoint. engineSetReviewState() THROWS if
//     engine code attempts "approved"; that throw is the structural self-approval lockout.
//   • plan() is side-effect-free: it classifies / dedups / scores already-staged findings
//     with NO network. act() performs discovery (throttled to once/day, behind an injected
//     dep that is inert in Phase 0) and promotion. Autopilot OFF by default is the OUTER gate
//     — uniform with every other engine; nothing discovers or promotes until a human flips it.
//
// SAFETY mirrors B2: the live Tier-1 fetch lives behind deps.runProspectDiscovery (injected
// by the server). With no dep, discovery stages NOTHING. Three independent gates stand
// between this module and any external fetch: autopilot toggle, dep presence, and the
// PROSPECT_LIVE_DISCOVERY flag the server's inert executor checks.

import crypto from "node:crypto";
import { etParts } from "./heartbeat.mjs";
import {
  OUTREACH_CLASSIFICATIONS, isOutreachClassification, normalizeClassification
} from "./outreach-classifications.mjs";

export { OUTREACH_CLASSIFICATIONS, isOutreachClassification, normalizeClassification };

// ---------------------------------------------------------------------------
// 1. DATA MODEL — single source of truth for collection membership (the B1/B2 trap).
//    These MUST stay in sync with coreStateCollections / singletonCollections in storage.mjs
//    or they silently fail to persist to Supabase. test-prospect-discovery.mjs asserts it.
// ---------------------------------------------------------------------------
export const PROSPECT_COLLECTIONS = ["prospectCandidates", "prospectDiscoveryRuns"];
export const PROSPECT_SINGLETON_COLLECTIONS = ["prospectConfig"];

export const PROSPECT_ENGINE_ID = "prospect-discovery";

// Review-state lifecycle. "approved" is listed for completeness, but is reachable ONLY via the
// human approve endpoint — never engine code (see ENGINE_ALLOWED_REVIEW_STATES below).
export const PROSPECT_REVIEW = Object.freeze({
  PENDING: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  PROMOTED: "promoted",
  PROMOTION_FAILED: "promotion_failed"
});

// The ONLY review_state values engine (plan/act) code may write. "approved" is deliberately
// ABSENT — that omission, enforced by engineSetReviewState(), is the self-approval lockout.
const ENGINE_ALLOWED_REVIEW_STATES = new Set([
  PROSPECT_REVIEW.PENDING,
  PROSPECT_REVIEW.PROMOTED,
  PROSPECT_REVIEW.PROMOTION_FAILED
]);

// Tier-1 authoritative sources. Tier-2 paid search is intentionally absent (decision #1).
// Each carries a per-source tos_risk + robots/public flags so a later live fetch stays
// ToS-compliant; the registry is metadata only — the actual fetch is the injected dep.
export const PROSPECT_SOURCES = Object.freeze([
  { id: "irs_bmf", name: "IRS Business Master File (exempt orgs)", tier: 1, tos_risk: "low", robots_respected: true, public_pages_only: true, homepage: "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract" },
  { id: "lsc_grantees", name: "Legal Services Corporation grantees", tier: 1, tos_risk: "low", robots_respected: true, public_pages_only: true, homepage: "https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help" },
  { id: "nlada", name: "National Legal Aid & Defender Association directory", tier: 1, tos_risk: "low", robots_respected: true, public_pages_only: true, homepage: "https://www.nlada.org" }
]);
const PROSPECT_SOURCE_IDS = new Set(PROSPECT_SOURCES.map((s) => s.id));

// National coverage across every RCAP-fit classification (decision #3). Overridable via
// the /api/prospects/config endpoint.
export const DEFAULT_PROSPECT_CONFIG = Object.freeze({
  scope: "national",
  states: [],                                   // empty => all US states/territories
  classifications: [...OUTREACH_CLASSIFICATIONS],
  enabledSources: PROSPECT_SOURCES.map((s) => s.id),
  maxStagedPerRun: 200                          // conservative ceiling per discovery run
});

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []);
function nowIso() { return new Date().toISOString(); }

export function prospectConfigOf(state = {}) {
  const cfg = state.prospectConfig || {};
  return {
    ...DEFAULT_PROSPECT_CONFIG,
    ...cfg,
    classifications: (Array.isArray(cfg.classifications) && cfg.classifications.length
      ? cfg.classifications : DEFAULT_PROSPECT_CONFIG.classifications)
      .map(normalizeClassification).filter(Boolean),
    enabledSources: (Array.isArray(cfg.enabledSources) && cfg.enabledSources.length
      ? cfg.enabledSources : DEFAULT_PROSPECT_CONFIG.enabledSources)
      .filter((id) => PROSPECT_SOURCE_IDS.has(id))
  };
}

// ---------------------------------------------------------------------------
// 2. IDENTITY / DEDUP — by EIN, domain, and name. A candidate is a duplicate if ANY of its
//    keys collides with one already seen.
// ---------------------------------------------------------------------------
export function normalizeEin(value = "") {
  const digits = clean(value).replace(/[^0-9]/g, "");
  return digits.length === 9 ? digits : "";
}
export function normalizeDomain(value = "") {
  let v = lower(value);
  if (!v) return "";
  if (v.includes("@")) v = v.split("@")[1] || "";           // email -> domain
  v = v.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v) ? v : "";
}
const NAME_NOISE = /\b(inc|incorporated|llc|llp|ltd|co|corp|corporation|company|the|a|of|and|&|foundation|fund|services|service|society|assn|association)\b/g;
export function normalizeName(value = "") {
  const n = lower(value).replace(/[^a-z0-9 ]/g, " ").replace(NAME_NOISE, " ").replace(/\s+/g, " ").trim();
  return n;
}

export function prospectKeys(candidate = {}) {
  const keys = [];
  const ein = normalizeEin(candidate.ein);
  if (ein) keys.push(`ein:${ein}`);
  const domain = normalizeDomain(candidate.domain || candidate.website || candidate.email);
  if (domain) keys.push(`domain:${domain}`);
  const name = normalizeName(candidate.organization_name || candidate.name);
  if (name) keys.push(`name:${name}`);
  return keys;
}

// Stable, deterministic primary key (EIN > domain > name) and the id derived from it, so the
// same org re-discovered maps to the same row (no Supabase duplicate; never re-stages an
// already-approved candidate).
export function prospectPrimaryKey(candidate = {}) {
  return prospectKeys(candidate)[0] || "";
}
export function prospectCandidateId(candidate = {}) {
  const primary = prospectPrimaryKey(candidate);
  if (!primary) return "";
  return `prospect-cand-${crypto.createHash("sha1").update(primary).digest("hex").slice(0, 16)}`;
}

// Marks is_duplicate on later collisions; returns a new array (pure). seenKeys may be
// pre-seeded with keys already present elsewhere (e.g. existing B2 orgs).
export function dedupCandidates(candidates = [], seenKeys = new Set()) {
  const out = [];
  for (const c of list(candidates)) {
    const keys = prospectKeys(c);
    const dup = keys.length > 0 && keys.some((k) => seenKeys.has(k));
    keys.forEach((k) => seenKeys.add(k));
    out.push({ ...c, is_duplicate: dup });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. CLASSIFICATION — deterministic, rule-based over fetched text. Output is ALWAYS a member
//    of OUTREACH_CLASSIFICATIONS (the shared B2 vocab) or "" — never a free-form label. An
//    injected LLM classifier may refine this, but its result is validated through
//    normalizeClassification(), so it can never introduce a label outside the vocab.
// ---------------------------------------------------------------------------
const CLASSIFICATION_RULES = [
  ["public_defender", /\bpublic defender|indigent defense|appellate defender|defender (office|association|service)/i],
  ["legal_aid", /\blegal aid|legal services|legal assistance|pro bono|access to justice|civil legal|lsc grantee/i],
  ["second_chance_employer", /\bsecond chance|fair chance|ban the box|formerly incarcerated|reentry employ|hire returning citizens/i],
  ["county_reentry", /\bre-?entry|reintegration|returning citizens|probation|parole|county (jail|corrections|reentry)/i],
  ["government", /\b(county|city|state) of\b|department of|\.gov\b|municipal|board of supervisors|sheriff|district attorney/i],
  ["nonprofit", /\bnon-?profit|501\s*\(\s*c\s*\)|charit|foundation|community (organization|based)/i]
];

export function classifyFromText(...parts) {
  const text = parts.map(clean).filter(Boolean).join(" \n ");
  if (!text) return "";
  for (const [label, re] of CLASSIFICATION_RULES) {
    if (re.test(text)) return label;
  }
  return "";
}

const CLASSIFICATION_WEIGHTS = {
  legal_aid: 30, public_defender: 28, county_reentry: 24,
  second_chance_employer: 22, nonprofit: 16, government: 18
};

export function scoreCandidate(candidate = {}) {
  let s = 0;
  const cls = normalizeClassification(candidate.classification);
  s += cls ? (CLASSIFICATION_WEIGHTS[cls] || 10) : 0;
  if (normalizeEin(candidate.ein)) s += 15;
  if (normalizeDomain(candidate.domain || candidate.website || candidate.email)) s += 10;
  if (clean(candidate.email)) s += 20;
  if (clean(candidate.contact_name)) s += 10;
  return s;
}

// ---------------------------------------------------------------------------
// 4. REVIEW-STATE GUARD — the structural self-approval lockout.
// ---------------------------------------------------------------------------
// The ONLY way engine code changes a candidate's review_state. Throws on any target outside
// ENGINE_ALLOWED_REVIEW_STATES — most importantly "approved". The human approve endpoint sets
// "approved" by writing the field directly (it does NOT call this function), which is exactly
// why the approve transition lives in one place and code cannot self-approve.
export function engineSetReviewState(candidate = {}, target = "", patch = {}) {
  if (!ENGINE_ALLOWED_REVIEW_STATES.has(target)) {
    throw new Error(
      `Engine code may not set review_state="${target}". Allowed: ${[...ENGINE_ALLOWED_REVIEW_STATES].join(", ")}. ` +
      `The "approved" transition exists only in the human /api/prospects/approve endpoint.`
    );
  }
  return { ...candidate, ...patch, review_state: target, updated_at: nowIso() };
}

// Build a fresh staged candidate from a fetched dataset row. ALWAYS pending_review.
function stageCandidate(row = {}, sourceId = "", ctx = {}) {
  const id = prospectCandidateId(row);
  if (!id) return null;                                       // no usable identity => cannot stage
  const llm = typeof ctx.classifyProspect === "function"
    ? normalizeClassification(ctx.classifyProspect(row, { sourceId }))
    : "";
  // Priority: injected LLM refinement > the loader's authoritative classification (e.g. the
  // IRS NTEE-derived label) > deterministic text rules. All three pass through the vocab guard
  // so a candidate can never carry a label outside OUTREACH_CLASSIFICATIONS.
  const rowClass = normalizeClassification(row.classification);
  const classification = llm || rowClass || classifyFromText(row.organization_name, row.name, row.description, row.raw_text);
  const base = {
    id,
    type: "prospect_candidate",
    organization_name: clean(row.organization_name || row.name),
    ein: normalizeEin(row.ein),
    domain: normalizeDomain(row.domain || row.website || row.email),
    website: clean(row.website),
    email: lower(row.email),
    contact_name: clean(row.contact_name),
    city: clean(row.city),
    state: clean(row.state),
    classification,
    ntee_code: clean(row.ntee_code),            // provenance: why the loader matched it (IRS BMF)
    ntee_label: clean(row.ntee_label),
    source: sourceId,
    source_url: clean(row.source_url),
    tos_risk: (PROSPECT_SOURCES.find((s) => s.id === sourceId) || {}).tos_risk || "unknown",
    discovered_at: nowIso()
  };
  base.score = scoreCandidate(base);
  return engineSetReviewState(base, PROSPECT_REVIEW.PENDING);  // structural pending-only stage
}

// ---------------------------------------------------------------------------
// 5. plan() — PURE. Re-classify (only when empty) / dedup / score staged candidates. NEVER
//    fetches and NEVER changes review_state. Returns the pending queue as proposals.
// ---------------------------------------------------------------------------
export function planProspects(state = {}, ctx = {}) {
  const candidates = list(state.prospectCandidates);
  const observations = [];

  // Seed dedup with existing B2 org keys so a staged candidate already represented in
  // outreach is flagged as a duplicate (it should not be re-promoted).
  const seen = new Set();
  for (const org of list(state.outreachOrganizations)) {
    prospectKeys({ organization_name: org.organization_name, domain: org.domain || org.website, ein: org.ein })
      .forEach((k) => seen.add(k));
  }

  const enriched = dedupCandidates(candidates, seen).map((c) => {
    const classification = normalizeClassification(c.classification)
      || classifyFromText(c.organization_name, c.name, c.description, c.raw_text);
    const next = { ...c, classification };
    next.score = scoreCandidate(next);
    return next;
  });

  const pending = enriched
    .filter((c) => lower(c.review_state) === PROSPECT_REVIEW.PENDING)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  observations.push({ type: "prospect_summary", total: enriched.length, pending: pending.length, duplicates: enriched.filter((c) => c.is_duplicate).length });

  return {
    state: { ...state, prospectCandidates: enriched },
    proposals: pending,
    observations
  };
}

// ---------------------------------------------------------------------------
// 6. act() — discovery (throttled once/day, behind an inert dep) + promotion of APPROVED
//    candidates into B2 collections. Runs ONLY when autopilot is ON (heartbeat gates this).
// ---------------------------------------------------------------------------
export async function actProspects(state = {}, ctx = {}) {
  const env = ctx.env || process.env;
  const parts = ctx.etParts || etParts(ctx.now || new Date());
  const config = prospectConfigOf(state);
  let next = {
    ...state,
    prospectCandidates: list(state.prospectCandidates).slice(),
    prospectDiscoveryRuns: list(state.prospectDiscoveryRuns).slice()
  };
  const results = [];

  // ---- discovery (throttled to once per ET day) -------------------------
  const ranToday = next.prospectDiscoveryRuns.some((r) => r.dateKey === parts.dateKey && r.status === "success");
  if (ctx.force || !ranToday) {
    let fetched = 0;
    let staged = 0;
    const existingIds = new Set(next.prospectCandidates.map((c) => c.id));
    if (typeof ctx.runProspectDiscovery === "function") {
      for (const sourceId of config.enabledSources) {
        const source = PROSPECT_SOURCES.find((s) => s.id === sourceId);
        let rows = [];
        try {
          const r = (await ctx.runProspectDiscovery({ source, config, env })) || {};
          rows = list(r.rows);
        } catch (error) {
          results.push({ type: "discovery_error", source: sourceId, reason: String(error.message || error) });
          continue;
        }
        for (const row of rows) {
          if (staged >= config.maxStagedPerRun) break;
          const candidate = stageCandidate(row, sourceId, ctx);
          fetched += 1;
          // Honor classification scope; skip rows that don't classify into an enabled segment.
          if (!candidate) continue;
          if (candidate.classification && !config.classifications.includes(candidate.classification)) continue;
          // Never re-stage / downgrade an id we already hold (preserves approved state).
          if (existingIds.has(candidate.id)) continue;
          next.prospectCandidates = [candidate, ...next.prospectCandidates];
          existingIds.add(candidate.id);
          staged += 1;
        }
      }
    }
    next.prospectDiscoveryRuns = [{
      id: `prospect-run-${parts.dateKey}`,
      dateKey: parts.dateKey,
      ran_at: nowIso(),
      sources: config.enabledSources.slice(),
      fetched,
      staged,
      live: typeof ctx.runProspectDiscovery === "function",
      status: "success"
    }, ...next.prospectDiscoveryRuns.filter((r) => r.dateKey !== parts.dateKey)].slice(0, 365);
    results.push({ type: "discovery", fetched, staged });
  } else {
    results.push({ type: "discovery_skipped", reason: "already_ran_today" });
  }

  // ---- promotion: APPROVED candidates -> B2 collections (the ONLY outward action) -------
  const promotion = promoteApproved(next, ctx);
  next = promotion.state;
  results.push(...promotion.results);

  return { state: next, results };
}

// Promotes ONLY review_state === "approved" candidates into outreachOrganizations /
// outreachContacts. IGNORES pending_review (and every other state). Contacts are seeded
// Not-Enrolled, so promotion can never itself cause a send. Pure-ish: returns new state.
export function promoteApproved(state = {}, ctx = {}) {
  let next = {
    ...state,
    prospectCandidates: list(state.prospectCandidates).slice(),
    outreachOrganizations: list(state.outreachOrganizations).slice(),
    outreachContacts: list(state.outreachContacts).slice()
  };
  const results = [];

  const approved = next.prospectCandidates.filter(
    (c) => lower(c.review_state) === PROSPECT_REVIEW.APPROVED && !c.promoted_at
  );
  if (!approved.length) return { state: next, results };

  // Existing B2 org keys for dedup + linking.
  const orgByKey = new Map();
  for (const org of next.outreachOrganizations) {
    prospectKeys({ organization_name: org.organization_name, domain: org.domain || org.website, ein: org.ein })
      .forEach((k) => orgByKey.set(k, org));
  }
  const contactEmails = new Set(next.outreachContacts.map((c) => lower(c.email)).filter(Boolean));

  const promotedIds = new Set();
  const failedIds = new Map();

  for (const cand of approved) {
    const classification = normalizeClassification(cand.classification);
    if (!classification) {
      // A candidate must carry a valid B2 classification to be promoted (vocab guarantee).
      failedIds.set(cand.id, "missing_or_invalid_classification");
      continue;
    }
    const keys = prospectKeys(cand);
    let org = keys.map((k) => orgByKey.get(k)).find(Boolean);
    if (!org) {
      org = {
        account_id: `prospect-org-${cand.id.replace(/^prospect-cand-/, "")}`,
        organization_name: cand.organization_name,
        domain: cand.domain,
        website: cand.website,
        ein: cand.ein,
        classification,
        origin: "b5_prospect",
        source: cand.source,
        source_url: cand.source_url,
        tos_risk: cand.tos_risk,
        created_at: nowIso()
      };
      next.outreachOrganizations = [org, ...next.outreachOrganizations];
      keys.forEach((k) => orgByKey.set(k, org));
    }

    let contactCreated = false;
    const email = lower(cand.email);
    if (email && !contactEmails.has(email)) {
      const contact = {
        contact_id: `prospect-contact-${cand.id.replace(/^prospect-cand-/, "")}`,
        linked_account_id: org.account_id,
        organization_name: org.organization_name,
        contact_name: cand.contact_name,
        email,
        classification,
        origin: "b5_prospect",
        sequence_status: "Not Enrolled",   // never auto-enrolled => promotion cannot send
        source: cand.source,
        created_at: nowIso()
      };
      next.outreachContacts = [contact, ...next.outreachContacts];
      contactEmails.add(email);
      contactCreated = true;
    }

    promotedIds.add(cand.id);
    results.push({ type: "promoted", candidate_id: cand.id, account_id: org.account_id, contact_created: contactCreated });
  }

  next.prospectCandidates = next.prospectCandidates.map((c) => {
    if (promotedIds.has(c.id)) return engineSetReviewState(c, PROSPECT_REVIEW.PROMOTED, { promoted_at: nowIso() });
    if (failedIds.has(c.id)) return engineSetReviewState(c, PROSPECT_REVIEW.PROMOTION_FAILED, { promotion_error: failedIds.get(c.id) });
    return c;
  });

  return { state: next, results };
}

// ---------------------------------------------------------------------------
// Heartbeat engine descriptor. cadence "daily" => discovery/promotion run at the daily tick;
// the prospectDiscoveryRuns ledger enforces once/day even under a forced tick. Autopilot OFF
// by default (heartbeat.mjs) is the outer gate — uniform with every engine.
// ---------------------------------------------------------------------------
export function buildProspectEngine(deps = {}) {
  return {
    id: PROSPECT_ENGINE_ID,
    cadence: "daily",
    plan(state, ctx) {
      return planProspects(state, ctx);
    },
    async act(state, ctx) {
      // deps injected by the server; absent runProspectDiscovery => discovery stages nothing.
      return actProspects(state, {
        ...ctx,
        runProspectDiscovery: deps.runProspectDiscovery,
        classifyProspect: deps.classifyProspect
      });
    }
  };
}
