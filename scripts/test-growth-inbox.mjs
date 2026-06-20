import assert from "node:assert/strict";
import {
  classifyGrowthInboxText,
  convertGrowthInboxItem,
  createWilmaCannotCloseSupportEscalation,
  growthInboxFingerprint,
  normalizeGrowthInboxItem
} from "./growth-inbox.mjs";

const partnerItem = normalizeGrowthInboxItem({
  rawText: "Goodwill wants a June campaign follow-up and asked for a pilot report next week.",
  relatedPartner: "Goodwill of Mississippi"
});

assert.equal(partnerItem.status, "new");
assert.equal(partnerItem.sourceType, "partner_update");
assert.equal(partnerItem.priority, "high");
assert.equal(partnerItem.relatedPartner, "Goodwill of Mississippi");
assert.equal(partnerItem.owner, "Operations");
assert.equal(partnerItem.operatingArea, "growth");
assert.equal(partnerItem.decisionNeeded, "roger_decision");
assert.equal(partnerItem.fingerprint, growthInboxFingerprint(partnerItem.rawText));
assert.match(partnerItem.suggestedAction, /follow/i);
assert.equal(partnerItem.history[0].action, "created");

const compliance = classifyGrowthInboxText("Customer asked if LegalEase can guarantee expungement approval in Texas.");
assert.equal(compliance.sourceType, "compliance_concern");
assert.equal(compliance.riskLevel, "high");
assert.equal(compliance.suggestedDestination, "support_issue");

const contentIdea = convertGrowthInboxItem(partnerItem, "content_idea");
assert.equal(contentIdea.item.status, "converted");
assert.equal(contentIdea.convertedRecord.collection, "contentBank");
assert.equal(contentIdea.convertedRecord.record.status, "idea");
assert.equal(contentIdea.event.eventType, "growth_inbox_item_converted");

const task = convertGrowthInboxItem({ ...partnerItem, owner: "Roger", dueDate: "2026-06-01" }, "task");
assert.equal(task.convertedRecord.collection, "tasks");
assert.equal(task.convertedRecord.record.owner, "Roger");
assert.equal(task.convertedRecord.record.dueDate, "2026-06-01");
assert.match(task.convertedRecord.record.nextAction, /follow/i);

const ignored = convertGrowthInboxItem(partnerItem, "ignore", { reason: "Already handled on partner call." });
assert.equal(ignored.item.status, "ignored");
assert.equal(ignored.item.ignoreReason, "Already handled on partner call.");

const supportEscalation = createWilmaCannotCloseSupportEscalation({ growthInbox: [] }, {
  question: "My name is Jane Example, email jane@example.com, phone 312-555-0199, packet number ABC12345. Did the court reject my filing?",
  reason: "Wilma could not close this without leaving the UPL-safe lane."
}, { now:"2026-06-20T12:00:00.000Z" });
assert.equal(supportEscalation.item.sourceType, "customer_support_issue");
assert.equal(supportEscalation.item.suggestedDestination, "support_issue");
assert.equal(supportEscalation.item.supportCategory, "support");
assert.equal(supportEscalation.item.external_action, false);
assert.equal(supportEscalation.item.auto_reply, false);
assert.equal(supportEscalation.item.pii_redacted, true);
assert.equal(supportEscalation.state.growthInbox[0].id, supportEscalation.item.id);
assert.doesNotMatch(JSON.stringify(supportEscalation.item), /Jane Example|jane@example\.com|312-555-0199|ABC12345/i);
assert.match(JSON.stringify(supportEscalation.item), /\[redacted-name\]|\[redacted-email\]|\[redacted-phone\]|\[redacted-case-reference\]/);

console.log("growth inbox tests passed");
