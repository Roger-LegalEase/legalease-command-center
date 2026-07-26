// Founder OS Release 8 — the press import.
//
// REVIEW-ONLY BY CONSTRUCTION. Nothing this produces is contactable:
//
//   * every imported outreach contact is written with `sequence_status: "Not Enrolled"` and
//     `press_hold: true`, so no planner can pick it up;
//   * eligibility is evaluated at import and stored as a REASON, not as permission;
//   * the seed list is written held, always, whatever its row says;
//   * nothing here calls a send, claim, suppression or wave-release function. It cannot send.
//
// IDENTITY. A journalist who is already a person in the CRM gains the `media` role on that
// existing record. `companyContactId` — one contact per normalized email, the rule the whole
// Relationships projection already uses — is what decides "already there", so this cannot mint
// a duplicate person for someone who is also, say, a partner contact.

import { CONTACT_TYPES, companyContactId } from "./company-memory.mjs";
import { mapDeskRow, mapMasterRow, mapPlacementRow, mapSeedRow, PRESS_SHEETS, readWorkbook, sheetRecords } from "./press-workbook.mjs";
import { pressEligibility, pressOutreachKind } from "./press-outreach.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();

export const PRESS_CLASSIFICATION = "press";
export const PRESS_PLACEMENTS_COLLECTION = "pressPlacements";
export const PRESS_OUTLET_ROUTES_COLLECTION = "pressOutletRoutes";

function pressContactId(email = "", publication = "", name = "") {
  const key = lower(email) || `${lower(publication)}|${lower(name)}`;
  // Reuses the CRM's own id shape for addressed contacts so the two agree, and falls back to a
  // stable outlet+name key for the many rows that have no address.
  return lower(email) ? `press-${companyContactId(email).replace(/^cc-/, "")}` : `press-outlet-${Buffer.from(key).toString("base64url").slice(0, 20)}`;
}

/**
 * Builds the import plan. PURE — reads state, returns records, writes nothing. The caller
 * persists, so this can be previewed in full before anything is saved.
 */
