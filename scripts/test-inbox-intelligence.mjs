// I1 verifier — inbox intelligence foundation (owner decision 2026-07-12: full READ-ONLY,
// roger@legalease.com ONLY; docs/decisions/2026-07-12-inbox-full-read-roger-legalease.md).
// Pins the four walls: capability (plan-only, no send), identity (one mailbox), privacy
// (no bodies persisted, redacted evidence, owner-only visibility), suggestion (sticky
// decisions). Plus Roger's amendments: 30-day backfill that RESUMES if the message cap
// truncates it, then 14-day rolling; internal teammates excluded; investors matched.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INBOX_ENGINE_ID, INBOX_ALLOWED_MAILBOX, INBOX_COLLECTIONS, INBOX_SINGLETON_COLLECTIONS,
  INBOX_BACKFILL_WINDOW_DAYS, INBOX_ROLLING_WINDOW_DAYS,
  inboxConfigOf, classifyInboxThreads, mergeInboxSignals, detectCommitment, impliedDeadline,
  buildPipelineIndex, pipelineMatchFor, buildInboxIntelligenceEngine, planInboxIntelligence,
  recordInboxActivationAudit, prepareInboxDraftReply
} from "./inbox-intelligence.mjs";
import { coreStateCollections, singletonCollections } from "./storage.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(join(here, "preview-server.mjs"), "utf8");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("Inbox intelligence (I1) tests");

const NOW = "2026-07-12T12:00:00.000Z";
const daysAgo = (n) => new Date(Date.parse(NOW) - n * 86400000).toISOString();

function thread(overrides = {}) {
  return {
    threadId: overrides.threadId || "t-1",
    subject: overrides.subject || "Partnership next steps",
    messages: overrides.messages || []
  };
}
const inbound = (over = {}) => ({ id: over.id || "m-in", fromEmail: over.fromEmail || "dana@fultoncounty.org", fromName: over.fromName || "Dana Fulton", isFromMe: false, at: over.at || daysAgo(4), bodyText: over.bodyText || "Following up on the packet.\nCan you confirm timing?" , ...over });
const outbound = (over = {}) => ({ id: over.id || "m-out", fromEmail: INBOX_ALLOWED_MAILBOX, fromName: "Roger", isFromMe: true, at: over.at || daysAgo(5), bodyText: over.bodyText || "Thanks - details attached.", ...over });

const PIPELINE_STATE = {
  outreachContacts: [{ id: "oc-1", email: "dana@fultoncounty.org" }],
  companyContacts: [{ id: "cc-press", email: "press@journal.com" }],
  partners: [], prospectCandidates: [], reactivationContacts: []
};

// ---- 1. registration (the B1 trap) ----------------------------------------------------------
{
  for (const name of INBOX_COLLECTIONS) assert.ok(coreStateCollections.includes(name), name + " registered");
  for (const name of INBOX_SINGLETON_COLLECTIONS) {
    assert.ok(coreStateCollections.includes(name), name + " registered");
    assert.ok(singletonCollections.has(name), name + " is a singleton");
  }
  assert.ok(!singletonCollections.has("inboxSignals"), "inboxSignals is list-shaped");
  ok("collections registered: inboxSignals (list) + inboxConfig (singleton)");
}

// ---- 2. needs_reply ---------------------------------------------------------------------------
{
  const { signals } = classifyInboxThreads([thread({ messages: [outbound({ at: daysAgo(6) }), inbound({ at: daysAgo(4) })] })], { state: PIPELINE_STATE, now: NOW });
  const reply = signals.find((s) => s.kind === "needs_reply");
  assert.ok(reply, "4-day-old inbound produces a needs_reply signal");
  assert.equal(reply.ageDays, 4);
  assert.match(reply.summary, /You owe Dana Fulton a reply - 4 days\./);
  const fresh = classifyInboxThreads([thread({ messages: [inbound({ at: daysAgo(1) })] })], { state: {}, now: NOW }).signals;
  assert.ok(!fresh.some((s) => s.kind === "needs_reply"), "1-day-old inbound is not yet owed (default 2)");
  const bulk = classifyInboxThreads([thread({ messages: [inbound({ fromEmail: "no-reply@stripe.com", fromName: "Stripe", at: daysAgo(5) })] })], { state: {}, now: NOW }).signals;
  assert.ok(!bulk.some((s) => s.kind === "needs_reply"), "bulk senders never become owed replies");
  ok("needs_reply: age threshold, plain sentence, bulk senders excluded");
}

