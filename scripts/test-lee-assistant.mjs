import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LEE_BANNED_PHRASE_PATTERNS,
  buildLeeModelCaller,
  buildLeeStateDigest,
  buildLeeStatus,
  buildLeeSuggestions,
  leeRecallNotes,
  leeVoiceViolations,
  migrateLegacyLeeProposals,
  parseLeeReply,
  runLeeAssistant,
  scrubPii
} from "./lee-assistant.mjs";

const now = "2026-07-12T10:00:00.000Z";

const state = {
  tasks: [
    { id: "task-1", title: "Send Goodwill campaign report", owner: "Roger", status: "open", dueDate: "2026-07-08" },
    { id: "task-2", title: "Confirm Fulton kickoff agenda", owner: "Roger", status: "open", dueDate: "2026-07-20" },
    { id: "task-3", title: "Old finished thing", owner: "Roger", status: "done", dueDate: "2026-07-01" }
  ],
  partners: [
    { id: "partner-saad", name: "Saad Rahman", stage: "proposal_sent", nextAction: "Wait for reply", updatedAt: "2026-07-10T00:00:00Z" },
    { id: "partner-fulton", name: "Fulton County", stage: "active", nextAction: "Kickoff", updatedAt: "2026-07-01T00:00:00Z" }
  ],
  growthInbox: [{ id: "gi-1", summary: "Contact celia@example.com called +1 (555) 123-4567 about RCAP", status: "new" }],
  automationSuggestions: [],
  activityEvents: [{ id: "ev-1", title: "Wave 2 released", createdAt: "2026-07-10T00:00:00Z" }],
  leeThreads: [{ id: "lee-main-thread", title: "Le-E conversation", createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z" }],
  leeMessages: [
    { id: "m1", threadId: "lee-main-thread", role: "user", content: "Celia from Harris County wants a pilot demo in August.", createdAt: "2026-07-06T09:00:00Z" },
    { id: "m2", threadId: "lee-main-thread", role: "assistant", content: "Noted: Celia from Harris County, pilot demo in August.", createdAt: "2026-07-06T09:00:05Z" }
  ],
  runtime: { livePostingGates: { linkedin: { enabled: false } } }
};

// ---- voice gate parity with the social guidelines ----------------------------------------------
{
  const server = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");
  const gateBlock = server.slice(server.indexOf("GUIDELINES_AI_PHRASE_PATTERNS = ["), server.indexOf("GUIDELINES_OUTCOME_PROMISE_PATTERNS"));
  const gatePatterns = [...gateBlock.matchAll(/pattern: (\/.*?\/i)/g)].map((match) => match[1]);
  assert.ok(gatePatterns.length >= 8, "should extract the social guidelines AI-phrase patterns from the gate source");
  const assistantSource = readFileSync(new URL("./lee-assistant.mjs", import.meta.url), "utf8");
  for (const pattern of gatePatterns) {
    assert.ok(assistantSource.includes(pattern), `Le-E banned list must include the social guidelines pattern ${pattern}`);
  }
  assert.ok(LEE_BANNED_PHRASE_PATTERNS.length >= gatePatterns.length, "Le-E list covers every gate phrase");
}

{
  assert.deepEqual(leeVoiceViolations("The pipeline looks steady and Fulton is on track."), []);
  assert.ok(leeVoiceViolations("This will unlock growth").length, "banned phrase detected");
  assert.ok(leeVoiceViolations("Great week — really strong").includes("em-dash"), "em-dash detected");
  assert.ok(leeVoiceViolations("You are eligible for expungement").length, "eligibility promise detected");
  assert.ok(leeVoiceViolations("helping felons find work").length, "person-first violation detected");
}

// ---- digest: grounded, capped, PII-scrubbed ------------------------------------------------------
{
  const digest = buildLeeStateDigest(state, { now });
  assert.ok(digest.includes("Send Goodwill campaign report"), "digest lists open tasks");
  assert.ok(digest.includes("Past due (slipped):"), "digest calls out slipped work");
  assert.ok(digest.includes("Saad Rahman"), "digest lists partners");
  assert.ok(!digest.includes("celia@example.com"), "emails scrubbed from digest");
  assert.ok(!digest.includes("555"), "phone numbers scrubbed from digest");
  assert.ok(digest.includes("[email]"), "email placeholder present");
  const small = buildLeeStateDigest(state, { now, maxChars: 200 });
  assert.ok(small.length <= 240 && small.includes("truncated"), "digest hard-caps at maxChars");
  assert.equal(scrubPii("mail roger@x.co now"), "mail [email] now");
}

// ---- cross-session recall ------------------------------------------------------------------------
{
  const notes = leeRecallNotes(state, "what did I tell you about Celia?");
  assert.ok(notes.length >= 1 && notes[0].includes("Celia"), "keyword recall finds older Celia mention");
  assert.deepEqual(leeRecallNotes(state, "ok"), [], "short tokens do not trigger recall");
}

// ---- suggestion line protocol ---------------------------------------------------------------------
{
  const parsed = parseLeeReply('Queued it for your approval.\n[[suggestion]]{"kind":"partner_update","who":"Saad","note":"Wants 500, reconnect end of July","due":"2026-07-31"}');
  assert.equal(parsed.answer, "Queued it for your approval.");
  assert.equal(parsed.drafts.length, 1);
  const broken = parseLeeReply("Fine.\n[[suggestion]]{not json}");
  assert.equal(broken.drafts.length, 0, "malformed suggestion lines are dropped");
  assert.equal(broken.answer, "Fine.");
}

{
  const suggestions = buildLeeSuggestions(state, [
    { kind: "partner_update", who: "Saad", note: "Wants 500, reconnect end of July", due: "2026-07-31" },
    { kind: "task", who: "Latrista", note: "Met Tuesday", due: "" }
  ], { userMessage: "met Saad, wants 500, reconnect end of July", messageId: "msg-1", now });
  assert.equal(suggestions.length, 2);
  const partnerUpdate = suggestions[0];
  assert.equal(partnerUpdate.suggestionType, "update_partner_status", "partner name resolves to a real partner record update");
  assert.equal(partnerUpdate.relatedEntityId, "partner-saad");
  assert.equal(partnerUpdate.status, "pending", "suggestions are pending-only");
  assert.ok(partnerUpdate.proposedChanges.nextAction.includes("2026-07-31"));
  assert.ok(partnerUpdate.evidence[0].includes("met Saad"), "evidence quotes Roger's words");
  const task = suggestions[1];
  assert.equal(task.suggestionType, "mark_follow_up_due", "unknown names become follow-up tasks");
  assert.ok(task.proposedChanges.title.includes("Latrista"));
  assert.ok(suggestions.every((item) => item.status === "pending"), "engine writes pending ONLY");
}

// The assistant module must contain no apply logic: approval stays with the one approve endpoint.
{
  const source = readFileSync(new URL("./lee-assistant.mjs", import.meta.url), "utf8");
  assert.ok(!/applyAutomationSuggestion|writeCollections|store\.|"applied"/.test(source), "lee-assistant must not apply suggestions or write state");
  assert.ok(!/status:\s*"applied"/.test(source), "no applied status anywhere in the module");
}

// ---- legacy lane migration --------------------------------------------------------------------------
{
  const legacyState = {
    ...state,
    leeActionProposals: [
      { id: "old-1", title: "Create partner follow-up", summary: "From the old lane", status: "proposed", actionType: "create_task" },
      { id: "old-2", title: "Blocked thing", summary: "Was blocked", status: "blocked", actionType: "send_email" },
      { id: "old-3", title: "Already applied", status: "applied" }
    ]
  };
  const migration = migrateLegacyLeeProposals(legacyState, { now });
  assert.equal(migration.migratedCount, 2, "only unresolved proposals migrate");
  assert.equal(migration.suggestions.length, 2);
  assert.ok(migration.suggestions.every((item) => item.status === "pending"), "migrated items are pending suggestions");
  assert.ok(migration.suggestions[0].id.startsWith("auto-suggest-lee-legacy-"));
  const migrated = migration.state.leeActionProposals.find((item) => item.id === "old-1");
  assert.equal(migrated.status, "migrated");
  assert.equal(migration.state.leeActionProposals.find((item) => item.id === "old-3").status, "applied", "resolved proposals untouched");
  // Idempotent: running again over a state that already has the migrated suggestions adds nothing.
  const again = migrateLegacyLeeProposals({ ...migration.state, automationSuggestions: migration.suggestions }, { now });
  assert.equal(again.suggestions.length, 0, "second migration pass adds no duplicates");
  const none = migrateLegacyLeeProposals(state, { now });
  assert.equal(none.changed, false);
}

// ---- the assistant end to end (fake model) -----------------------------------------------------------
{
  // Acceptance shape 1: a status question answered from the digest, plain sentences.
  const calls = [];
  const callModel = async ({ system, messages }) => {
    calls.push({ system, messages });
    return { ok: true, text: "Two things slipped: the Goodwill campaign report was due July 8 and is still open, and nothing else is past due." };
  };
  const result = await runLeeAssistant(state, { message: "what slipped this week?" }, { now, callModel });
  assert.equal(result.assistantMessage.role, "assistant");
  assert.ok(result.assistantMessage.content.includes("Goodwill"));
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.run.mode, "model");
  const context = calls[0].messages[0].content;
  assert.ok(context.includes("STATE DIGEST"), "model gets the state digest");
  assert.ok(context.includes("Past due (slipped):"), "digest includes slipped work");
  assert.ok(!context.includes("celia@example.com"), "no raw PII reaches the model");
  assert.ok(calls[0].system.includes("You cannot act"), "system prompt forbids acting");
}

{
  // Acceptance shape 2: "log that..." produces a pending suggestion in the I4 lane.
  const callModel = async () => ({ ok: true, text: 'Queued: you met with Latrista on Tuesday.\n[[suggestion]]{"kind":"task","who":"Latrista","note":"Roger met with Latrista on Tuesday.","due":""}' });
  const result = await runLeeAssistant(state, { message: "log that I met with Latrista Tuesday" }, { now, callModel });
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].status, "pending");
  assert.ok(result.suggestions[0].title.includes("Latrista"));
  assert.deepEqual(result.assistantMessage.suggestionIds, [result.suggestions[0].id]);
  assert.ok(!result.assistantMessage.content.includes("[[suggestion]]"), "suggestion line stripped from the visible reply");
}

