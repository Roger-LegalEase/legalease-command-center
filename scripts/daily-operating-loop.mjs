import { computeRcapPartnerJourneyHandoffReadiness, rcapReviewQueue } from "./review-approval-engine.mjs";
import { conversationOperatingInputs } from "./lee-conversation-context.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function openTask(task = {}) {
  return !["done", "complete", "completed", "dismissed", "archived"].includes(String(task.status || "").toLowerCase());
}

function recentTimestamp(item = {}) {
  const value = item.createdAt || item.timestamp || item.updatedAt || item.generatedAt || "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function item(title, detail, options = {}) {
  return {
    title,
    detail,
    why: options.why || detail,
    action: options.action || "Open review workspace",
    href: options.href || "production-activation-rcap",
    source: options.source || "daily_operating_loop"
  };
}

function uniqueByTitle(items = []) {
  const seen = new Set();
  return items.filter(entry => {
    const title = String(entry?.title || "").trim();
    if (!title || seen.has(title)) return false;
    seen.add(title);
    return true;
  });
}

function fillTop3(items = []) {
  return uniqueByTitle([
    ...items,
    item(
      "Review RCAP handoff packet",
      "Use the internal packet to decide what still needs Roger before any Partner Journey handoff.",
      { action: "Open RCAP review", href: "production-activation-rcap", source: "handoff" }
    ),
    item(
      "Clear one open task",
      "Pick the highest leverage internal task and move it to a clear next state.",
      { action: "Open Tasks", href: "tasks", source: "tasks" }
    ),
    item(
      "Capture missing context",
      "If the next move is unclear, capture the missing detail instead of switching modules.",
      { action: "Open Growth Inbox", href: "growth-inbox", source: "growth_inbox" }
    )
  ]).slice(0, 3);
}

function summarizeMomentum(state = {}) {
  return [...list(state.activityEvents), ...list(state.auditHistory), ...list(state.events)]
    .sort((a, b) => recentTimestamp(b) - recentTimestamp(a))
    .slice(0, 4)
    .map(entry => item(
      entry.title || entry.eventType || entry.action || "Operating event captured",
      entry.summary || entry.action || entry.eventType || "Internal operating state changed.",
      { action: "Review activity", href: "reports", source: "activity" }
    ));
}