// ---- 3. internal teammates are noise (Roger amendment) ---------------------------------------
{
  const { signals, skippedInternal } = classifyInboxThreads([
    thread({ threadId: "t-int", messages: [inbound({ fromEmail: "lawrence@blackmonlaw.com", fromName: "Lawrence Blackmon", at: daysAgo(5) })] }),
    thread({ threadId: "t-int2", messages: [inbound({ fromEmail: "britton@legalease.com", fromName: "Britton", at: daysAgo(5) })] })
  ], { state: {}, now: NOW });
  assert.equal(signals.length, 0, "no signals from internal teammates");
  assert.equal(skippedInternal, 2);
  ok("internal teammates (Lawrence, Britton, @legalease.com) excluded entirely");
}

// ---- 4. went_quiet (pipeline contacts only) ---------------------------------------------------
{
  const quietThread = thread({ threadId: "t-q", messages: [inbound({ at: daysAgo(8) }), outbound({ at: daysAgo(6) })] });
  const { signals } = classifyInboxThreads([quietThread], { state: PIPELINE_STATE, now: NOW });
  const quiet = signals.find((s) => s.kind === "went_quiet");
  assert.ok(quiet, "pipeline counterpart quiet 6 days after my reply");
  assert.match(quiet.summary, /went quiet after your reply - 6 days\./);
  assert.deepEqual(quiet.pipelineMatch, { collection: "outreachContacts", itemId: "oc-1", matchedBy: "address" });
  const notPipeline = classifyInboxThreads([thread({ threadId: "t-q2", messages: [inbound({ fromEmail: "stranger@random.org", at: daysAgo(8) }), outbound({ at: daysAgo(6) })] })], { state: PIPELINE_STATE, now: NOW }).signals;
  assert.ok(!notPipeline.some((s) => s.kind === "went_quiet"), "non-pipeline silence is not a signal");
  ok("went_quiet: pipeline-only, with the record pointer for deep links");
}

// ---- 5. commitments (conservative) + implied deadlines ----------------------------------------
{
  const c = detectCommitment("Sounds good. I'll send the packet this week.", "2026-07-08T15:00:00.000Z");
  assert.ok(c, "explicit promise with timeframe detected");
  assert.equal(c.dueAt.slice(0, 10), "2026-07-10", "'this week' from a Wednesday lands Friday");
  assert.equal(detectCommitment("I should probably send that at some point.", NOW), null, "fuzzy promises are NOT detected (conservative first)");
  assert.equal(impliedDeadline("tomorrow", "2026-07-08T15:00:00.000Z").slice(0, 10), "2026-07-09");
  assert.equal(impliedDeadline("monday", "2026-07-08T15:00:00.000Z").slice(0, 10), "2026-07-13");
  const { signals } = classifyInboxThreads([thread({ threadId: "t-c", messages: [inbound({ at: daysAgo(6) }), outbound({ at: daysAgo(4), bodyText: "I'll send the packet this week. Talk soon." })] })], { state: PIPELINE_STATE, now: NOW });
  const commitment = signals.find((s) => s.kind === "commitment");
  assert.ok(commitment, "written promise becomes a commitment signal");
  assert.ok(commitment.dueAt, "commitment carries its implied deadline for overdue escalation");
  ok("commitments: explicit-only detection with implied deadlines (dueAt)");
}

// ---- 6. pipeline inbound + investor patterns (Roger amendment) --------------------------------
{
  const { signals } = classifyInboxThreads([thread({ threadId: "t-p", messages: [inbound({ at: daysAgo(1) })] })], { state: PIPELINE_STATE, now: NOW });
  assert.ok(signals.some((s) => s.kind === "pipeline_inbound"), "inbound from a pipeline contact is surfaced");
  const investor = classifyInboxThreads([thread({ threadId: "t-i", messages: [inbound({ fromEmail: "team@techstars.com", fromName: "Techstars", at: daysAgo(1) })] })], { state: {}, now: NOW }).signals;
  const inv = investor.find((s) => s.kind === "pipeline_inbound");
  assert.ok(inv, "investor pattern (Techstars) counts as pipeline");
  assert.equal(inv.pipelineMatch.matchedBy, "investor_pattern");
  const index = buildPipelineIndex({ companyContacts: [{ id: "x", email: "reporter@nyt.com" }] }, inboxConfigOf());
  assert.ok(pipelineMatchFor("reporter@nyt.com", "", index), "press contacts in companyContacts match");
  assert.ok(pipelineMatchFor("someone@slauson.co", "Slauson & Co.", index), "Slauson matches by pattern");
  ok("pipeline inbound: contacts, press in companyContacts, and the named investors");
}

