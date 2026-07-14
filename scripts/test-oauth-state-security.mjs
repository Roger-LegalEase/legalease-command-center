import assert from "node:assert/strict";
import { OAUTH_STATE_MAX_AGE_MS, signOAuthState, verifyOAuthState, verifyOwnerStartedOAuthState } from "./oauth-state.mjs";

const TEST_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 10_000;

async function boundedStep(name, operation, timeoutMs = STEP_TIMEOUT_MS) {
  let timeout;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${name} exceeded ${timeoutMs}ms.`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

const env = { NODE_ENV:"test", OAUTH_STATE_SECRET:["oauth", "state", "synthetic", "secret", "A9m4"].join("-") };
const now = Date.now();
const options = { ownerStarted:true, startedByRole:"owner", startedByActor:"session-a", sessionId:"session-a", callbackPath:"/api/google/callback", returnTarget:"settings" };
const state = signOAuthState("google_workspace", options, { env, now, nonce:"a".repeat(32) });
assert.equal(verifyOwnerStartedOAuthState("google_workspace", state, { env, now, sessionId:"session-a", callbackPath:"/api/google/callback" }).ok, true);
for (const invalid of [
  verifyOAuthState("google_workspace", "", { env, now }),
  verifyOAuthState("google_workspace", `${state}x`, { env, now }),
  verifyOAuthState("linkedin", state, { env, now }),
  verifyOAuthState("google_workspace", signOAuthState("google_workspace", options, { env, now:now - OAUTH_STATE_MAX_AGE_MS - 1, nonce:"b".repeat(32) }), { env, now }),
  verifyOAuthState("google_workspace", signOAuthState("google_workspace", options, { env, now:now + 61_000, nonce:"c".repeat(32) }), { env, now }),
  verifyOwnerStartedOAuthState("google_workspace", state, { env, now, sessionId:"session-b", callbackPath:"/api/google/callback" }),
  verifyOwnerStartedOAuthState("google_workspace", state, { env, now, sessionId:"session-a", callbackPath:"/api/linkedin/callback" })
]) assert.equal(invalid.ok, false);

async function runIntegrationTest() {
  const { jsonRequest, loginOwner, startPreviewServer } = await import("./test-support/preview-server-harness.mjs");
  const server = await boundedStep("preview server startup", () => startPreviewServer({ env:{
    OAUTH_STATE_SECRET:env.OAUTH_STATE_SECRET,
    OAUTH_TOKEN_ENCRYPTION_KEY:["oauth", "token", "encryption", "synthetic", "N8p2"].join("-"),
    GOOGLE_CLIENT_ID:"synthetic-client-id",
    GOOGLE_CLIENT_SECRET:["synthetic", "client", "secret", "Q7r5"].join("-"),
    GOOGLE_REDIRECT_URI:"http://127.0.0.1/api/google/callback",
    APP_BASE_URL:"http://127.0.0.1"
  } }), 20_000);
  try {
    const firstLogin = await boundedStep("first owner login", () => loginOwner(server));
    const secondLogin = await boundedStep("second owner login", () => loginOwner(server));
    const garbage = await boundedStep("garbage callback", () => jsonRequest(server.baseUrl, "/api/google/callback?state=garbage&error=access_denied", { headers:{ cookie:firstLogin.cookie }, redirect:"manual" }));
    assert.equal(garbage.response.status, 400, "Garbage state must be rejected before connector mutation.");

    const start = await boundedStep("OAuth start", () => jsonRequest(server.baseUrl, "/api/google/start?format=json", { headers:{ cookie:firstLogin.cookie } }));
    assert.equal(start.response.status, 200);
    const signedState = new URL(start.json.authorizationUrl).searchParams.get("state");
    assert(signedState);

    const crossSession = await boundedStep("cross-session callback", () => jsonRequest(server.baseUrl, `/api/google/callback?state=${encodeURIComponent(signedState)}&error=access_denied`, { headers:{ cookie:secondLogin.cookie }, redirect:"manual" }));
    assert.equal(crossSession.response.status, 400, "Cross-session state must be rejected.");

    const valid = await boundedStep("valid callback", () => fetch(`${server.baseUrl}/api/google/callback?state=${encodeURIComponent(signedState)}&error=access_denied`, {
      headers:{ cookie:firstLogin.cookie },
      redirect:"manual",
      signal:AbortSignal.timeout(STEP_TIMEOUT_MS)
    }));
    await valid.arrayBuffer();
    assert.equal(valid.status, 302, `A valid, session-bound provider cancellation may reach the safe redirect. ${server.logs()}`);
    const replay = await boundedStep("replayed callback", () => jsonRequest(server.baseUrl, `/api/google/callback?state=${encodeURIComponent(signedState)}&error=access_denied`, { headers:{ cookie:firstLogin.cookie }, redirect:"manual" }));
    assert.equal(replay.response.status, 400, "OAuth state must be single-use.");

    const ownerState = await boundedStep("owner state read", () => jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:firstLogin.cookie } }));
    assert.equal(ownerState.text.includes(signedState), false, "Raw OAuth state must never be persisted in browser state.");
  } finally {
    await boundedStep("preview server shutdown", () => server.stop());
  }
}

if (!process.argv.includes("--unit-only")) await boundedStep("OAuth integration test", runIntegrationTest, TEST_TIMEOUT_MS);
console.log("OAuth state security tests passed");
