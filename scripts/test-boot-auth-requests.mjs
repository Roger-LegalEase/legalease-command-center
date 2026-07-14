import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
assert.doesNotMatch(source, /localStorage\.(?:setItem|getItem)\([^)]*(?:token|credential|auth)/i);
assert.doesNotMatch(source, /sessionStorage\.(?:setItem|getItem)\([^)]*(?:token|credential|auth)/i);
assert.doesNotMatch(source, /headers\.Authorization\s*=\s*["']Bearer/i, "Browser code must not synthesize bearer credentials.");
assert.match(source, /credentials:\s*["']same-origin["']/);
assert.match(source, /x-csrf-token/i);

const server = await startPreviewServer();
try {
  const root = await fetch(`${server.baseUrl}/`);
  const html = await root.text();
  assert.equal(root.status, 200, "Unauthenticated root renders the login shell without leaking state.");
  assert.match(html, /Unlock Command Center/i);

  const protectedRoute = await jsonRequest(server.baseUrl, "/api/backups");
  assert.equal(protectedRoute.response.status, 401);

  const login = await loginOwner(server);
  const authorizedRoute = await jsonRequest(server.baseUrl, "/api/backups", { headers:{ cookie:login.cookie } });
  assert.notEqual(authorizedRoute.response.status, 401, "The session cookie must authorize protected boot requests.");
} finally {
  await server.stop();
}

console.log("Boot session request tests passed.");