// ---- 7. privacy: no bodies persisted, evidence redacted, subject redacted ---------------------
{
  const body = "Call me at 601-555-1234 or jane.doe@example.com.\nMy name is Jane Doe and my case number: ABC-12345 matters.";
  const { signals } = classifyInboxThreads([thread({ threadId: "t-priv", subject: "Reach me at jane.doe@example.com", messages: [inbound({ at: daysAgo(3), bodyText: body })] })], { state: {}, now: NOW });
  const signal = signals.find((s) => s.kind === "needs_reply");
  assert.ok(signal, "signal produced");
  for (const forbidden of ["bodyText", "body", "raw", "payload", "snippet"]) {
    assert.ok(!(forbidden in signal), "signal must not carry a '" + forbidden + "' field");
  }
  const evidenceText = (signal.evidence || []).join(" ");
  assert.ok(!evidenceText.includes("601-555-1234") && !evidenceText.includes("jane.doe@example.com"), "PII redacted from evidence");
  assert.ok(evidenceText.includes("[redacted-"), "redaction markers present");
  assert.ok(!signal.subject.includes("jane.doe@example.com"), "subject line is redacted too");
  assert.ok((signal.evidence || []).length <= 3 && (signal.evidence || []).every((line) => line.length <= 240), "evidence caps hold");
  assert.equal(signal.pii_redacted, true);
  assert.equal(signal.ownerOnly, true);
  ok("privacy: no body fields persisted; evidence + subject redacted; caps hold");
}

// ---- 8. merge: decisions sticky, moved threads retire -----------------------------------------
{
  const scan1 = classifyInboxThreads([thread({ messages: [inbound({ at: daysAgo(4) })] })], { state: PIPELINE_STATE, now: NOW }).signals;
  const dismissed = mergeInboxSignals([], scan1, { now: NOW }).map((s) => s.id === scan1[0].id ? { ...s, status: "dismissed" } : s);
  const rescan = mergeInboxSignals(dismissed, scan1, { now: NOW });
  assert.equal(rescan.find((s) => s.id === scan1[0].id).status, "dismissed", "a dismissed signal never resurrects");
  const retired = mergeInboxSignals(mergeInboxSignals([], scan1, { now: NOW }), [], { now: NOW });
  assert.equal(retired.find((s) => s.id === scan1[0].id).status, "resolved", "a thread that moved retires its open signal");
  ok("merge: Roger's dismissals stick; answered threads retire honestly");
}

