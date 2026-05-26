import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "preview-server.mjs"), "utf8");

assert.match(server, /href="#lee">Ask Le-E/, "Le-E should be reachable from nav.");
assert.match(server, /function leePageHtml\(pageClass\)/, "Le-E route should render a chat page.");
assert.match(server, /id="lee"/, "Le-E page section should use #lee.");
assert.match(server, /POST" && request\.method === "POST"|\/api\/lee\/chat/, "Le-E chat endpoint should exist.");
assert.match(server, /\/api\/lee\/status/, "Le-E status endpoint should exist.");
assert.match(server, /\/api\/lee\/search/, "Le-E search endpoint should exist.");
assert.match(server, /\/api\/lee\/index\/rebuild/, "Le-E index rebuild endpoint should exist.");
assert.match(server, /leeActionProposals/, "Le-E action proposals should be in UI/server state.");
assert.match(server, /applyLeeAction/, "Le-E action proposal cards should support applying safe actions.");
assert.match(server, /forbidden|proposal-only|proposal_only/i, "Le-E UI/API should preserve dangerous/forbidden action language.");
assert.match(server, /Ask Le-E anything about the operating system/, "Le-E should include an empty state.");

console.log("Le-E UI tests passed");
