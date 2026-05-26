import assert from "node:assert/strict";
import {
  classifyGrowthInboxText,
  convertGrowthInboxItem,
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

const ignored = convertGrowthInboxItem(partnerItem, "ignore", { reason: "Already handled on partner call." });
assert.equal(ignored.item.status, "ignored");
assert.equal(ignored.item.ignoreReason, "Already handled on partner call.");

console.log("growth inbox tests passed");
