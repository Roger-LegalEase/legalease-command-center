import assert from "node:assert/strict";
import {
  applyLeeActionProposal,
  buildLeeKnowledgeIndex,
  buildLeeStatus,
  createLeeThread,
  leeChat,
  leeToolPolicy,
  searchLeeKnowledge
} from "./lee-engine.mjs";

const now = "2026-05-26T12:00:00.000Z";
const state = {
  tasks: [
    { id:"task-1", title:"Follow up with Fulton County", description:"Ask for decision date.", owner:"Roger", status:"open", priority:"high", dueDate:"2026-05-26", nextAction:"Send a short follow-up." }
  ],
  growthInbox: [
    { id:"inbox-1", rawText:"Goodwill asked for campaign copy and a partner page review.", summary:"Goodwill needs campaign copy.", status:"new", priority:"high", riskLevel:"medium", suggestedAction:"Create partner follow-up task." }
  ],
  partnerPrograms: [
    { id:"program-fulton", name:"Fulton County RCAP", status:"proposal_draft", paymentStatus:"unpaid", nextAction:"Review proposal scope.", metrics:{ revenueBooked:25000 } }
  ],
  partners: [
    { id:"partner-fulton", name:"Fulton County", stage:"proposal_sent", nextAction:"Confirm 30-day backlog triage scope.", lastTouchDate:"2026-05-10" }
  ],
  reports: [
    { id:"report-weekly", reportTitle:"Weekly Evidence Pack", summary:"Partner movement and proof notes.", generatedAt:now }
  ],
  dataRoomItems: [
    { id:"dr-1", title:"RCAP one-pager", category:"Product", status:"Ready" }
  ],
  soc2Evidence: [
    { id:"soc2-1", evidenceTitle:"SOC 2 Readiness Snapshot - May 2026", controlArea:"Evidence Collection", evidenceStatus:"Approved" }
  ],
  events: [
    { id:"event-1", eventType:"weekly_evidence_pack_generated", title:"Weekly evidence pack generated", createdAt:now }
  ],
  runtime: { openAIConfigured:true, livePostingGates:{ linkedin:{ enabled:false } } },
  leeThreads: [],
  leeMessages: [],
  leeActionProposals: []
};

const thread = createLeeThread({ title:"Daily operating thread", now });
assert.equal(thread.title, "Daily operating thread");
assert.equal(thread.status, "active");

const index = buildLeeKnowledgeIndex(state, { now });
assert.ok(index.sources.length >= 8, "expected sources across operating records");
assert.ok(index.chunks.some((chunk) => chunk.title.includes("Fulton County RCAP")));

const search = searchLeeKnowledge(index, "Fulton County proposal", { limit:3 });
assert.equal(search.results[0].sourceId, "program-fulton");
assert.ok(search.results[0].score > 0);

const policy = leeToolPolicy("publish_social_post");
assert.equal(policy.autonomyLevel, "approval_required");
assert.equal(policy.executionMode, "proposal_only");

const forbidden = leeToolPolicy("promise_court_outcome");
assert.equal(forbidden.autonomyLevel, "forbidden");
assert.equal(forbidden.allowed, false);

const chat = leeChat(state, {
  threadId: thread.id,
  message: "Le-E, plan my day and create tasks from Growth Inbox."
}, { now });
assert.match(chat.assistant.content, /What matters/i);
assert.ok(chat.proposals.some((proposal) => proposal.actionType === "create_task"));
assert.ok(chat.messages.some((message) => message.role === "user"));
assert.ok(chat.sources.length > 0);

const proposal = chat.proposals.find((item) => item.actionType === "create_task");
const applied = applyLeeActionProposal(state, proposal.id, { ...chat.state, leeActionProposals: chat.proposals }, { now });
assert.equal(applied.proposal.status, "applied");
assert.ok(applied.state.tasks.some((task) => task.sourceType === "lee"));
assert.ok(applied.state.events.some((event) => event.eventType === "lee_action_applied"));

const dangerousProposal = {
  id:"lee-action-danger",
  actionType:"publish_social_post",
  objectType:"post",
  objectId:"post-1",
  title:"Publish post",
  summary:"Would publish externally.",
  proposedChanges:{},
  autonomyLevel:"approval_required",
  riskLevel:"high",
  requiredApproval:true,
  status:"proposed",
  createdAt:now,
  auditHistory:[]
};
assert.throws(() => applyLeeActionProposal(state, dangerousProposal.id, {
  ...state,
  leeActionProposals:[dangerousProposal]
}, { now }), /proposal-only/i);

const status = buildLeeStatus(state, { now, openAIConfigured:true });
assert.equal(status.openAIConfigured, true);
assert.equal(status.safeModeActive, true);
assert.equal(status.liveGatesCount, 0);
assert.ok(status.availableToolsCount >= 10);

console.log("Le-E engine tests passed");
