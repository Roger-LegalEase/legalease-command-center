#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
const connectors = readFileSync(join(process.cwd(), "scripts", "channel-connectors.mjs"), "utf8");

for (const required of [
  'url.pathname === "/api/linkedin/connect"',
  'url.pathname === "/api/linkedin/callback"',
  "signOAuthState(\"linkedin\")",
  "verifyOAuthState(\"linkedin\"",
  "linkedinAuthorizationUrl({ state })",
  "exchangeLinkedInCode",
  "fetchLinkedInUserInfo",
  "LinkedIn connected. Posting still requires approval.",
  "Safe token storage is required before LinkedIn can be connected.",
  "LinkedIn connection needs setup."
]) {
  assert(source.includes(required), `LinkedIn OAuth safety should include ${required}`);
}

assert(connectors.includes("w_member_social"), "LinkedIn OAuth should request member posting scope");
assert(!connectors.includes("r_organization_social"), "LinkedIn OAuth should not request organization read scopes in this pass");
assert(!connectors.includes("w_organization_social"), "LinkedIn OAuth should not request organization posting in this pass");
assert(!connectors.includes("r_member_social"), "LinkedIn OAuth should not request analytics/read scopes in this pass");

const visibleUi = source.slice(source.indexOf("function renderAppHtml"));
for (const forbidden of [
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_TOKEN_ENCRYPTION_SECRET",
  "refresh_token",
  "access_token"
]) {
  assert(!visibleUi.includes(forbidden), `Client output should not expose ${forbidden}`);
}

console.log("linkedin oauth safety tests passed.");
