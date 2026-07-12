import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

// ---- the surface: a plain conversation ---------------------------------------------------------
// Message history on top, one text box, one send button. Page and floating panel share one
// renderer, so there is exactly one conversation UI to keep honest.
assert.match(server, /function leePageHtml\(pageClass\)/, "Le-E page renderer exists.");
assert.match(server, /function leeConversationHtml\(\)/, "Shared conversation renderer exists.");
assert.match(server, /id="lee"/, "Le-E page section uses #lee.");
assert.match(server, /\["Le-E chat page", "lee"\]/, "Le-E chat page stays indexed under More.");
assert.match(server, /\$\{leeBubbleHtml\(\)\}/, "Le-E bubble renders on every page.");
assert.match(server, /class="lee-pill"/, "Floating pill entry point kept.");
assert.match(server, /class="lee-panel"/, "Floating panel kept.");
assert.match(server, /class="lee-pill-dot"/, "Pill activity dot kept.");
assert.match(server, /aria-label="Ask Le-E"/, "Pill keeps its accessible label.");
assert.match(server, /class="lee-messages"/, "Message history renders.");
assert.match(server, /onsubmit="sendLeeMessage\(event\)"/, "One form submits to sendLeeMessage.");

// Exactly one send path: the page and the panel render the SAME form via leeConversationHtml.
const conversationForms = server.match(/onsubmit="sendLeeMessage\(event\)"/g) || [];
assert.equal(conversationForms.length, 1, "The send form is defined once, in the shared renderer.");

// ---- deleted: every chip, pill-menu, quick-action, and proposal card ----------------------------
for (const gone of [
  "askLeePrompt",
  "data-lee-prompt",
  ".lee-quick",
  "lee-suggestions",
  "lee-menu",
  "lee-onboarding",
  "leeAdvanced",
  "leeProposalCard",
  "leeShortAnswer",
  "leeSimpleProposalSummary",
  "leeSourceChips",
  "applyLeeAction",
  "approveLeeAction",
  "rejectLeeAction",
  "applyAllSafeLeeActions",
  "newLeeThread",
  "clearLeeThread",
  "rebuildLeeIndex",
  "Rewrite with Le-E",
  "Plan my day"
]) {
  assert.ok(!server.includes(gone), `Old Le-E surface piece must be gone: ${gone}`);
}

// ---- the send button works: request shape that survives prod ------------------------------------
const sendFn = server.slice(server.indexOf("async function sendLeeMessage"), server.indexOf("let leeHistoryLoaded"));
assert.match(sendFn, /api\("\/api\/lee\/chat"/, "Send posts to the chat endpoint through api() so Phase L button feedback covers it.");
assert.match(sendFn, /timeoutMs:\s*30000/, "Chat request gets a 30s timeout; the 8s default killed prod chat.");
assert.ok(!/state\s*=\s*result\.state/.test(sendFn), "Client must not swallow a full-state echo from chat.");
assert.match(sendFn, /result\.messages/, "Client merges the small message delta instead.");
assert.match(sendFn, /cooAction/, "Failures surface through cooAction toasts, never silently.");

// ---- server routes: slim, owner-gated, propose-only ----------------------------------------------
assert.match(server, /"\/api\/lee\/chat" && request\.method === "POST"/, "Chat route exists.");
assert.match(server, /Only the owner can talk to Le-E/, "Chat is owner-gated.");
assert.match(server, /Le-E conversation history is owner-only/, "History route is owner-gated.");
assert.match(server, /"\/api\/lee\/status" && request\.method === "GET"/, "Status route kept.");
for (const goneRoute of ["/api/lee/search", "/api/lee/index/rebuild", "/api/lee/actions/"]) {
  assert.ok(!server.includes(goneRoute), `Retired route must be gone: ${goneRoute}`);
}
const chatRoute = server.slice(server.indexOf('"/api/lee/chat" && request.method === "POST"'), server.indexOf('"/api/autonomy/check"'));
assert.ok(!chatRoute.includes("withPublicChannelSetup"), "Chat response is the delta only, never the full state.");
assert.match(server, /safeMessage: error\.message \|\| "Le-E could not answer that request\."/, "Chat errors return a safe message.");

// The chat mutation writes scoped collections and routes suggestions through the I4 lane.
const chatMutation = server.slice(server.indexOf("async function runLeeChat"), server.indexOf("async function createGrowthInboxItem"));
assert.match(chatMutation, /store\.writeCollections\(patch\)/, "Chat writes are scoped, never full-state.");
assert.ok(!/writeState\(/.test(chatMutation), "No full-state write in the chat path.");
assert.match(chatMutation, /migrateLegacyLeeProposals/, "Legacy proposal lane migrates through chat.");
assert.match(chatMutation, /automationSuggestions/, "Le-E suggestions land in the shared automationSuggestions lane.");
assert.match(chatMutation, /stripOwnerOnlyCollections\(state, actor\)/, "The digest respects owner-only visibility.");
assert.ok(!/leeChat\(/.test(server), "The old regex-template engine is gone.");
assert.ok(!server.includes("lee-engine.mjs"), "lee-engine import removed.");

// ---- memory: owner-only persisted conversation ----------------------------------------------------
assert.match(server, /OWNER_ONLY_COLLECTIONS = \["inboxSignals", "inboxConfig", "leeThreads", "leeMessages", "leeRuns", "leeMemory"\]/, "Le-E memory is owner-only.");
assert.match(server, /function loadLeeHistory/, "History loads on demand so Monday picks up Sunday.");

// ---- suggestions surface in the Automation Inbox ---------------------------------------------------
assert.match(server, /Suggested update queued for your approval/, "Reply shows a suggestion notice.");
assert.match(server, /href="#automation">Review it in the Automation Inbox/, "Notice links to the approve-then-apply surface.");

console.log("Le-E UI tests passed");
