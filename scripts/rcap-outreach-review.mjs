// RCAP Outreach Review (Wave 3, Packet 10).
//
// The one place an exact message is read and approved. Nothing sends from the Overview, nothing
// sends from Le-E, and nothing sends from here either -- Packet 11 is where execution is even
// discussed, behind a Gmail scope that does not exist yet.
//
// What this module is actually for is making approval MEAN something. Rule 4 says no external
// email without exact approval, and the only way that holds is if an approval is bound to the
// exact bytes it was given:
//
//   - the approval carries the content hash of the message as approved;
//   - any material edit afterwards -- recipient, subject, body, attachment -- invalidates it,
//     rather than letting approved authority ride along with text nobody approved;
//   - a whitespace-only change is not a material edit, because forcing re-approval for a
//     trailing newline trains people to approve without reading, which is the failure this whole
//     contract exists to prevent.
//
// Pure and deterministic. The caller passes `now`; no clock, no network, no writes.

import { rcapContentHash, rcapRecordId } from "./rcap-profile-contracts.mjs";
import { rcapProfileQualityGates } from "./rcap-profile-engine.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLowerCase();

// MUST stay in sync with coreStateCollections in scripts/storage.mjs.
export const RCAP_REVIEW_COLLECTIONS = Object.freeze(["rcapMessageApprovals"]);

export const RCAP_REVIEW_STATES = Object.freeze([
  "draft", "ready_for_review", "approved", "blocked", "invalidated"
]);

// The three questions a reviewer must be able to answer before approving anything. A review that
// cannot answer them is not ready, however good the prose is.
export const RCAP_REVIEW_RATIONALE_FIELDS = Object.freeze(["whyThisAccount", "whyThisContact", "whyNow"]);

// ---------------------------------------------------------------------------------------------
// Exact content
// ---------------------------------------------------------------------------------------------

// The exact bytes. Recipient, subject, body and attachment names all participate: changing who
// it goes to is as material as changing what it says.
export function rcapMessageContentHash(message = {}) {
  return rcapContentHash({
    to: lower(message.to),
    subject: clean(message.subject),
    body: String(message.body ?? ""),
    attachments: list(message.attachments).map((entry) => clean(entry.name || entry)).sort()
  });
}

// Whitespace-only differences are not material. Everything else is.
function materialShape(message = {}) {
  return {
    to: lower(message.to),
    subject: clean(message.subject).replace(/\s+/g, " "),
    body: String(message.body ?? "").replace(/\s+/g, " ").trim(),
    attachments: list(message.attachments).map((entry) => clean(entry.name || entry)).sort()
  };
}

export function rcapMaterialHash(message = {}) {
  return rcapContentHash(materialShape(message));
}

// ---------------------------------------------------------------------------------------------
// The review
// ---------------------------------------------------------------------------------------------

