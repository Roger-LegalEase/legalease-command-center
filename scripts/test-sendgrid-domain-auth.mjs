// B2 outreach — SendGrid domain-auth driver tests (activation run 2026-07-09).
// Proves the narrow contract of scripts/sendgrid-domain-auth.mjs before it fronts the
// production SendGrid key behind POST /api/outreach/domain-auth:
//   1. Unknown actions and non-hostname domains are rejected BEFORE any network contact.
//   2. Missing SENDGRID_API_KEY fails closed with zero fetch calls.
//   3. create on a fresh domain lists first, then POSTs the exact isolation payload
//      (automatic_security true, default false so B1's default domain can never be displaced)
//      and returns the mapped DNS records.
//   4. create is idempotent: an existing record short-circuits with NO write call.
//   5. status is read-only (one GET) for both found and not-found.
//   6. validate targets /{id}/validate, returns per-record verdicts plus the refreshed
//      record, and refuses to validate a domain that was never created.
//   7. The API key never appears in results or error text (non-ok provider responses).
// No live network: fetch is a recording mock. Nothing here contacts SendGrid.

import assert from "node:assert";
import {
  runDomainAuthAction, normalizeAuthDomain, mapAuthenticatedDomain, DEFAULT_OUTREACH_AUTH_DOMAIN
} from "./sendgrid-domain-auth.mjs";

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed += 1; };
console.log("SendGrid domain-auth driver tests");

const KEY = "SG.super-secret-test-key-9911";
const ENV = { SENDGRID_API_KEY: KEY };

const sgDomain = (over = {}) => ({
  id: 4242,
  domain: "outreach.legalease.com",
  subdomain: "em4242",
  valid: false,
  dns: {
    mail_cname: { valid: false, type: "cname", host: "em4242.outreach.legalease.com", data: "u1234.wl.sendgrid.net" },
    dkim1: { valid: false, type: "cname", host: "s1._domainkey.outreach.legalease.com", data: "s1.domainkey.u1234.wl.sendgrid.net" },
    dkim2: { valid: false, type: "cname", host: "s2._domainkey.outreach.legalease.com", data: "s2.domainkey.u1234.wl.sendgrid.net" }
  },
  ...over
});

// Recording fetch mock: route(url, {method}) -> { status, body } looked up per call.
function mockFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    calls.push({ url: String(url), method, body: opts.body ? JSON.parse(opts.body) : undefined, headers: opts.headers || {} });
    const hit = routes.find((r) => String(url).startsWith(r.url) && (r.method || "GET") === method);
    if (!hit) throw new Error(`Unrouted mock fetch: ${method} ${url}`);
    const status = hit.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(hit.body ?? null) };
  };
  return { impl, calls };
}

const LIST_URL = "https://api.sendgrid.com/v3/whitelabel/domains?domain=";
const BASE_URL = "https://api.sendgrid.com/v3/whitelabel/domains";

// ---- 1. input validation before network --------------------------------------------------------
{
  const { impl, calls } = mockFetch([]);
  await assert.rejects(
    () => runDomainAuthAction({ action: "delete", env: ENV, fetchImpl: impl }),
    /Unknown action/
  );
  await assert.rejects(
    () => runDomainAuthAction({ action: "create", domain: "https://evil.example/path", env: ENV, fetchImpl: impl }),
    /Invalid domain/
  );
  await assert.rejects(
    () => runDomainAuthAction({ action: "create", domain: "outreach.legalease.com/extra", env: ENV, fetchImpl: impl }),
    /Invalid domain/
  );
  assert.equal(calls.length, 0, "validation failures must not reach the network");
  assert.equal(normalizeAuthDomain(""), DEFAULT_OUTREACH_AUTH_DOMAIN, "empty domain falls back to the dedicated outreach subdomain");
  assert.equal(normalizeAuthDomain("Outreach.LegalEase.com"), "outreach.legalease.com");
  ok("unknown actions and non-hostname domains rejected pre-network; default domain is the outreach subdomain");
}

// ---- 2. missing key fails closed ----------------------------------------------------------------
{
  const { impl, calls } = mockFetch([]);
  await assert.rejects(
    () => runDomainAuthAction({ action: "status", env: {}, fetchImpl: impl }),
    /SENDGRID_API_KEY is not configured/
  );
  assert.equal(calls.length, 0, "no key => zero network calls");
  ok("missing SENDGRID_API_KEY fails closed before any network contact");
}

