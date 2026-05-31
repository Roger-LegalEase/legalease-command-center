import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

function blockBetween(startPattern, endPattern) {
  const start = source.search(startPattern);
  assert(start >= 0, `Missing block start: ${startPattern}`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert(end > 0, `Missing block end: ${endPattern}`);
  return rest.slice(0, end);
}

const nav = source.match(/<nav class="sidebar-nav top-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const social = blockBetween(/function marketingPageHtml\(pageClass\)/, /function dataRoomWorkspaceHtml/);
const today = blockBetween(/function commandCenterOverviewHtml\(posts\)/, /function focusItemsForMode/);
const todaySocialCard = blockBetween(/function socialContentCardHtml\(\)/, /function commandCenterOverviewHtml/);
const proof = blockBetween(/function proofPageHtml\(pageClass\)/, /function sectionLandingConfig/);

const navLabels = [...nav.matchAll(/data-nav-section="[^"]+"[\s\S]*?<span class="label">([^<]+)/g)].map(match => match[1].trim());
assert.deepEqual(navLabels, ["Today", "Work", "Marketing", "Data Room", "Partnerships", "KPIs", "Proof", "Search"], "Main nav should be the commercial founder workflow.");
assert.match(source, /href="#settings"/, "Settings should remain reachable through a secondary control.");

for (const route of ["social", "social-media", "content-calendar", "posts"]) {
  assert(source.includes(route === "social" ? '"social"' : `"${route}"`), `#${route} should be registered or aliased.`);
}
assert.match(source, /\["social", "social-media", "content-calendar", "posts"\]\.includes\(requestedPage\)[\s\S]*?\?\s*"marketing"/, "Social aliases should render the Marketing workspace.");
assert.match(source, /safeRenderModule\("marketing", \(\) => marketingPageHtml\(pageClass\)\)/, "#marketing should render Marketing workspace.");

for (const label of [
  "Marketing",
  "Run content, social, PR, campaigns, and manual publishing from one place.",
  "Social Media Manager",
  "PR Outreach",
  "Post Ideas",
  "Draft Posts",
  "Content Calendar",
  "Ready to Publish",
  "Proof to Share",
  "Manual Publishing Checklist",
  "Add idea",
  "Turn into draft",
  "Create post",
  "Preview",
  "Edit",
  "Add planned post",
  "Move date",
  "Copy post",
  "Publish manually",
  "Mark published manually",
  "Turn into post",
  "Save as idea",
  "Publishing is off",
  "Nothing has been published by the OS"
]) {
  assert(social.includes(label), `Social workspace should include ${label}.`);
}

for (const fn of [
  "createSocialPost",
  "addSocialIdea",
  "turnSocialIdeaIntoDraft",
  "previewSocialPost",
  "editSocialPost",
  "addPlannedPost",
  "movePlannedPostDate",
  "copySocialPost",
  "openManualPublishChecklist",
  "markSocialPostManuallyPublished",
  "turnProofIntoPost",
  "saveProofAsPostIdea",
  "createInternalSocialRecord",
  "updateInternalSocialRecord"
]) {
  assert(source.includes(`function ${fn}`) || source.includes(`async function ${fn}`), `${fn} should exist.`);
}

for (const forbidden of [
  "API status",
  "OAuth",
  "token",
  "webhook",
  "provider adapter",
  "queue",
  "external action dispatcher",
  "compliance score",
  "risk score",
  "campaign complexity",
  "Run Ad",
  "automation engine",
  "live gate",
  "RCAP",
  "Production Activation"
]) {
  assert(!social.includes(forbidden), `Social workspace should not show ${forbidden}.`);
}

assert.equal((today.match(/socialContentCardHtml\(\)/g) || []).length, 1, "Today should include exactly one Marketing / Content card.");
assert(todaySocialCard.includes('aria-label="Marketing / Content"'), "Today card should render Marketing / Content.");
assert(todaySocialCard.includes("Create post"), "Today Social card should offer Create post.");
assert(todaySocialCard.includes("Open Marketing"), "Today card should offer Open Marketing.");
assert(proof.includes("Turn into post"), "Proof should turn proof into a post.");
assert(proof.includes("Save as post idea"), "Proof should save proof as a post idea.");
assert(proof.includes("Open Social") || proof.includes("Open Marketing"), "Proof should link to Marketing/Social.");
assert(/liveGatesCount[^,\n]*0|Publishing is off/i.test(source), "Publishing-off/live-gates-0 signal should remain present.");
assert(source.includes("/api/social/create"), "Social create endpoint should exist.");
assert(source.includes("/api/social/update"), "Social update endpoint should exist.");
assert(source.includes("auditHistory") && source.includes("activityEvents"), "Social actions should record internal audit/activity entries.");

console.log("social workspace tests passed");
