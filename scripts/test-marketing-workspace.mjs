import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

assert.match(source, /"marketing"/, "#marketing should be registered.");
assert.match(source, /\["social", "social-media", "content-calendar", "posts"\]\.includes\(requestedPage\)[\s\S]*?\?\s*"marketing"/, "Social aliases should render Marketing.");
for (const label of [
  "Marketing Overview",
  "Social Media Manager",
  "Post Ideas",
  "Drafts",
  "Content Calendar",
  "Ready to Publish",
  "Manually Published",
  "PR Outreach",
  "Campaigns",
  "Marketing Stats",
  "Publishing is off",
  "Nothing has been published by the OS"
]) {
  assert(source.includes(label), `Marketing workspace should include ${label}.`);
}
assert.match(source, /openManualPublishChecklist/, "Publish manually should open the manual checklist.");
assert.match(source, /markSocialPostManuallyPublished/, "Mark published manually should record internal status.");
assert.doesNotMatch(source.match(/function marketingPageHtml[\s\S]*?function dataRoomWorkspaceHtml/)?.[0] || "", /publish-now|\/api\/posts\/.*publish|provider adapter|OAuth|token|webhook|boost|Run Ad/i, "Normal Marketing UI should not expose live posting/provider controls.");

console.log("marketing workspace tests passed");