{
  // Voice enforcement: banned reply retried once; two failures are withheld, never shown.
  let attempts = 0;
  const callModel = async () => {
    attempts += 1;
    return { ok: true, text: attempts === 1 ? "This will unlock a new landscape for us." : "Steady week. Fulton is on track and nothing new is blocked." };
  };
  const result = await runLeeAssistant(state, { message: "how are we doing?" }, { now, callModel });
  assert.equal(attempts, 2, "voice violation triggers exactly one retry");
  assert.ok(result.assistantMessage.content.includes("Steady week"));
  assert.equal(result.run.voiceRetried, true);

  const alwaysBanned = async () => ({ ok: true, text: "Unlock the journey!" });
  const blocked = await runLeeAssistant(state, { message: "how are we doing?" }, { now, callModel: alwaysBanned });
  assert.equal(blocked.run.mode, "voice_blocked");
  assert.ok(blocked.assistantMessage.content.includes("broke the voice rules"), "non-compliant answer is withheld");
  assert.deepEqual(leeVoiceViolations(blocked.assistantMessage.content), [], "the withheld notice itself is compliant");
}

{
  // Honest no-key fallback: no model call means no fabricated answer.
  const result = await runLeeAssistant(state, { message: "what slipped this week?" }, { now });
  assert.equal(result.run.mode, "no_model_key");
  assert.ok(result.assistantMessage.content.includes("no model key is configured"));
  assert.equal(result.suggestions.length, 0);
  const failed = await runLeeAssistant(state, { message: "hi" }, { now, callModel: async () => ({ ok: false, error: "status 500" }) });
  assert.equal(failed.run.mode, "model_error");
  assert.ok(failed.assistantMessage.content.includes("couldn't reach the model"));
}

