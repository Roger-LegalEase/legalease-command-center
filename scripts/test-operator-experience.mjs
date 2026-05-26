import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

assert.match(server, /function commandCenterOverviewHtml\(posts\)/, "Today surface should replace the old Overview renderer in place.");
assert.match(server, /Today’s 3 Priorities/, "Today page should surface exactly the top operating priorities.");
assert.match(server, /Capture a partner update, task, idea, meeting note, or concern/, "Quick Capture should be visible on Today.");
assert.match(server, /function quickCapture\(event\)/, "Quick Capture should have a dedicated submit handler.");
assert.match(server, /api\("\/api\/growth-inbox"/, "Quick Capture should create Growth Inbox items.");
assert.match(server, /function focusPageHtml\(pageClass\)/, "Focus Mode page should render through the app shell.");
assert.match(server, /data-nav-section="today"><summary>Today<\/summary>/, "Simplified nav should expose Today.");
assert.match(server, /data-nav-section="growth"><summary>Growth<\/summary>/, "Simplified nav should expose Growth.");
assert.match(server, /data-nav-section="partners"><summary>Partners<\/summary>/, "Simplified nav should expose Partners.");
assert.match(server, /data-nav-section="production"><summary>Production<\/summary>/, "Simplified nav should expose Production.");
assert.match(server, /data-nav-section="proof"><summary>Proof<\/summary>/, "Simplified nav should expose Proof.");
assert.match(server, /data-nav-section="more"><summary>More<\/summary>/, "Simplified nav should expose More.");
assert.equal((server.match(/data-nav-section="/g) || []).length, 6, "Top navigation should have exactly six visible sections.");
assert.match(server, /class="lee-bubble-button"/, "Le-E should be available as a bottom-right bubble.");
assert.match(server, /openLeeBubble\(\)">Ask Le-E<\/button>/, "Today should open the Le-E bubble instead of navigating to a full page.");
assert.match(server, /Inbox Triage/, "Focus Mode should include Inbox Triage.");
assert.match(server, /Partner Follow-Up/, "Focus Mode should include Partner Follow-Up.");
assert.match(server, /Content Approval/, "Focus Mode should include Content Approval.");
assert.match(server, /Proposal Review/, "Focus Mode should include Proposal Review.");
assert.match(server, /Weekly Report/, "Focus Mode should include Weekly Report.");
assert.match(server, /Evidence Pack/, "Focus Mode should include Evidence Pack.");
assert.match(server, /Clear Blockers/, "Focus Mode should include Clear Blockers.");
assert.match(server, /"focus"/, "Focus route should be included in the render whitelist.");
assert.doesNotMatch(server, /Overview Approval Summary v1/, "Today should not keep the old Overview approval summary marker.");
assert.doesNotMatch(server, /overview-approval-queue/, "Today should not render approval queue cards or summary blocks.");
assert.doesNotMatch(server, /href="#lee">Ask Le-E/, "Top navigation should not expose Ask Le-E.");

console.log("operator experience tests passed");
