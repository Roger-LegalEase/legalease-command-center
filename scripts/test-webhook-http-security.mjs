import assert from "node:assert/strict";
import crypto from "node:crypto";
import { jsonRequest, loginOwner, startPreviewServer } from "./test-support/preview-server-harness.mjs";
import { SENDGRID_SIGNATURE_HEADER, SENDGRID_TIMESTAMP_HEADER } from "./sendgrid-webhook.mjs";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve:"prime256v1" });
const publicKeyB64 = publicKey.export({ type:"spki", format:"der" }).toString("base64");
const server = await startPreviewServer({
  env:{ SENDGRID_WEBHOOK_ENABLED:"true", SENDGRID_WEBHOOK_PUBLIC_KEY:publicKeyB64 },
  seed:{
    outreachContacts:[{ contact_id:"business-a", email:"business@example.com", sequence_status:"Enrolled" }],
    outreachSuppressions:[],
    outreachBounces:[],
    reactivationContacts:[],
    reactivationEvents:[],
    sendgridWebhookHealth:{}
  }
});

const route = "/api/outreach/webhooks/sendgrid";
function signedHeaders(body, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = crypto.sign("sha256", Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]), privateKey).toString("base64");
  return {
    "content-type":"application/json",
    [SENDGRID_SIGNATURE_HEADER]:signature,
    [SENDGRID_TIMESTAMP_HEADER]:timestamp
  };
}

try {
  const body = JSON.stringify([{ event:"bounce", email:"business@example.com", timestamp:Math.floor(Date.now() / 1000), sg_event_id:"synthetic-event-one", reason:"synthetic" }]);

  const missing = await jsonRequest(server.baseUrl, route, { method:"POST", headers:{ "content-type":"application/json" }, body });
  assert.equal(missing.response.status, 401);

  const invalid = await jsonRequest(server.baseUrl, route, { method:"POST", headers:{ ...signedHeaders(body), [SENDGRID_SIGNATURE_HEADER]:"invalid" }, body });
  assert.equal(invalid.response.status, 401);

  const modified = `${body} `;
  const tampered = await jsonRequest(server.baseUrl, route, { method:"POST", headers:signedHeaders(body), body:modified });
  assert.equal(tampered.response.status, 401);

  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 601);
  const stale = await jsonRequest(server.baseUrl, route, { method:"POST", headers:signedHeaders(body, staleTimestamp), body });
  assert.equal(stale.response.status, 401);

  const oversized = Buffer.alloc(512 * 1024 + 1, 0x20);
  const tooLarge = await jsonRequest(server.baseUrl, route, { method:"POST", headers:{ "content-type":"application/json", "content-length":String(oversized.length) }, body:oversized });
  assert.equal(tooLarge.response.status, 413);

  const validHeaders = signedHeaders(body);
  const first = await jsonRequest(server.baseUrl, route, { method:"POST", headers:validHeaders, body });
  assert.equal(first.response.status, 200);
  assert.equal(first.json.processed, 1);
  const replay = await jsonRequest(server.baseUrl, route, { method:"POST", headers:validHeaders, body });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.json.duplicate, true);
  assert.equal(replay.json.processed, 0);

  const owner = await loginOwner(server);
  const state = await jsonRequest(server.baseUrl, "/api/state", { headers:{ cookie:owner.cookie } });
  assert.equal(state.response.status, 200);
  assert.equal(state.json.outreachSuppressions.filter((item) => item.email === "business@example.com").length, 1);
  assert.equal(state.json.outreachBounces.filter((item) => item.email === "business@example.com").length, 1);

  let limited = null;
  for (let attempt = 0; attempt < 130; attempt += 1) {
    limited = await jsonRequest(server.baseUrl, route, { method:"POST", headers:{ "content-type":"application/json" }, body:"[]" });
    if (limited.response.status === 429) break;
  }
  assert.equal(limited?.response.status, 429);
  assert(Number(limited.response.headers.get("retry-after")) > 0);
} finally {
  await server.stop();
}

console.log("SendGrid HTTP security tests passed");
