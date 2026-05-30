import assert from "node:assert/strict";
import { leeChat } from "./lee-engine.mjs";

const baseState = {
  runtime: { livePostingGates: { linkedin: { enabled:false }, facebook: { enabled:false } } },
  leeThreads: [],
  leeMessages: [],
  leeActionProposals: [],
  tasks: [
    {
      id:"task-goodwill",
      title:"Send Goodwill first-week card",
      description:"Goodwill kickoff focus.",
      nextAction:"Make Goodwill the visible focus.",
      status:"open",
      priority:"high",
      owner:"Roger",
      createdAt:"2026-05-30T12:00:00.000Z",
      updatedAt:"2026-05-30T12:00:00.000Z"
    }
  ],
  captureInbox: [],
  auditHistory: [],
  activityEvents: [],
  events: []
};

const updated = leeChat(baseState, {
  message:"change Goodwill to We Must Vote",
  threadId:"thread-visible-action"
}, { now:"2026-05-30T13:00:00.000Z" });

const changedTask = updated.state.tasks.find(item => item.id === "task-goodwill");
assert(changedTask.title.includes("We Must Vote"), "Le-E replace command should update visible internal task text.");
assert(!changedTask.title.includes("Goodwill"), "Le-E replace command should remove the old visible phrase.");
assert.match(updated.assistant.content, /Updated the current focus from Goodwill to We Must Vote\./, "Le-E should confirm the visible update.");
assert(updated.state.auditHistory.some(item => /lee visible update/i.test(item.action)), "Visible update should create audit entry.");
assert(updated.state.activityEvents.some(item => /Le-E visible update/i.test(item.eventType)), "Visible update should create activity entry.");

const notFound = leeChat(baseState, {
  message:"replace Missing Phrase with We Must Vote",
  threadId:"thread-visible-missing"
}, { now:"2026-05-30T13:05:00.000Z" });

assert.match(notFound.assistant.content, /I couldn’t find Missing Phrase in the current focus\. I saved this as a capture for review\./, "Le-E should explain when nothing was updated.");
assert(notFound.state.captureInbox.some(item => /Missing Phrase/.test(item.raw_input || "")), "Missing visible update should create a Capture Inbox item.");
assert(notFound.state.auditHistory.some(item => /lee capture fallback/i.test(item.action)), "Capture fallback should create audit entry.");
assert(notFound.state.activityEvents.some(item => /Le-E capture fallback/i.test(item.eventType)), "Capture fallback should create activity entry.");

const liveGatesCount = Object.values(updated.state.runtime.livePostingGates).filter(gate => gate.enabled).length;
assert.equal(liveGatesCount, 0, "Live gates must remain 0.");

console.log("Le-E visible actions tests passed");
