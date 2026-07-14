import assert from "node:assert/strict";
import { jsonRequest, loginWithCredential, startPreviewServer } from "./test-support/preview-server-harness.mjs";

const viewerCredential = ["viewer", "integration", "credential", "2026", "V5n7"].join("-");
const canaries = {
  contact:["sensitive.person", "canary.invalid"].join("@"),
  note:"viewer-private-note-canary",
  token:"viewer-private-token-canary"
};
const server = await startPreviewServer({
  env:{ COMMAND_CENTER_VIEWER_TOKEN:viewerCredential },
  seed:{
    products:[{ id:"product-a", name:canaries.note, stage:"live" }],
    partners:[{ id:"partner-a", name:canaries.contact, status:"active" }],
    campaigns:[{ id:"campaign-a", status:"active" }],
    contacts:[{ id:"contact-a", email:canaries.contact, notes:canaries.note }],
    authSessions:[{ id:"server-only-canary", tokenHash:canaries.token }],
    funnelSnapshots:[{ screeningsStarted:3, paymentCompleted:2, revenue:100 }],
    reports:[{ id:"report-a", title:canaries.note }]
  }
});

try {
  const viewer = await loginWithCredential(server, viewerCredential);
  const deniedState = await jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:viewer.cookie } });
  assert.equal(deniedState.response.status, 403);

  const aggregate = await jsonRequest(server.baseUrl, "/api/reports/aggregate", { headers:{ cookie:viewer.cookie } });
  assert.equal(aggregate.response.status, 200);
  assert.deepEqual(Object.keys(aggregate.json).sort(), ["campaigns","funnel","generatedAt","partners","products","reports"].sort());
  const serialized = JSON.stringify(aggregate.json);
  for (const value of Object.values(canaries)) assert.equal(serialized.includes(value), false);

  for (const pathname of ["/api/boot-state", "/api/storage/debug", "/api/auth/diagnostics", "/data/backups/synthetic.json", "/assets/uploads/synthetic.png"]) {
    const result = await jsonRequest(server.baseUrl, pathname, { headers:{ cookie:viewer.cookie } });
    assert.equal(result.response.status, 403, pathname);
  }
} finally {
  await server.stop();
}

console.log("RBAC HTTP exposure tests passed");
