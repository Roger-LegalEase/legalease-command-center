import assert from "node:assert/strict";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const server = await startPreviewServer();
try {
  const missing = await jsonRequest(server.baseUrl, "/api/state");
  assert.equal(missing.response.status, 401, "A missing session must be denied.");

  const obsoleteBearer = await jsonRequest(server.baseUrl, "/api/state", {
    headers:{ authorization:`Bearer ${server.ownerCredential}` }
  });
  assert.equal(obsoleteBearer.response.status, 401, "A legacy static bearer credential must be denied.");

  const login = await loginOwner(server);
  assert.match(login.setCookie, /leos_session=[^;]+;[^,]*HttpOnly/i, "Session cookie must be HttpOnly.");
  assert.doesNotMatch(login.setCookie, /leos_csrf=[^,]*HttpOnly/i, "The double-submit CSRF cookie must remain readable by the app.");

  const state = await jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:login.cookie } });
  assert.equal(state.response.status, 200, "A valid server-managed session must fetch owner state.");
  assert.equal(Object.values(state.json.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length, 0);
  for (const serverOnly of ["authSessions", "webhookReplayClaims", "oauthStateClaims", "securityMetrics"]) {
    assert.equal(Object.hasOwn(state.json, serverOnly), false, `${serverOnly} must never enter the browser state graph.`);
  }

  const noCsrf = await jsonRequest(server.baseUrl, "/api/runway-inputs", {
    method:"POST",
    headers:{ cookie:login.cookie, "content-type":"application/json" },
    body:"{}"
  });
  assert.equal(noCsrf.response.status, 403, "Session mutations without CSRF proof must fail.");

  const mutation = await jsonRequest(server.baseUrl, "/api/runway-inputs", {
    method:"POST",
    headers:{ cookie:login.cookie, "content-type":"application/json", "x-csrf-token":login.csrfToken },
    body:JSON.stringify({ currentCashBalance:100, monthlyBurn:10 })
  });
  assert.equal(mutation.response.status, 200, "A session mutation with matching CSRF proof must succeed.");

  const logout = await jsonRequest(server.baseUrl, "/api/auth/logout", {
    method:"POST",
    headers:{ cookie:login.cookie, "x-csrf-token":login.csrfToken }
  });
  assert.equal(logout.response.status, 200);
  const afterLogout = await jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:login.cookie } });
  assert.equal(afterLogout.response.status, 401, "Logout must revoke the server-side session.");
} finally {
  await server.stop();
}

console.log("State fetch session boot tests passed.");