// ---- 9. engine walls: plan-only, toggle-gated read, identity wall, backfill resume ------------
{
  const engine = buildInboxIntelligenceEngine({ fetchInboxThreads: async () => ({ ok: true }), inboxReadEnabled: () => true });
  assert.equal(engine.act, undefined, "NO act() method: the heartbeat structurally cannot run side effects");
  assert.equal(engine.cadence, "daily");
  assert.equal(engine.id, INBOX_ENGINE_ID);

  let fetchCalls = 0;
  const spyOff = await planInboxIntelligence({}, { fetchInboxThreads: async () => { fetchCalls += 1; return { ok: true, mailbox: INBOX_ALLOWED_MAILBOX, threads: [] }; }, inboxReadEnabled: () => false, now: NOW });
  assert.equal(fetchCalls, 0, "toggle OFF means NO fetch happens at all");
  assert.equal(spyOff.observations[0].status, "off");

  const wrongMailbox = await planInboxIntelligence({}, { fetchInboxThreads: async () => ({ ok: true, mailbox: "other@gmail.com", threads: [thread({ messages: [inbound({ at: daysAgo(4) })] })] }), inboxReadEnabled: () => true, now: NOW });
  assert.equal(wrongMailbox.observations[0].status, "blocked", "identity wall: wrong mailbox echo refused");
  assert.ok(!(wrongMailbox.state.inboxSignals || []).length, "no signals from an unauthorized mailbox");

  // Backfill: first scan asks for 30 days; a TRUNCATED backfill does not complete, so the
  // next scan asks for 30 days again (Roger amendment: day-one loops must not age out).
  const windows = [];
  const truncatingFetcher = async ({ windowDays }) => { windows.push(windowDays); return { ok: true, mailbox: INBOX_ALLOWED_MAILBOX, threads: [], scannedCount: 500, truncated: windows.length === 1 }; };
  let state = {};
  state = (await planInboxIntelligence(state, { fetchInboxThreads: truncatingFetcher, inboxReadEnabled: () => true, now: NOW })).state;
  assert.equal(windows[0], INBOX_BACKFILL_WINDOW_DAYS, "first scan = 30-day backfill");
  assert.equal(inboxConfigOf(state).backfillCompletedAt, "", "truncated backfill is NOT marked complete");
  state = (await planInboxIntelligence(state, { fetchInboxThreads: truncatingFetcher, inboxReadEnabled: () => true, now: NOW })).state;
  assert.equal(windows[1], INBOX_BACKFILL_WINDOW_DAYS, "capped backfill RESUMES at 30 days");
  assert.ok(inboxConfigOf(state).backfillCompletedAt, "untruncated scan completes the backfill");
  state = (await planInboxIntelligence(state, { fetchInboxThreads: truncatingFetcher, inboxReadEnabled: () => true, now: NOW })).state;
  assert.equal(windows[2], INBOX_ROLLING_WINDOW_DAYS, "after backfill: 14-day rolling window");
  ok("engine: plan-only, toggle gates reading, identity wall holds, backfill resumes then rolls");
}

// ---- 10. activation audit (once, ever) ---------------------------------------------------------
{
  let state = { auditHistory: [], companyEvents: [] };
  state = recordInboxActivationAudit(state, { actor: "owner", now: NOW });
  const row = (state.auditHistory || [])[0];
  assert.ok(row && row.action === "inbox full-read decision recorded", "auditHistory row written");
  assert.equal(row.resourceId, "docs/decisions/2026-07-12-inbox-full-read-roger-legalease.md");
  assert.ok((state.companyEvents || []).some((e) => e.type === "inbox_full_read_activated"), "company event emitted");
  const again = recordInboxActivationAudit(state, { actor: "owner", now: NOW });
  assert.equal(again, state, "second activation is a no-op (once, ever)");
  ok("activation audit: auditHistory + company event, exactly once");
}

// ---- 11. server wiring (structural) ------------------------------------------------------------
{
  assert.ok(serverSource.includes('const OWNER_ONLY_COLLECTIONS = ["inboxSignals", "inboxConfig", "leeThreads", "leeMessages", "leeRuns", "leeMemory"]'), "owner-only collections declared (inbox + Le-E conversation memory)");
  assert.ok(serverSource.includes("stripOwnerOnlyCollections(fullState, accessDecision.actor)"), "/api/state strips for non-owners");
  assert.ok(serverSource.includes("stripOwnerOnlyCollections(buildCompactBootState"), "/api/boot-state strips for non-owners");
  const fetcher = serverSource.slice(serverSource.indexOf("async function fetchInboxThreadsForIntelligence"), serverSource.indexOf("async function fetchGmailReadOnlyEvents"));
  assert.ok(fetcher.includes("boundMailbox !== INBOX_ALLOWED_MAILBOX"), "fetcher enforces the one-mailbox identity wall");
  assert.ok(fetcher.indexOf("mailbox_not_authorized") < fetcher.indexOf("googleStoredOrEnvAccessToken"), "identity check happens BEFORE any token use");
  assert.ok(fetcher.includes("nextPageToken"), "fetcher paginates (backfill can walk past one page)");
  assert.ok(!serverSource.includes("gmail.send") && !serverSource.includes("gmail.modify") && !serverSource.includes("gmail.compose"), "no send/modify/compose capability anywhere");
  const scanRoute = serverSource.slice(serverSource.indexOf('url.pathname === "/api/inbox/scan"'), serverSource.indexOf('url.pathname === "/api/inbox/scan"') + 2200);
  assert.ok(scanRoute.includes("autopilotEnabled(currentState, INBOX_ENGINE_ID"), "manual scan refused while the toggle is off");
  assert.ok(serverSource.includes("recordInboxActivationAudit(nextState"), "toggle flip writes the activation audit");
  assert.ok(serverSource.includes("fetchInboxThreads: fetchInboxThreadsForIntelligence"), "fetcher injected into the heartbeat registry");
  const enginesSource = readFileSync(join(here, "heartbeat-engines.mjs"), "utf8");
  assert.ok(enginesSource.indexOf("buildInboxIntelligenceEngine") < enginesSource.indexOf("buildCompanyMemoryEngine()"), "inbox engine registers before the company-memory projector (same-tick projection)");
  ok("server wiring: owner-only projection, identity-first fetcher, gated scan route, audit on flip");
}