// ---- model caller wiring -------------------------------------------------------------------------------
{
  assert.equal(buildLeeModelCaller({}), null, "no key means no caller (honest fallback path)");
  assert.equal(buildLeeModelCaller({ ANTHROPIC_API_KEY: "k" }), null, "Le-E is OpenAI-backed; an Anthropic key alone configures nothing");

  // The real call: OpenAI Responses API, Le-E's own model default (never the drafts model).
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), auth: options.headers.authorization });
    return { ok: true, json: async () => ({ output_text: "hello from openai" }) };
  };
  const caller = buildLeeModelCaller({ OPENAI_API_KEY: "k", OPENAI_DRAFT_MODEL: "drafts-model-must-not-leak" }, fetcher);
  assert.equal(caller.provider, "openai");
  assert.equal(caller.model, "gpt-5.6-terra", "default is the current balanced GPT-5.6 tier");
  const result = await caller({ system: "s", messages: [{ role: "user", content: "hi" }] });
  assert.equal(result.ok, true);
  assert.equal(result.text, "hello from openai");
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].body.model, "gpt-5.6-terra", "OPENAI_DRAFT_MODEL must not override Le-E's model");
  assert.equal(calls[0].auth, "Bearer k");

  // Dedicated override, so the model can be bumped on Render without a deploy.
  const overridden = buildLeeModelCaller({ OPENAI_API_KEY: "k", LEE_OPENAI_MODEL: "gpt-5.6-sol" }, fetcher);
  assert.equal(overridden.model, "gpt-5.6-sol");
}

// ---- status ---------------------------------------------------------------------------------------------
{
  const status = buildLeeStatus({ ...state, leeActionProposals: [{ id: "x", status: "proposed" }] }, { modelConfigured: true, provider: "openai" });
  assert.equal(status.safeModeActive, true);
  assert.equal(status.liveGatesCount, 0);
  assert.equal(status.legacyProposalsUnresolved, 1);
  assert.equal(status.modelConfigured, true);
}

console.log("Le-E assistant tests passed");
