import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

// Phase N: Le-E left the top nav but must stay reachable everywhere (Roger requirement):
// the persistent bubble renders on every page and the chat page is indexed under More.
assert.match(server, /\$\{leeBubbleHtml\(\)\}/, "Le-E bubble should render on every page.");
assert.match(server, /\["Le-E chat page", "lee"\]/, "Le-E chat page should be indexed in the More directory.");
assert.match(server, /function leePageHtml\(pageClass\)/, "Le-E route should render a chat page.");
assert.match(server, /function leeBubbleHtml\(\)/, "Le-E should render a persistent chat bubble.");
assert.match(server, /class="lee-bubble-wrap"/, "Le-E v3.1 pill wrapper should be present.");
assert.match(server, /class="lee-pill"/, "Le-E v3.1 pill should be present.");
assert.match(server, /class="lee-panel"/, "Le-E v3.1 panel should be present.");
assert.match(server, /class="lee-context"/, "Le-E panel should include a contextual card.");
assert.match(server, /class="lee-input-row"/, "Le-E panel should keep the input visible.");
assert.match(server, /aria-label="Ask Le-E"/, "Le-E bubble should have an accessible Ask Le-E label.");
assert.match(server, /function openLeeBubble\(\)/, "Le-E bubble should have an open handler.");
assert.match(server, /function closeLeeBubble\(\)/, "Le-E bubble should have a close handler.");
assert.match(server, /leeBubbleOpen = true/, "Le-E prompt flow should open the bubble instead of navigating away.");
assert.match(server, /id="lee"/, "Le-E page section should use #lee.");
assert.match(server, /POST" && request\.method === "POST"|\/api\/lee\/chat/, "Le-E chat endpoint should exist.");
assert.match(server, /\/api\/lee\/status/, "Le-E status endpoint should exist.");
assert.match(server, /\/api\/lee\/search/, "Le-E search endpoint should exist.");
assert.match(server, /\/api\/lee\/index\/rebuild/, "Le-E index rebuild endpoint should exist.");
assert.match(server, /leeActionProposals/, "Le-E action proposals should be in UI/server state.");
assert.match(server, /applyLeeAction/, "Le-E action proposal cards should support applying safe actions.");
assert.match(server, /forbidden|proposal-only|proposal_only/i, "Le-E UI/API should preserve dangerous/forbidden action language.");
assert.match(server, /Ask what matters, create a task, or find something in LegalEase/, "Le-E Simple Mode should have short helper text.");
assert.match(server, /class="lee-simple"/, "Le-E should render Simple Mode by default.");
assert.match(server, /<details class="lee-advanced">/, "Bubble Advanced mode should be collapsed behind details.");
assert.match(server, /Plan my day/, "Le-E Simple Mode should show the Plan my day quick prompt.");
assert.match(server, /What needs me\?/, "Le-E Simple Mode should show the What needs me quick prompt.");
assert.match(server, /Create tasks/, "Le-E Simple Mode should show the Create tasks quick prompt.");
assert.match(server, /Draft with Le-E|Plan my day/, "Le-E pill should keep short contextual actions.");
assert.match(server, /leeAdvanced \? "" : "hidden"/, "Advanced mode should be hidden by default.");
assert.match(server, /Sources: /, "Simple Mode should collapse sources into a count.");
assert.match(server, /Show details/, "Long answers should have collapsed details.");
assert.ok(server.includes("/^\\\\s*Sources:/i"), "Simple Mode should strip source lines from the visible short answer.");
assert.ok(server.includes("/^\\\\s*Why it matters/i"), "Simple Mode should remove the why section from the visible short answer.");
assert.match(server, /Apply safe change/, "Le-E proposal cards should distinguish safe apply from approval.");
assert.match(server, /Proposal only\. Review and route/, "Le-E proposal cards should explain approval-required actions.");
assert.match(server, /Checking Command Center memory and safety rules/, "Le-E should show a useful loading state.");
assert.match(server, /safeMessage/, "Le-E endpoints should return safe error messages.");
assert.doesNotMatch(server, /<h2>Start here<\/h2>/, "Simple Mode should not show the old onboarding sidebar.");
assert.match(server, /run:\(\) => \{ openLeeBubble\(\); \}/, "Command palette Ask Le-E should open the bubble.");

console.log("Le-E UI tests passed");
