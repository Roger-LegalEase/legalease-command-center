import assert from "node:assert/strict";
import {
  classifyGrowthInboxText,
  convertGrowthInboxItem,
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

console.log("growth inbox tests passed");