export function buildRcapOutreachReview(input = {}) {
  const accountId = clean(input.accountId);
  const now = clean(input.now);
  const message = input.message || {};
  const plan = input.plan || null;
  const contact = input.contact || null;
  const claims = list(input.claims);

  const to = clean(message.to);
  const subject = clean(message.subject);
  const body = String(message.body ?? "");
  const attachments = list(message.attachments).map((entry) => Object.freeze({
    name: clean(entry.name || entry),
    reason: clean(entry.reason)
  }));

  const blockers = [];

  // The plan's own blockers outrank everything: if the sequence must not run, the message in it
  // must not be approved either.
  if (plan?.blocked) blockers.push(clean(plan.blockedReason) || "The outreach plan for this organization is blocked.");
  if (!to) blockers.push("The message has no recipient.");
  if (!subject) blockers.push("The message has no subject line.");
  if (!clean(body)) blockers.push("The message has no body.");
  if (contact && contact.emailable === false) {
    blockers.push(clean(contact.blockers?.[0]) || "This recipient is not a usable route.");
  }
  // Rule 8, at the point it actually matters: the message must go to the first contact the plan
  // named, not to somebody else at the same organization.
  if (plan?.firstContactId && contact?.id && plan.firstContactId !== contact.id) {
    blockers.push("This message is addressed to someone other than the first contact the plan named.");
  }

  // Rule 12: an attachment must justify itself against this organization, or there is none.
  const attachmentRecommendation = attachments.length
    ? Object.freeze({
      recommended: true,
      attachments: Object.freeze(attachments),
      unjustified: Object.freeze(attachments.filter((entry) => !entry.reason).map((entry) => entry.name))
    })
    : Object.freeze({
      recommended: false,
      attachments: Object.freeze([]),
      unjustified: Object.freeze([]),
      reason: "Nothing is attached. On a first message that is usually right."
    });
  for (const name of attachmentRecommendation.unjustified) {
    blockers.push(`"${name}" is attached with no reason tying it to this organization.`);
  }

  // The message's own quality gates, run over the real text rather than over a draft section.
  const gates = rcapProfileQualityGates({
    organizationName: clean(input.organizationName),
    claims,
    sections: [
      { sectionKey: "send_ready_initial_email", body },
      ...(clean(input.previousMessageBody) ? [{ sectionKey: "first_follow_up_email", body }] : []),
      { sectionKey: "what_to_send", body: attachments.map((entry) => entry.name).join(", ") }
    ]
  });
  for (const finding of gates.blocking) blockers.push(finding.message);

  const rationale = Object.freeze({
    whyThisAccount: clean(input.whyThisAccount),
    whyThisContact: clean(input.whyThisContact) || clean(plan?.firstContactReason),
    whyNow: clean(input.whyNow)
  });
  for (const field of RCAP_REVIEW_RATIONALE_FIELDS) {
    if (!rationale[field]) blockers.push(`The review cannot say ${field === "whyThisAccount" ? "why this organization" : field === "whyThisContact" ? "why this person" : "why now"}.`);
  }

  // Thread awareness. An open thread is not a blocker by itself -- replying INTO it is usually
  // the right move -- but a message that ignores an open thread and starts a new one is.
  const thread = input.thread || null;
  const threadAware = Object.freeze({
    existingThread: thread ? clean(thread.threadId) : "",
    mode: thread ? (message.inReplyToThreadId === thread.threadId ? "reply_in_thread" : "new_thread") : "new_thread",
    reason: thread
      ? (message.inReplyToThreadId === thread.threadId
        ? "Continues the conversation already open with this person."
        : "A conversation is already open with this person, and this message would start a second one.")
      : "No conversation is open with this person."
  });
  if (thread && threadAware.mode === "new_thread") blockers.push(threadAware.reason);

  const claimsUsed = claims
    .filter((claim) => ["verified_fact", "supported_inference"].includes(lower(claim.factClass)))
    .filter((claim) => {
      const phrase = lower(claim.text).split(/\s+/).filter((word) => word.length > 4).slice(0, 3).join(" ");
      return phrase && lower(body).includes(phrase);
    })
    .map((claim) => Object.freeze({
      id: clean(claim.id),
      factClass: lower(claim.factClass),
      text: clean(claim.text),
      sourceIds: Object.freeze(list(claim.sourceIds).map(clean))
    }));

  const contentHash = rcapMessageContentHash({ to, subject, body, attachments });
  const materialHash = rcapMaterialHash({ to, subject, body, attachments });
  const blocked = blockers.length > 0;

  return Object.freeze({
    accountId,
    state: blocked ? "blocked" : "ready_for_review",
    // The exact message, rendered as it would actually appear. Nothing is summarised: a reviewer
    // approves what they read, so what they read has to be the thing.
    message: Object.freeze({ to, subject, body, attachments: Object.freeze(attachments) }),
    contentHash,
    materialHash,
    rationale,
    claimsUsed: Object.freeze(claimsUsed),
    attachmentRecommendation,
    threadAware,
    gates,
    blocked,
    blockers: Object.freeze(blockers),
    // Approval is the only thing this surface offers, and it grants no send authority of its
    // own. Packet 11 must check its own execution gate as well.
    approval: Object.freeze({
      available: !blocked,
      grantsSendAuthority: false,
      reason: blocked ? "The message cannot be approved while any of the blockers above stand." : ""
    }),
    createdAt: now,
    safety: Object.freeze({ externalActions: 0, sendControls: 0, scheduled: 0 })
  });
}

// ---------------------------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------------------------

export function approveRcapMessage(review = {}, options = {}) {
  const approver = clean(options.approvedBy);
  const now = clean(options.now);
  if (review.blocked) throw new Error("A blocked message cannot be approved.");
  if (!approver) throw new Error("An approval must record who approved it.");
  if (!now) throw new Error("An approval must record when it was granted.");

  return Object.freeze({
    id: rcapRecordId("rappr", review.accountId, review.contentHash),
    accountId: clean(review.accountId),
    // The bytes as approved. An approval that did not carry this would authorise whatever the
    // draft happened to say at send time, which is not approval at all.
    contentHash: clean(review.contentHash),
    materialHash: clean(review.materialHash),
    approvedBy: approver,
    approvedAt: now,
    // Approval and execution are separate gates. This one says "these words are right"; it does
    // not say "send it", and Packet 11 must satisfy its own.
    grantsSendAuthority: false,
    revokedAt: "",
    revokedReason: ""
  });
}

// A material edit revokes approval. A whitespace-only change does not: forcing re-approval for a
// trailing newline teaches people to click approve without reading, which defeats the contract.
export function rcapApprovalInvalidatedBy(approval = {}, message = {}) {
  const currentMaterial = rcapMaterialHash(message);
  const currentExact = rcapMessageContentHash(message);
  const material = clean(approval.materialHash) !== currentMaterial;
  const cosmetic = !material && clean(approval.contentHash) !== currentExact;

  return Object.freeze({
    invalidated: material,
    cosmeticChange: cosmetic,
    reason: material
      ? "The message changed after it was approved. The approval covered different words."
      : cosmetic
        ? "Only whitespace changed. The approval still covers these words."
        : ""
  });
}
