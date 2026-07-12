// Le-E assistant v2 — one plain conversation, a real model behind it, propose-only.
//
// Replaces the retired lee-engine.mjs (regex keyword templates over state). This module is
// pure and injectable: the model call arrives via ctx.callModel so tests never touch the
// network. Hard rules, enforced here rather than trusted to the prompt:
//   - Answers are grounded in a capped, PII-scrubbed state digest (buildLeeStateDigest).
//   - Voice follows the social guidelines banned-phrase list (leeVoiceViolations); a reply
//     that still violates after one retry is withheld, never shown.
//   - Le-E never acts. "Log that I met X" becomes a PENDING automationSuggestion routed
//     through the existing I4 approve-then-apply flow. There is no direct-write path here.
//   - The legacy leeActionProposals lane migrates one-way into automationSuggestions
//     (migrateLegacyLeeProposals); unresolved items surface in the Automation Inbox.

const list = (value) => Array.isArray(value) ? value : [];
const text = (value = "") => String(value ?? "").trim();
const lower = (value = "") => text(value).toLowerCase();
const uid = (prefix = "lee") => `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 10) || Math.random().toString(36).slice(2, 12)}`;

export const LEE_DEFAULT_THREAD_ID = "lee-main-thread";

// ---- voice: the social guidelines banned-phrase list ------------------------------------------
// Mirrors GUIDELINES_AI_PHRASE_PATTERNS + the em-dash, outcome-promise, and person-first rules in
// preview-server.mjs (docs/legalease-social-media-guidelines.md sections 2 and 3). The Le-E test
// cross-checks this list against the gate source so the two cannot drift apart silently.
export const LEE_BANNED_PHRASE_PATTERNS = [
  { pattern: /excited to announce/i, label: '"excited to announce"' },
  { pattern: /thrilled to share/i, label: '"thrilled to share"' },
  { pattern: /\bgame.chang/i, label: '"game-changer"' },
  { pattern: /\brevolutioni[sz]/i, label: '"revolutionize"' },
  { pattern: /\bunlock/i, label: '"unlock"' },
  { pattern: /\bempower/i, label: '"empower"' },
  { pattern: /\bdelv(e|es|ed|ing)\b/i, label: '"delve"' },
  { pattern: /\blandscapes?\b/i, label: '"landscape"' },
  { pattern: /\bjourneys?\b/i, label: '"journey"' },
  { pattern: /we('| a)re just getting started/i, label: '"we\'re just getting started"' }
];

const LEE_OUTCOME_PROMISE_PATTERNS = [
  { pattern: /(?<!no )(?<!not )(?<!cannot )(?<!can't )(?<!never )guarantee[ds]?\b/i, label: "guarantee language" },
  { pattern: /\bwill (clear|erase|wipe|expunge|seal)\b/i, label: "promised record outcome" },
  { pattern: /\byou (qualify|are eligible|'re eligible)\b/i, label: "eligibility promise" },
  { pattern: /\bthe court will approve\b/i, label: "court outcome promise" }
];

const LEE_DIGNITY_PATTERNS = [
  { pattern: /\bex[- ]?cons?\b/i, label: '"ex-con"' },
  { pattern: /\bex[- ]?offenders?\b/i, label: '"ex-offender"' },
  { pattern: /\bfelons?\b/i, label: '"felon"' },
  { pattern: /\bconvicts\b|\ba convict\b/i, label: '"convict" as a noun' },
  { pattern: /\bcriminals\b/i, label: '"criminals" as a label' }
];

export function leeVoiceViolations(value = "") {
  const body = String(value || "");
  const found = [];
  if (/—/.test(body)) found.push("em-dash");
  for (const { pattern, label } of [...LEE_BANNED_PHRASE_PATTERNS, ...LEE_OUTCOME_PROMISE_PATTERNS, ...LEE_DIGNITY_PATTERNS]) {
    if (pattern.test(body)) found.push(label);
  }
  return [...new Set(found)];
}

// ---- PII scrub for anything leaving the server toward a model ----------------------------------
export function scrubPii(value = "") {
  return String(value || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(\+?\d[\d ().-]{8,}\d)/g, "[phone]");
}

// ---- state digest -------------------------------------------------------------------------------
// A compact plain-text picture of the company, built fresh per message. Hard-capped so the chat
// request stays small no matter how big prod state grows (the old endpoint echoed 7.6 MB). The
// caller passes state that already respects visibility rules (owner-only strip applied upstream).
function openTasks(state = {}) {
  return list(state.tasks).filter((task) => !["done", "dismissed", "archived"].includes(lower(task.status)));
}

function digestLine(parts = []) {
  return parts.filter(Boolean).join(" · ");
}

export function buildLeeStateDigest(state = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const maxChars = options.maxChars || 7000;
  const today = now.slice(0, 10);
  const weekAgo = new Date(Date.parse(now) - 7 * 86400000).toISOString();
  const lines = [];
  const section = (title) => lines.push("", `## ${title}`);

  lines.push(`Today is ${today}.`);

  const tasks = openTasks(state);
  const slipped = tasks.filter((task) => task.dueDate && String(task.dueDate).slice(0, 10) < today);
  section(`Open tasks (${tasks.length} open, ${slipped.length} past due)`);
  for (const task of tasks.slice(0, 8)) {
    lines.push(digestLine([`- ${task.title}`, task.owner && `owner ${task.owner}`, task.dueDate && `due ${String(task.dueDate).slice(0, 10)}`, task.status]));
  }
  if (slipped.length) {
    lines.push("Past due (slipped):");
    for (const task of slipped.slice(0, 8)) lines.push(`- ${task.title} (was due ${String(task.dueDate).slice(0, 10)})`);
  }

  const blockers = list(state.blockers);
  if (blockers.length) {
    section(`Blockers (${blockers.length})`);
    for (const item of blockers.slice(0, 5)) lines.push(`- ${item.title || item.whatIsBlocked || "Blocked work"}: ${item.whyBlocked || item.reason || ""}`.trim());
  }

  const approvals = list(state.approvalQueue).filter((item) => !["approved", "archived", "ignored"].includes(lower(item.status)));
  const pendingSuggestions = list(state.automationSuggestions).filter((item) => ["pending", "edited"].includes(lower(item.status)));
  section("Waiting on Roger");
  lines.push(`- ${approvals.length} item(s) in the approval queue.`);
  lines.push(`- ${pendingSuggestions.length} pending record-update suggestion(s) in the Automation Inbox.`);
  for (const item of pendingSuggestions.slice(0, 5)) lines.push(`  - ${item.title}`);

  const partners = list(state.partners);
  if (partners.length) {
    section(`Partners (${partners.length} total)`);
    const recent = partners.slice().sort((a, b) => String(b.updatedAt || b.lastTouchDate || "").localeCompare(String(a.updatedAt || a.lastTouchDate || ""))).slice(0, 8);
    for (const partner of recent) {
      lines.push(digestLine([`- ${partner.name || partner.id}`, partner.stage && `stage ${partner.stage}`, partner.nextAction && `next: ${partner.nextAction}`]));
    }
  }
  const programs = list(state.partnerPrograms);
  if (programs.length) {
    section(`Partner programs (${programs.length})`);
    for (const program of programs.slice(0, 6)) lines.push(digestLine([`- ${program.name || program.id}`, program.status, program.nextAction && `next: ${program.nextAction}`]));
  }

  const inbox = list(state.growthInbox).filter((item) => !["converted", "ignored"].includes(lower(item.status)));
  if (inbox.length) {
    section(`Growth inbox (${inbox.length} open)`);
    for (const item of inbox.slice(0, 5)) lines.push(`- ${item.summary || item.rawText || "signal"}`);
  }

  const campaign = state.reactivationCampaign && typeof state.reactivationCampaign === "object" ? state.reactivationCampaign : null;
  if (campaign) {
    section("Reactivation campaign");
    lines.push(digestLine([
      campaign.status && `status ${campaign.status}`,
      `live mode ${campaign.liveMode ? "ON" : "off"}`,
      campaign.pausedAt && `paused ${String(campaign.pausedAt).slice(0, 10)}`
    ]) || "- configured");
    lines.push(`- ${list(state.reactivationContacts).length} contact(s) on file, ${list(state.reactivationEvents).length} campaign event(s) recorded.`);
  }
  if (state.outreachConfig && typeof state.outreachConfig === "object") {
    section("Outreach (B2)");
    lines.push(`- live send ${state.outreachConfig.liveSendEnabled ? "ON" : "off"}; ${list(state.outreachContacts).length} contact(s); ${list(state.outreachSuppressions).length} suppression(s).`);
  }

  const posts = list(state.posts).filter((post) => lower(post.status) === "needs_review");
  if (posts.length) {
    section(`Social drafts waiting review (${posts.length})`);
    for (const post of posts.slice(0, 4)) lines.push(`- ${post.title}`);
  }

  const activity = list(state.activityEvents);
  const recentActivity = activity.filter((event) => String(event.createdAt || "") >= weekAgo);
  section(`Recent activity (${recentActivity.length} event(s) in the last 7 days)`);
  for (const event of activity.slice(0, 10)) {
    lines.push(digestLine([`- ${event.title || event.eventType}`, event.createdAt && String(event.createdAt).slice(0, 10)]));
  }

  const digest = scrubPii(lines.join("\n").trim());
  if (digest.length <= maxChars) return digest;
  return digest.slice(0, maxChars) + "\n(...digest truncated at cap)";
}

// ---- conversation memory ------------------------------------------------------------------------
export function leeRecentMessages(state = {}, threadId = LEE_DEFAULT_THREAD_ID, { recentLimit = 30 } = {}) {
  return list(state.leeMessages)
    .filter((message) => !threadId || message.threadId === threadId)
    .slice()
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .slice(-recentLimit)
    .filter((message) => ["user", "assistant"].includes(message.role) && text(message.content));
}

export function leeThreadHistory(state = {}, threadId = LEE_DEFAULT_THREAD_ID, options = {}) {
  return leeRecentMessages(state, threadId, options).map((message) => ({ role: message.role, content: String(message.content) }));
}

// Keyword recall across ALL saved messages, so "what did I tell you about Celia?" works even when
// the mention has scrolled out of the recent-history window. Returned as context lines, not turns.
export function leeRecallNotes(state = {}, prompt = "", { limit = 6, excludeIds = new Set() } = {}) {
  const tokens = [...new Set(lower(prompt).split(/[^a-z0-9]+/).filter((token) => token.length >= 4))];
  if (!tokens.length) return [];
  return list(state.leeMessages)
    .filter((message) => !excludeIds.has(message.id) && text(message.content))
    .map((message) => {
      const body = lower(message.content);
      const hits = tokens.filter((token) => body.includes(token)).length;
      return { message, hits };
    })
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits || String(b.message.createdAt || "").localeCompare(String(a.message.createdAt || "")))
    .slice(0, limit)
    .map(({ message }) => `${String(message.createdAt || "").slice(0, 10)} ${message.role === "user" ? "Roger said" : "Le-E replied"}: ${String(message.content).slice(0, 300)}`);
}

// ---- prompt assembly ------------------------------------------------------------------------------
export function buildLeeSystemPrompt() {
  return [
    "You are Le-E, the internal operating assistant for LegalEase. You are talking with Roger, the owner.",
    "",
    "Voice rules, all hard:",
    "- Answer in plain sentences. No headers, no bullet lists, no numbered lists for ordinary questions.",
    "- Never use an em-dash.",
    '- Never use these words or phrases: "excited to announce", "thrilled to share", "game-changer", "revolutionize", "unlock", "empower", "delve", "landscape", "journey", "we\'re just getting started".',
    "- Use person-first language for people with records.",
    "- Never promise legal outcomes, eligibility, or court results. Never give legal advice.",
    "",
    "Grounding rules:",
    "- Answer only from the state digest and the conversation history you are given. If the answer is not in them, say so plainly. Never invent numbers, names, or events.",
    "- Answer only Roger's newest message. Do not repeat or restate your earlier answers.",
    "",
    "Action rules, all hard:",
    "- You cannot act. You never send anything, never write records, never change settings or gates. You propose; Roger disposes.",
    "- When Roger asks you to log, record, or update something (a meeting, a partner update, a follow-up), confirm in one plain sentence what you are queueing, then append one line per item at the very end of your reply, exactly in this form:",
    '[[suggestion]]{"kind":"partner_update","who":"<person or organization>","note":"<what to record>","due":"<YYYY-MM-DD or empty string>"}',
    '- "who" is the other person or organization involved (the one Roger met, called, or mentioned), never Roger himself.',
    '- Use kind "partner_update" when it concerns a partner or prospect relationship; otherwise use kind "task".',
    '- Set "due" whenever Roger gives any timing; "end of July" means the last day of July in the current year.',
    "- Queue a suggestion only for Roger's newest message. If the history shows you already queued something, do not queue it again unless Roger asks again.",
    "- Each suggestion goes to Roger's Automation Inbox as a pending item. Never claim it was applied; it was queued for his approval."
  ].join("\n");
}

export function parseLeeReply(raw = "") {
  const drafts = [];
  const answer = String(raw || "").replace(/^\s*\[\[suggestion\]\]\s*(\{.*\})\s*$/gm, (whole, json) => {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object") drafts.push(parsed);
    } catch {
      // Malformed suggestion line: drop it rather than surface broken JSON to Roger.
    }
    return "";
  }).trim();
  return { answer, drafts };
}

// ---- suggestions into the I4 lane ----------------------------------------------------------------
function matchPartner(state = {}, who = "") {
  const needle = lower(who);
  if (needle.length < 3) return null;
  return list(state.partners).find((partner) => {
    const name = lower(partner.name || "");
    return name && (name.includes(needle) || needle.includes(name));
  }) || null;
}

export function buildLeeSuggestions(state = {}, drafts = [], { threadId = LEE_DEFAULT_THREAD_ID, userMessage = "", messageId = "", now = new Date().toISOString() } = {}) {
  const existing = new Set(list(state.automationSuggestions).map((item) => item.id));
  const suggestions = [];
  drafts.slice(0, 5).forEach((draft, index) => {
    const who = text(draft.who);
    const note = text(draft.note) || text(userMessage).slice(0, 240);
    const due = /^\d{4}-\d{2}-\d{2}$/.test(text(draft.due)) ? text(draft.due) : "";
    const id = `auto-suggest-lee-${messageId || uid("msg")}-${index}`;
    if (existing.has(id)) return;
    const base = {
      id,
      source: "lee-assistant",
      threadId,
      evidence: [`Roger told Le-E: "${text(userMessage).slice(0, 300)}"`],
      status: "pending",
      confidence: "medium",
      explanation: "Le-E drafted this from Roger's own words in chat. Nothing changes until Roger approves it.",
      createdAt: now,
      updatedAt: now
    };
    const partner = draft.kind === "partner_update" ? matchPartner(state, who) : null;
    if (partner) {
      suggestions.push({
        ...base,
        suggestionType: "update_partner_status",
        title: `Partner update: ${partner.name}`,
        summary: note,
        relatedEntityType: "partner",
        relatedEntityId: partner.id,
        proposedChanges: {
          nextAction: (note + (due ? ` (by ${due})` : "")).slice(0, 240),
          lastTouchDate: now.slice(0, 10)
        }
      });
    } else {
      suggestions.push({
        ...base,
        suggestionType: "mark_follow_up_due",
        title: who ? `Follow up: ${who}` : "Follow up from Le-E chat",
        summary: note,
        relatedEntityType: "task",
        relatedEntityId: "",
        proposedChanges: {
          title: (who ? `Follow up with ${who}` : "Follow up from Le-E chat").slice(0, 120),
          description: note,
          dueDate: due || new Date(Date.parse(now) + 2 * 86400000).toISOString().slice(0, 10),
          sourceType: "lee_assistant"
        }
      });
    }
  });
  return suggestions;
}

// ---- legacy lane migration ------------------------------------------------------------------------
// One proposal system, not two. Unresolved leeActionProposals (status proposed/blocked) become
// pending automationSuggestions so they surface in the Automation Inbox instead of dying silently
// with the old UI. Idempotent: migrated ids are deterministic and already-migrated items are marked.
export function migrateLegacyLeeProposals(state = {}, { now = new Date().toISOString() } = {}) {
  const proposals = list(state.leeActionProposals);
  const unresolved = proposals.filter((item) => ["proposed", "blocked"].includes(lower(item.status)));
  if (!unresolved.length) return { state, suggestions: [], migratedCount: 0, changed: false };
  const existing = new Set(list(state.automationSuggestions).map((item) => item.id));
  const suggestions = [];
  for (const proposal of unresolved) {
    const id = `auto-suggest-lee-legacy-${proposal.id}`;
    if (existing.has(id)) continue;
    suggestions.push({
      id,
      source: "lee-assistant",
      suggestionType: "mark_follow_up_due",
      title: `Legacy Le-E proposal: ${proposal.title || proposal.actionType || proposal.id}`,
      summary: proposal.summary || "Unresolved proposal from the retired Le-E proposal lane.",
      relatedEntityType: proposal.objectType || "task",
      relatedEntityId: proposal.objectId || "",
      evidence: [proposal.summary || proposal.title || proposal.id].filter(Boolean),
      explanation: "Migrated from the retired Le-E proposal lane so it is not lost. Review and approve, edit, or ignore it.",
      confidence: "low",
      status: "pending",
      proposedChanges: {
        title: `Review legacy Le-E proposal: ${proposal.title || proposal.id}`.slice(0, 120),
        description: `${proposal.summary || ""} (migrated from the retired Le-E proposal lane; original action type: ${proposal.actionType || "unknown"}, original status: ${proposal.status})`.trim(),
        dueDate: new Date(Date.parse(now) + 2 * 86400000).toISOString().slice(0, 10),
        sourceType: "lee_legacy_migration"
      },
      createdAt: now,
      updatedAt: now
    });
  }
  const migratedIds = new Set(unresolved.map((item) => item.id));
  const nextProposals = proposals.map((item) => migratedIds.has(item.id)
    ? { ...item, status: "migrated", migratedAt: now, migratedToSuggestionId: `auto-suggest-lee-legacy-${item.id}` }
    : item);
  return {
    state: { ...state, leeActionProposals: nextProposals },
    suggestions,
    migratedCount: unresolved.length,
    changed: true
  };
}

// ---- the assistant --------------------------------------------------------------------------------
export function createLeeThread(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  return {
    id: input.id || LEE_DEFAULT_THREAD_ID,
    title: input.title || "Le-E conversation",
    status: "active",
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

const LEE_NO_KEY_REPLY = "I can't give you a real answer yet: no model key is configured on this server. Ask the operator to set the OpenAI API key on Render. Your message is saved, and I'll have the full conversation when a key is live.";
const LEE_VOICE_FAIL_REPLY = "I drafted an answer but it broke the voice rules, so I'm not showing it. Ask me again in a different way.";

export async function runLeeAssistant(state = {}, input = {}, ctx = {}) {
  const now = ctx.now || new Date().toISOString();
  const message = text(input.message);
  if (!message) throw new Error("Ask Le-E something first.");
  const threadId = text(input.threadId) || state.leeMemory?.lastThreadId || list(state.leeThreads)[0]?.id || LEE_DEFAULT_THREAD_ID;
  const existingThread = list(state.leeThreads).find((thread) => thread.id === threadId);
  const thread = existingThread ? { ...existingThread, updatedAt: now } : createLeeThread({ id: threadId, title: message.slice(0, 72) }, { now });

  const userMessage = {
    id: uid("lee-msg"),
    threadId,
    role: "user",
    content: message,
    createdAt: now,
    status: "sent"
  };

  let reply = "";
  let suggestions = [];
  let mode = "no_model_key";
  let voiceRetried = false;

  if (typeof ctx.callModel === "function") {
    const recent = leeRecentMessages(state, threadId);
    const history = recent.map((item) => ({ role: item.role, content: String(item.content) }));
    const recall = leeRecallNotes(state, message, { excludeIds: new Set(recent.map((item) => item.id)) });
    const digest = buildLeeStateDigest(state, { now });
    const context = [
      "STATE DIGEST (live Command Center data):",
      digest,
      recall.length ? "\nEARLIER NOTES FROM PAST CONVERSATIONS (may be relevant):\n" + recall.join("\n") : ""
    ].filter(Boolean).join("\n");
    const messages = [
      { role: "user", content: context },
      { role: "assistant", content: "Understood. I will answer from this data only, in plain sentences, and queue any record updates as pending suggestions." },
      ...history,
      { role: "user", content: message }
    ];
    const system = buildLeeSystemPrompt();
    let result = await ctx.callModel({ system, messages, maxTokens: 700 });
    if (result?.ok) {
      let parsed = parseLeeReply(result.text);
      let violations = leeVoiceViolations(parsed.answer);
      if (violations.length) {
        voiceRetried = true;
        const retry = await ctx.callModel({
          system,
          messages: [...messages, { role: "assistant", content: result.text }, { role: "user", content: `Your reply used banned voice patterns (${violations.join(", ")}). Rewrite the same answer without them. Keep any [[suggestion]] lines.` }],
          maxTokens: 700
        });
        if (retry?.ok) {
          parsed = parseLeeReply(retry.text);
          violations = leeVoiceViolations(parsed.answer);
        }
      }
      if (violations.length || !parsed.answer) {
        reply = LEE_VOICE_FAIL_REPLY;
        mode = "voice_blocked";
      } else {
        reply = parsed.answer;
        suggestions = buildLeeSuggestions(state, parsed.drafts, { threadId, userMessage: message, messageId: userMessage.id, now });
        mode = "model";
      }
    } else {
      reply = `I couldn't reach the model (${text(result?.error) || "no response"}). Your message is saved; try again in a moment.`;
      mode = "model_error";
    }
  } else {
    reply = LEE_NO_KEY_REPLY;
  }

  const assistantMessage = {
    id: uid("lee-msg"),
    threadId,
    role: "assistant",
    content: reply,
    createdAt: now,
    suggestionIds: suggestions.map((item) => item.id),
    status: "complete"
  };
  const run = {
    id: uid("lee-run"),
    threadId,
    status: "complete",
    mode,
    voiceRetried,
    inputSummary: message.slice(0, 180),
    proposedSuggestions: suggestions.length,
    createdAt: now,
    completedAt: now
  };
  return { thread, userMessage, assistantMessage, suggestions, run };
}

export function buildLeeStatus(state = {}, options = {}) {
  const liveGates = Object.values(state.runtime?.livePostingGates || {}).filter((gate) => gate?.enabled).length;
  return {
    modelConfigured: Boolean(options.modelConfigured),
    provider: options.provider || "",
    historyMessages: list(state.leeMessages).length,
    pendingSuggestions: list(state.automationSuggestions).filter((item) => item.source === "lee-assistant" && ["pending", "edited"].includes(lower(item.status))).length,
    legacyProposalsUnresolved: list(state.leeActionProposals).filter((item) => ["proposed", "blocked"].includes(lower(item.status))).length,
    safeModeActive: true,
    liveGatesCount: liveGates
  };
}

// ---- real model caller (fetch injected for tests) -------------------------------------------------
// Le-E uses its own model default rather than OPENAI_DRAFT_MODEL so the social-drafts model
// choice never silently changes what answers Roger. gpt-5.6-terra is OpenAI's current balanced
// tier (GA 2026-07-09), the right class for grounded plain-sentence answers over a small digest;
// LEE_OPENAI_MODEL overrides it without a code change.
function openAICaller(env, fetcher) {
  const model = env.LEE_OPENAI_MODEL || "gpt-5.6-terra";
  return Object.assign(async ({ system, messages, maxTokens = 700 }) => {
      try {
        const input = [{ role: "system", content: system }, ...messages];
        const response = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({ model, input, max_output_tokens: maxTokens })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) return { ok: false, error: `OpenAI status ${response.status}` };
        const body = String(data?.output_text || data?.output?.map?.((item) => item?.content?.map?.((chunk) => chunk?.text || "").join("") || "").join("") || "").trim();
        return body ? { ok: true, text: body } : { ok: false, error: "empty model reply" };
      } catch (error) {
        return { ok: false, error: error.message || "OpenAI request failed" };
      }
  }, { provider: "openai", model });
}

// Le-E talks to OpenAI (Roger's call, 2026-07-12), reusing the same OPENAI_API_KEY that already
// powers drafts, triage, and image generation. Returns null when the key is missing, which the
// assistant reports honestly rather than faking an answer.
export function buildLeeModelCaller(env = process.env, fetcher = globalThis.fetch) {
  return env.OPENAI_API_KEY ? openAICaller(env, fetcher) : null;
}
