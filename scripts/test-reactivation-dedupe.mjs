#!/usr/bin/env node
// Reactivation duplicate-contact guards — the 2026-07-08 duplicate-send incident.
//
// What happened on prod: reactivationContacts was the only collection persisted under
// INDEX-based Supabase row keys (contact records carry no `id`, so coreRecordId fell through
// to `collection-<index>`). Concurrent full-state writes with different snapshot orderings
// interleaved rows — duplicating some contacts and overwriting others — until 3,838 rows held
// only 537 distinct emails. planReactivation had no dedupe, so every duplicate record of a due
// contact became one more LIVE SEND of the same touch: the 12:00Z campaign batch delivered up
// to 8 copies of one email to a single person.
//
// These tests prove the two fixes:
//   1. Storage: coreRecordId keys contact-shaped records by contact_id BEFORE the index
//      fallback, so concurrent writes converge on one row per person instead of shredding.
//   2. Planner: planReactivation proposes at most one send per contact_id AND per email, no
//      matter how many duplicate records exist — the last line where a duplicate can be
//      stopped before it reaches SendGrid.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planReactivation, DEFAULT_REACTIVATION_CONFIG } from "./reactivation-os.mjs";

let passed = 0;
function ok(name) { console.log("  ✓ " + name); passed += 1; }

console.log("Reactivation duplicate-contact guard tests");

// ---- 1. Storage row keys: contact_id beats the index fallback ---------------------------------
{
  const src = readFileSync(new URL("./storage.mjs", import.meta.url), "utf8");
  const start = src.indexOf("function coreRecordId");
  assert(start >= 0, "coreRecordId exists");
  const body = src.slice(start, src.indexOf("}", start));
  const idPos = body.indexOf("item?.contact_id");
  const indexPos = body.indexOf('collection + "-" + index');
  assert(idPos >= 0, "coreRecordId falls back to contact_id for id-less records");
  assert(indexPos > idPos, "contact_id is tried BEFORE the position-dependent index fallback");
  ok("storage keys contact-shaped records by contact_id, not by list position");
}

// ---- 2. Planner dedupe: one proposal per person ------------------------------------------------
// A weekday inside the 8–17 ET window; wave 1 released; every contact enrolled long enough ago
// that touch 1 is due. No attempts/events → thresholds untripped.
const NOW = new Date("2026-07-08T15:00:00Z"); // Wednesday 11:00 ET
const enrolled = "2026-07-01T12:00:00.000Z";
const base = { wave: 1, enrolled_at: enrolled, sequence_status: "Active" };
const mk = (contactId, email, extra = {}) => ({ ...base, contact_id: contactId, email, ...extra });

const state = {
  reactivationCampaign: {
    ...DEFAULT_REACTIVATION_CONFIG,
    status: "active",
    releasedWaves: [1]
  },
  reactivationContacts: [
    // same person duplicated 3x (same contact_id + email) — the prod shredding shape
    mk("react-dup-a", "dup-a@example.com"),
    mk("react-dup-a", "dup-a@example.com"),
    mk("react-dup-a", "dup-a@example.com"),
    // same EMAIL under two different contact_ids — still one human inbox
    mk("react-dup-b1", "dup-b@example.com"),
    mk("react-dup-b2", "dup-b@example.com"),
    // unique control contact
    mk("react-unique", "unique@example.com"),
    // duplicated person whose FIRST record is held — the person must get nothing
    // (fail-closed: when duplicate records disagree, not sending is the safe direction)
    mk("react-held", "held@example.com", { campaign_hold: true, hold: true, do_not_contact: false, sequence_status: "Hold" }),
    mk("react-held", "held@example.com")
  ],
  reactivationAttempts: [],
  reactivationEvents: [],
  outreachSuppressions: []
};

const plan = planReactivation(state, { now: NOW, env: {} });
const proposals = plan.proposals || [];
const byId = {};
for (const p of proposals) byId[p.contact.contact_id] = (byId[p.contact.contact_id] || 0) + 1;

{
  assert.equal(byId["react-dup-a"] || 0, 1, "3 duplicate records of one contact_id → exactly 1 proposal");
  ok("duplicate records sharing a contact_id collapse to one proposed send");
}
{
  const bCount = (byId["react-dup-b1"] || 0) + (byId["react-dup-b2"] || 0);
  assert.equal(bCount, 1, "two contact_ids sharing an email → exactly 1 proposal");
  ok("duplicate records sharing an email collapse to one proposed send");
}
{
  assert.equal(byId["react-unique"] || 0, 1, "unique contact still proposed once");
  ok("dedupe does not suppress distinct contacts");
}
{
  assert.equal(byId["react-held"] || 0, 0, "held-first duplicate pair → zero proposals");
  ok("when duplicate records disagree, the person is skipped (fail closed), not double-considered");
}
{
  const emails = proposals.map((p) => String(p.contact.email || "").toLowerCase());
  assert.equal(new Set(emails).size, emails.length, "no email appears twice in one plan");
  ok("a single plan never carries two sends to the same inbox");
}

console.log(`\nreactivation dedupe tests passed (${passed} checks).`);
