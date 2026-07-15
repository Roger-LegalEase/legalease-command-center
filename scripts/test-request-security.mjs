import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { RequestLimitError, readBoundedBody, securityHeaders } from "./request-security.mjs";

function request(chunks, headers = {}) {
  const stream = Readable.from(chunks);
  stream.headers = headers;
  return stream;
}
assert.equal((await readBoundedBody(request([Buffer.from("abcd")]), { limit:4 })).length, 4);
await assert.rejects(() => readBoundedBody(request([], { "content-length":"5" }), { limit:4 }), RequestLimitError);
await assert.rejects(() => readBoundedBody(request([Buffer.from("abc"), Buffer.from("de")]), { limit:4 }), RequestLimitError);
const prod = securityHeaders({ env:{ NODE_ENV:"production" }, html:true });
for (const name of ["content-security-policy","x-content-type-options","referrer-policy","permissions-policy","x-frame-options","strict-transport-security","cache-control"]) assert(prod[name], name);
assert(!prod["content-security-policy"].includes("unsafe-eval"));
console.log("request security tests passed");