export function buildPressImportPlan(state = {}, workbook, { now = new Date().toISOString() } = {}) {
  const master = sheetRecords(workbook.get(PRESS_SHEETS.master) || []);
  const seed = sheetRecords(workbook.get(PRESS_SHEETS.seed) || []);
  const desks = sheetRecords(workbook.get(PRESS_SHEETS.desks) || []);
  const existing = sheetRecords(workbook.get(PRESS_SHEETS.existing) || []);

  const companyContacts = list(state.companyContacts);
  const byId = new Map(companyContacts.map((contact) => [clean(contact.contact_id), contact]));
  const byEmail = new Map(companyContacts.filter((c) => clean(c.email)).map((c) => [lower(c.email), c]));

  const outreachContacts = [];
  const contactPatches = [];
  const summary = {
    masterRows: master.length,
    seedRows: seed.length,
    deskRows: desks.length,
    placementRows: existing.length,
    matchedExistingPerson: 0,
    newPerson: 0,
    sendable: 0,
    held: 0,
    heldByReason: {},
    warmFollowUps: 0
  };

  const consider = (mapped, { forceHold = false } = {}) => {
    const eligibility = forceHold
      ? { sendable: false, reason: "seed_list", detail: "Seed research, held on import.", shared: false }
      : pressEligibility(mapped, { now });
    const kind = pressOutreachKind(mapped);
    if (eligibility.sendable) summary.sendable += 1;
    else {
      summary.held += 1;
      summary.heldByReason[eligibility.reason] = (summary.heldByReason[eligibility.reason] || 0) + 1;
    }
    if (kind.kind === "warm_follow_up") summary.warmFollowUps += 1;

    outreachContacts.push({
      contact_id: pressContactId(mapped.email, mapped.publication, mapped.name),
      email: mapped.email,
      contact_name: mapped.name,
      organization_name: mapped.publication,
      classification: PRESS_CLASSIFICATION,
      origin: "press_workbook_2026",
      source: mapped.press_source,
      // The two fields that keep this inert. A planner will not enrol a held contact, and
      // nothing flips these except a deliberate release.
      sequence_status: "Not Enrolled",
      press_hold: true,
      press_sendable: eligibility.sendable === true,
      press_hold_reason: eligibility.reason || null,
      press_hold_detail: eligibility.detail || null,
      press_outreach_kind: kind.kind,
      press_recommended_follow_up: kind.recommendedFollowUp,
      imported_at: now,
      ...mapped
    });

    // Identity: attach the media role to the person who already exists, else record a new one.
    if (!mapped.email) return;
    const contactId = companyContactId(mapped.email);
    const match = byId.get(contactId) || byEmail.get(lower(mapped.email));
    if (match) {
      summary.matchedExistingPerson += 1;
      const types = [...new Set([...list(match.types), "media"])].filter((type) => CONTACT_TYPES.includes(type));
      contactPatches.push({ contact_id: clean(match.contact_id) || contactId, email: lower(mapped.email), types, existing: true });
    } else {
      summary.newPerson += 1;
      contactPatches.push({ contact_id: contactId, email: lower(mapped.email), name: mapped.name, types: ["media"], existing: false });
    }
  };

  for (const row of master) consider(mapMasterRow(row));
  for (const row of seed) consider(mapSeedRow(row), { forceHold: true });

  const outletRoutes = desks.map((row) => {
    const mapped = mapDeskRow(row);
    return {
      id: `press-desk-${Buffer.from(lower(mapped.outlet)).toString("base64url").slice(0, 20)}`,
      ...mapped,
      imported_at: now
    };
  });

  const placements = existing.map((row) => {
    const mapped = mapPlacementRow(row);
    return {
      id: `press-placement-${Buffer.from(`${lower(mapped.publication)}|${lower(mapped.journalist)}`).toString("base64url").slice(0, 24)}`,
      ...mapped,
      // A prior placement is coverage that already ran, so it is recorded, never pitched.
      kind: "prior_coverage",
      imported_at: now
    };
  });

  return { outreachContacts, contactPatches, outletRoutes, placements, summary };
}

/** Applies a plan to state. Still no send path — it only writes records. */
export function applyPressImportPlan(state = {}, plan, { now = new Date().toISOString() } = {}) {
  const next = { ...state };
  const existingOutreach = list(next.outreachContacts);
  const outreachById = new Map(existingOutreach.map((row) => [clean(row.contact_id), row]));
  for (const row of plan.outreachContacts) outreachById.set(row.contact_id, { ...outreachById.get(row.contact_id), ...row, updated_at: now });
  next.outreachContacts = [...outreachById.values()];

  const contacts = list(next.companyContacts);
  const contactById = new Map(contacts.map((row) => [clean(row.contact_id), row]));
  for (const patch of plan.contactPatches) {
    const current = contactById.get(patch.contact_id);
    contactById.set(patch.contact_id, current
      ? { ...current, types: patch.types, updated_at: now }
      : { contact_id: patch.contact_id, email: patch.email, name: patch.name || "", types: patch.types, links: [], organizations: [], created_at: now, updated_at: now });
  }
  next.companyContacts = [...contactById.values()];

  const routes = new Map(list(next[PRESS_OUTLET_ROUTES_COLLECTION]).map((row) => [clean(row.id), row]));
  for (const route of plan.outletRoutes) routes.set(route.id, route);
  next[PRESS_OUTLET_ROUTES_COLLECTION] = [...routes.values()];

  const placements = new Map(list(next[PRESS_PLACEMENTS_COLLECTION]).map((row) => [clean(row.id), row]));
  for (const placement of plan.placements) placements.set(placement.id, placement);
  next[PRESS_PLACEMENTS_COLLECTION] = [...placements.values()];

  return next;
}

export function readPressWorkbook(buffer) {
  return readWorkbook(buffer);
}