// ---- 3. create on a fresh domain ----------------------------------------------------------------
{
  const { impl, calls } = mockFetch([
    { url: LIST_URL, method: "GET", body: [] },
    { url: BASE_URL, method: "POST", body: sgDomain() }
  ]);
  const result = await runDomainAuthAction({ action: "create", env: ENV, fetchImpl: impl });
  assert.equal(result.created, true);
  assert.equal(result.alreadyExisted, false);
  const post = calls.find((c) => c.method === "POST");
  assert.deepEqual(post.body, { domain: "outreach.legalease.com", automatic_security: true, default: false },
    "isolation payload: automatic security CNAMEs, never the account default domain");
  assert.equal(result.domainAuth.id, 4242);
  assert.equal(result.domainAuth.dns.length, 3, "automatic security yields 3 CNAME records");
  const hosts = result.domainAuth.dns.map((r) => r.host);
  assert(hosts.includes("s1._domainkey.outreach.legalease.com") && hosts.includes("em4242.outreach.legalease.com"));
  assert(result.domainAuth.dns.every((r) => r.type === "cname" && r.value.endsWith("wl.sendgrid.net")));
  ok("create lists first, POSTs the exact isolation payload, returns 3 mapped CNAME records");
}

// ---- 4. create is idempotent --------------------------------------------------------------------
{
  const { impl, calls } = mockFetch([
    { url: LIST_URL, method: "GET", body: [sgDomain()] }
  ]);
  const result = await runDomainAuthAction({ action: "create", env: ENV, fetchImpl: impl });
  assert.equal(result.created, false);
  assert.equal(result.alreadyExisted, true);
  assert.equal(result.domainAuth.id, 4242);
  assert.equal(calls.filter((c) => c.method === "POST").length, 0, "existing record => no create call");
  ok("create is idempotent: existing auth record short-circuits with zero write calls");
}

// ---- 5. status ----------------------------------------------------------------------------------
{
  const found = mockFetch([{ url: LIST_URL, method: "GET", body: [sgDomain({ valid: true })] }]);
  const hit = await runDomainAuthAction({ action: "status", env: ENV, fetchImpl: found.impl });
  assert.equal(hit.found, true);
  assert.equal(hit.domainAuth.valid, true);
  assert.equal(found.calls.length, 1, "status is exactly one GET");

  const missing = mockFetch([{ url: LIST_URL, method: "GET", body: [] }]);
  const miss = await runDomainAuthAction({ action: "status", env: ENV, fetchImpl: missing.impl });
  assert.equal(miss.found, false);
  assert.equal(miss.domainAuth, null);
  ok("status is a single read-only GET for both found and not-found");
}

// ---- 6. validate --------------------------------------------------------------------------------
{
  const { impl, calls } = mockFetch([
    { url: LIST_URL, method: "GET", body: [sgDomain()] },
    { url: `${BASE_URL}/4242/validate`, method: "POST", body: { id: 4242, valid: true, validation_results: { mail_cname: { valid: true }, dkim1: { valid: true }, dkim2: { valid: true } } } }
  ]);
  const result = await runDomainAuthAction({ action: "validate", env: ENV, fetchImpl: impl });
  assert.equal(result.valid, true);
  assert(result.validationResults && result.validationResults.dkim1.valid === true);
  assert(calls.some((c) => c.method === "POST" && c.url.endsWith("/4242/validate")));

  const empty = mockFetch([{ url: LIST_URL, method: "GET", body: [] }]);
  await assert.rejects(
    () => runDomainAuthAction({ action: "validate", env: ENV, fetchImpl: empty.impl }),
    /run action "create" first/
  );
  assert.equal(empty.calls.filter((c) => c.method === "POST").length, 0, "nothing to validate => no validate call");
  ok("validate targets /{id}/validate, returns per-record verdicts, refuses a never-created domain");
}

// ---- 7. the key never leaks ---------------------------------------------------------------------
{
  const good = mockFetch([{ url: LIST_URL, method: "GET", body: [sgDomain()] }]);
  const result = await runDomainAuthAction({ action: "status", env: ENV, fetchImpl: good.impl });
  assert(!JSON.stringify(result).includes(KEY), "result payload must never contain the API key");

  const bad = mockFetch([{ url: LIST_URL, method: "GET", status: 401, body: { errors: [{ message: "authorization required" }] } }]);
  await assert.rejects(
    () => runDomainAuthAction({ action: "status", env: ENV, fetchImpl: bad.impl }),
    (err) => {
      assert(!String(err.message).includes(KEY), "error text must never contain the API key");
      assert(/401/.test(err.message), "provider status surfaces for diagnosis");
      return true;
    }
  );
  ok("API key never appears in results or error text; provider status surfaces");
}

// ---- 8. mapping tolerates sparse provider payloads ---------------------------------------------
{
  const mapped = mapAuthenticatedDomain({ id: 7, domain: "OUTREACH.LEGALEASE.COM" });
  assert.equal(mapped.domain, "outreach.legalease.com");
  assert.deepEqual(mapped.dns, [], "missing dns object maps to an empty record list, not a crash");
  assert.equal(mapped.valid, false);
  ok("mapping tolerates sparse provider payloads");
}

console.log(`\nAll ${passed} SendGrid domain-auth checks passed.`);