// ---- 12. I2: queue projection ------------------------------------------------------------------
{
  const { projectCompanyMemory } = await import("./company-memory-projector.mjs");
  const { QUEUE_ITEM_TYPES } = await import("./company-memory.mjs");
  for (const type of ["inbox_reply", "inbox_commitment", "inbox_pipeline"]) {
    assert.ok(QUEUE_ITEM_TYPES.includes(type), type + " is a registered queue type");
  }
  const scan = classifyInboxThreads([
    thread({ threadId: "t-owe", messages: [inbound({ at: daysAgo(4) })] }),
    thread({ threadId: "t-prom", messages: [inbound({ at: daysAgo(6) }), outbound({ at: daysAgo(4), bodyText: "I'll send the packet this week." })] })
  ], { state: PIPELINE_STATE, now: NOW }).signals;
  const projected = projectCompanyMemory({ ...PIPELINE_STATE, inboxSignals: mergeInboxSignals([], scan, { now: NOW }) }, { now: () => NOW }).state;
  const inboxItems = projected.queueItems.filter((i) => i.sourceEngine === "inbox-intelligence");
  assert.ok(inboxItems.length >= 2, "signals project into the queue");
  const owed = inboxItems.find((i) => i.type === "inbox_reply");
  assert.equal(owed.status, "needs_roger", "reply-owed lands in the morning queue");
  assert.match(owed.title, /You owe .* a reply - 4 days\./, "title is the plain sentence");
  assert.deepEqual(owed.sourceRef.collection, "inboxSignals", "Open deep-links to the signal artifact");
  const commitment = inboxItems.find((i) => i.type === "inbox_commitment");
  assert.ok(commitment && commitment.dueAt, "commitment queue item carries dueAt (alerts overdue path applies)");
  // A resolved signal projects as completed — reality reconciled, never resurrected as work.
  const resolvedState = { ...PIPELINE_STATE, inboxSignals: mergeInboxSignals(mergeInboxSignals([], scan, { now: NOW }), [], { now: NOW }) };
  const reprojected = projectCompanyMemory({ ...resolvedState, queueItems: projected.queueItems }, { now: () => NOW }).state;
  const retired = reprojected.queueItems.find((i) => i.id === owed.id);
  assert.equal(retired.status, "completed", "a moved thread retires its queue card honestly");
  ok("I2: signals project as needs_roger sentences with deep links; moved threads retire");
}

