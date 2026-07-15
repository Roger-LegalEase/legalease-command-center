import crypto from "node:crypto";
import { isHostedProduction } from "./runtime-security.mjs";

export const REQUEST_LIMITS = Object.freeze({
  json: 256 * 1024,
  webhook: 512 * 1024,
  image: 12 * 1024 * 1024,
  import: 2 * 1024 * 1024
});

export class RequestLimitError extends Error {
  constructor(message = "Request body is too large.") {
    super(message);
    this.name = "RequestLimitError";
    this.status = 413;
  }
}

export async function readBoundedBody(request, { limit = REQUEST_LIMITS.json } = {}) {
  const declared = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > limit) throw new RequestLimitError();
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limit) {
      request.destroy?.();
      throw new RequestLimitError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

export async function readBoundedJson(request, options = {}) {
  const body = await readBoundedBody(request, options);
  if (!body.length) return {};
  try { return JSON.parse(body.toString("utf8")); }
  catch { const error = new Error("Request body must be valid JSON."); error.status = 400; throw error; }
}

export function requestId(request = {}) {
  const supplied = String(request.headers?.["x-request-id"] || "");
  return /^[A-Za-z0-9._:-]{8,96}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function securityHeaders({ env = process.env, html = false, sensitive = true } = {}) {
  const headers = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": sensitive ? "no-store, max-age=0" : "private, max-age=60"
  };
  if (html) {
    // The legacy shell still contains inline code. Hash/nonces are the follow-up path; object,
    // frame, worker, and network destinations are already constrained here.
    headers["content-security-policy"] = "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'none'; worker-src 'none'";
  }
  if (isHostedProduction(env)) headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  return headers;
}

export function safeWriteHead(response, status, headers = {}, options = {}) {
  response.writeHead(status, { ...securityHeaders(options), ...headers });
}