export function buildDailyOperatingLoop(state = {}) {
  const reviewQueue = rcapReviewQueue(state);
  const handoff = computeRcapPartnerJourneyHandoffReadiness(state);
  const conversation = conversationOperatingInputs(state);
  const liveGates = liveGatesCount(state);
  const openTasks = list(state.tasks).filter(openTask);
  const blocked = reviewQueue.filter(entry => entry.review_state === "blocked");
  const revisions = reviewQueue.filter(entry => entry.review_state === "needs_revision");
  const reviewRequired = reviewQueue.filter(entry => entry.review_state === "review_required");

  const topCandidates = [];
  if (blocked.length) {
    topCandidates.push(item(
      `Resolve blocked RCAP artifact: ${blocked[0].artifact}`,
      blocked[0].next_required_action || "Blocked artifacts stop handoff readiness.",
      { action: "Open RCAP review", href: "production-activation-rcap", source: "rcap_review" }
    ));
  }
  if (revisions.length) {
    topCandidates.push(item(
      `Revise RCAP artifact: ${revisions[0].artifact}`,
      revisions[0].next_required_action || "Revision-required artifacts need a clear operator pass.",
      { action: "Open RCAP review", href: "production-activation-rcap", source: "rcap_review" }
    ));
  }
  if (!handoff.handoff_ready) {
    topCandidates.push(item(
      "Move RCAP toward handoff readiness",
      handoff.next_manual_action,
      { action: "Open RCAP review", href: "production-activation-rcap", source: "handoff" }
    ));
  }
  if (reviewRequired.length) {
    topCandidates.push(item(
      `Review RCAP artifact: ${reviewRequired[0].artifact}`,
      reviewRequired[0].next_required_action || "This artifact still needs Roger's review state.",
      { action: "Open RCAP review", href: "production-activation-rcap", source: "rcap_review" }
    ));
  }
  if (openTasks.length) {
    topCandidates.push(item(
      openTasks[0].title || "Open task needs attention",
      openTasks[0].nextAction || openTasks[0].description || "An internal task is still open.",
      { action: "Open Tasks", href: "tasks", source: "tasks" }
    ));
  }
  for (const noteItem of conversation.briefItems.slice(0, 2)) {
    topCandidates.push(item(
      noteItem.title || "Conversation input needs action",
      noteItem.detail || "Reviewed conversation context should shape today's operating loop.",
      { action: "Open Conversation Notes", href: "conversation-notes", source: "conversation_note" }
    ));
  }

  const waitingOn = uniqueByTitle([
    ...handoff.missing_partner_details.map(detail => item(
      detail,
      "Missing RCAP partner detail blocks handoff readiness.",
      { action: "Open RCAP review", href: "production-activation-rcap", source: "missing_details" }
    )),
    ...blocked.map(entry => item(
      entry.artifact,
      entry.next_required_action || "Blocked pending operator review.",
      { action: "Open RCAP review", href: "production-activation-rcap", source: "blocked_artifact" }
    )),
    ...conversation.needsReview.map(note => item(
      note.summary,
      "Needs review before it changes tomorrow's brief.",
      { action: "Review Note", href: "conversation-notes", source: "conversation_note" }
    ))
  ]).slice(0, 5);

  const decisionsNeeded = uniqueByTitle([
    ...reviewRequired.map(entry => item(
      entry.artifact,
      "Choose an internal review state before handoff can be evaluated.",
      { action: "Open RCAP review", href: "production-activation-rcap", source: "review_queue" }
    )),
    ...revisions.map(entry => item(
      entry.artifact,
      "Decide what revision is needed, then update the review state.",
      { action: "Open RCAP review", href: "production-activation-rcap", source: "revision" }
    )),
    item(
      "RCAP Partner Journey handoff",
      handoff.handoff_ready ? "Ready for a manual handoff decision. No external system is contacted." : handoff.next_manual_action,
      { action: "Open RCAP review", href: "production-activation-rcap", source: "handoff" }
    ),
    ...conversation.briefItems.map(noteItem => item(
      noteItem.title || "Conversation-derived decision",
      noteItem.detail || "Conversation context has been reviewed or applied.",
      { action: "Open Conversation Notes", href: "conversation-notes", source: "conversation_note" }
    ))
  ]).slice(0, 5);

  const doNotTouchToday = [
    item(
      "Live posting gates",
      liveGates === 0 ? "Leave live gates at 0 until explicit approval." : `${liveGates} live gate(s) need immediate review.`,
      { action: "Leave gates off", href: "settings", source: "safety" }
    ),
    item(
      "External Partner Journey handoff",
      "Do not contact external systems from this OS. Use the internal packet only.",
      { action: "Review internally", href: "production-activation-rcap", source: "safety" }
    ),
    item(
      "Email, page, and dashboard actions",
      "Keep all artifacts draft or review-only until Roger manually approves a separate external step.",
      { action: "Keep review-only", href: "production-activation-rcap", source: "safety" }
    ),
    ...conversation.doNotTouch.map(noteItem => item(
      noteItem.title || "Conversation do-not-touch item",
      noteItem.detail || "Do not let this distract Roger today.",
      { action: "Open Conversation Notes", href: "conversation-notes", source: "conversation_note" }
    ))
  ];

  return {
    voice: "Le-E operating brief",
    readOnly: true,
    noExternalSideEffects: true,
    liveGatesCount: liveGates,
    handoffReady: handoff.handoff_ready,
    top3: fillTop3(topCandidates),
    waitingOn,
    decisionsNeeded,
    doNotTouchToday,
    momentum: summarizeMomentum(state)
  };
}