// ---- 13. I3: drafts — skeleton default, UPL refusal, never sends -------------------------------
{
  const signal = { id: "sig-1", kind: "needs_reply", counterpartName: "Dana Fulton", counterpartEmail: "dana@fultoncounty.org", subject: "Packet timing", uplSensitive: false };
  const prepared = prepareInboxDraftReply(signal, { now: NOW });
  assert.ok(prepared.ok, "non-UPL signal gets a draft");
  assert.match(prepared.draft.body, /Hi Dana - thanks for your note about "Packet timing"\./, "skeleton opens in Roger's voice pattern");
  assert.ok(prepared.draft.body.includes("[Add the specific answer here.]"), "bracketed slot: Roger fills it, AI never defaults");
  assert.equal(prepared.draft.internalOnly, true);
  assert.equal(prepared.draft.aiAssisted, false, "assist is never applied by default");
  assert.ok(!("send" in prepared.draft) && !("to" in prepared.draft), "draft carries no send fields");
  const upl = prepareInboxDraftReply({ ...signal, uplSensitive: true }, { now: NOW });
  assert.equal(upl.ok, false, "UPL-sensitive: NO draft is prepared");
  assert.equal(upl.flagLawrence, true, "Lawrence is flagged");
  assert.match(upl.error, /reply personally/, "refusal tells Roger to reply personally");
  const quiet = prepareInboxDraftReply({ ...signal, kind: "went_quiet" }, { now: NOW });
  assert.match(quiet.draft.body, /float this back to the top/, "went-quiet gets a nudge skeleton");
  const commitment = prepareInboxDraftReply({ ...signal, kind: "commitment" }, { now: NOW });
  assert.match(commitment.draft.body, /following through on what I promised/, "commitment gets a delivery skeleton");
  // Server walls: draft routes exist, no send route exists, assist is explicit.
  for (const route of ['"/api/inbox/signals/draft"', '"/api/inbox/drafts/update"', '"/api/inbox/drafts/assist"']) {
    assert.ok(serverSource.includes('url.pathname === ' + route), route + " route exists");
  }
  for (const forbidden of ["/api/inbox/send", "/api/email/send", "gmail.users.messages.send", "users/me/messages/send"]) {
    assert.ok(!serverSource.includes(forbidden), "no send route: " + forbidden);
  }
  assert.ok(serverSource.includes("lawrenceFlaggedAt: now"), "UPL refusal records the Lawrence flag on the signal");
  assert.ok(serverSource.includes('copyInboxDraft'), "clipboard copy is the only exit for a draft");
  ok("I3: skeleton drafts + UPL refusal with Lawrence flag; no send path anywhere");
}

// ---- 14. I4: pipeline record suggestions — pending-only, evidence-quoted ------------------------
{
  const { buildInboxRecordSuggestions } = await import("./inbox-intelligence.mjs");
  const partnerSignal = {
    id: "sig-partner", kind: "pipeline_inbound", status: "suggested",
    counterpartName: "Riverside Legal Aid", counterpartEmail: "maria@riverside.org",
    pipelineMatch: { collection: "partners", itemId: "partner-9" },
    occurredAt: NOW, evidence: ["We would like to move forward with the pilot."]
  };
  const contactSignal = {
    id: "sig-contact", kind: "pipeline_inbound", status: "suggested",
    counterpartName: "Techstars", counterpartEmail: "team@techstars.com",
    pipelineMatch: { collection: "", itemId: "", matchedBy: "investor_pattern" },
    occurredAt: NOW, evidence: ["Can you share your latest numbers?"]
  };
  const suggestions = buildInboxRecordSuggestions({}, [partnerSignal, contactSignal], { now: NOW });
  assert.equal(suggestions.length, 2);
  const partner = suggestions.find((s) => s.suggestionType === "update_partner_status");
  assert.equal(partner.relatedEntityId, "partner-9", "partner suggestion targets the matched record");
  assert.match(partner.summary, /We would like to move forward/, "evidence is quoted");
  assert.equal(partner.status, "pending", "engine writes PENDING only");
  assert.ok(!("appliedAt" in partner), "engine never writes applied state");
  const task = suggestions.find((s) => s.suggestionType === "mark_follow_up_due");
  assert.ok(task && task.proposedChanges.dueDate, "non-partner matches propose a follow-up task with a due date");
  // Dedupe: an existing suggestion for the same signal is never duplicated.
  const again = buildInboxRecordSuggestions({ automationSuggestions: suggestions }, [partnerSignal, contactSignal], { now: NOW });
  assert.equal(again.length, 0, "re-scans never duplicate suggestions");
  // Only the human endpoint applies: the engine module must not contain apply/approve logic.
  const moduleSource = readFileSync(join(here, "inbox-intelligence.mjs"), "utf8");
  assert.ok(!moduleSource.includes("applyAutomationSuggestionToState") && !moduleSource.includes('status: "applied"'), "engine is locked out of applying suggestions");
  ok("I4: pipeline inbounds propose pending, evidence-quoted updates; approval is human-only");
}

console.log("\ntest-inbox-intelligence: all " + passed + " checks passed.");
