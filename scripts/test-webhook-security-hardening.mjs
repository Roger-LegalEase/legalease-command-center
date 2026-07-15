import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sendgridBatchDigest, sendgridEventDigest, verifySendGridSignature } from "./sendgrid-webhook.mjs";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve:"prime256v1" });
const env = { SENDGRID_WEBHOOK_PUBLIC_KEY:publicKey.export({ type:"spki", format:"der" }).toString("base64") };
const now = Date.now();
const timestamp = String(Math.floor(now / 1000));
const body = Buffer.from(JSON.stringify([{ event:"delivered", email:"recipient@example.com", timestamp:Math.floor(now / 1000), sg_event_id:"synthetic-event" }]));
const signature = crypto.sign("sha256", Buffer.concat([Buffer.from(timestamp), body]), privateKey).toString("base64");
assert.equal(verifySendGridSignature({ env, rawBody:body, signature, timestamp, now }).verified, true);
for (const result of [
  verifySendGridSignature({ env:{}, rawBody:body, signature, timestamp, now }),
  verifySendGridSignature({ env, rawBody:body, signature:"malformed", timestamp, now }),
  verifySendGridSignature({ env, rawBody:Buffer.concat([body, Buffer.from(" ")]), signature, timestamp, now }),
  verifySendGridSignature({ env, rawBody:body, signature, timestamp:String(Math.floor(now / 1000) - 1000), now })
]) assert.equal(result.rejected, true);
assert.equal(sendgridBatchDigest(body, timestamp), sendgridBatchDigest(body, timestamp));
assert.equal(sendgridEventDigest({ sg_event_id:"same", event:"bounce" }), sendgridEventDigest({ sg_event_id:"same", event:"bounce", reason:"ignored" }));
assert(!JSON.stringify(verifySendGridSignature({ env, rawBody:body, signature:"bad", timestamp, now })).includes(env.SENDGRID_WEBHOOK_PUBLIC_KEY));
console.log("webhook security hardening tests passed");
