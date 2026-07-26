import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startPreviewServer } from "./test-support/preview-server-harness.mjs";

// PORTED 2026-07-26 (hygiene, extended-test triage). The old guard was
// `assert.doesNotMatch(html, /credential|token value|service role key/i)`, which matched the
// ENGLISH WORDS in the page's honest security prose ("encrypted connector credentials",
// "Raw credentials ... are not intended for logs"). It caught no secret and blocked accurate
// copy. Replaced with patterns that match credential VALUE SHAPES — provider key prefixes,
// JWTs, PEM blocks, DB URLs with inline passwords, and bare high-entropy strings. The
// positive-control block below fails the suite if any pattern ever stops catching a real
// secret shape, so this guard cannot silently rot into a vacuous one.
const CREDENTIAL_VALUE_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{16,}/, "OpenAI-style secret key"],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/, "Stripe-style key"],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, "SendGrid API key"],
  [/\bwhsec_[A-Za-z0-9]{16,}/, "webhook signing secret"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "PEM private key block"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT (Supabase anon / service-role key shape)"],
  [/\bpostgres(?:ql)?:\/\/[^\s:@"'<>]+:[^\s@"'<>]+@/i, "Postgres URL with an inline password"],
  [/(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/, "bare high-entropy secret (32+ chars, mixed case and digits)"]
];

// Positive controls: the guard must still catch every one of these, or it is not a guard.
// Every sample is deliberately self-evidently fake. scripts/test-secret-exposure.mjs scans the whole
// repo and requires any `sk-…` literal of 24+ characters to contain "test", "placeholder" or
// "redacted", and any Postgres connection URL carrying an inline password to contain "example", "placeholder",
// "redacted", "USER" or "PASSWORD". Keep those words in these samples when editing them.
for (const [sample, expectedLabel] of [
  [["sk", "proj", "placeholder0123456789AbCdEf"].join("-"), "OpenAI-style secret key"],
  [["sk", "live", "51AbCdEf0123456789AbCdEf"].join("_"), "Stripe-style key"],
  [["SG", "AbCdEf0123456789xyz", "AbCdEf0123456789xyz"].join("."), "SendGrid API key"],
  [["whsec", "AbCdEf0123456789AbCdEf01"].join("_"), "webhook signing secret"],
  [["ghp", "AbCdEf0123456789AbCdEf0123456789"].join("_"), "GitHub token"],
  [["xoxb", "1234567890", "AbCdEfGh"].join("-"), "Slack token"],
  [["AKIA", "IOSFODNN7EXAMPLE"].join(""), "AWS access key id"],
  [["AIza", "SyA1234567890abcdefghijklmnopqrstuvw"].join(""), "Google API key"],
  [["-----BEGIN RSA PRIVATE", "KEY-----"].join(" "), "PEM private key block"],
  [["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJyb2xlIjoic2VydmljZV9yb2xlIn0", "AbCdEf0123456789xyz"].join("."), "JWT (Supabase anon / service-role key shape)"],
  // Host kept on exactly example.com (no subdomain) so the repo PII gate's reserved-domain
  // allowlist recognises it and does not read "user:password@host" as a real email address.
  [["postgresql:/", "/postgres:SuperSecret123@example.com:5432/postgres"].join(""), "Postgres URL with an inline password"],
  ["Xk92LmQ4vT1bZr7NwPs3JhY6cA0dEuFg", "bare high-entropy secret (32+ chars, mixed case and digits)"]
]) {
  assert(CREDENTIAL_VALUE_PATTERNS.some(([pattern]) => pattern.test(sample)), `credential-value guard must catch a ${expectedLabel}`);
}

// Negative controls: honest security prose must never trip the guard.
for (const prose of [
  "The Command Center uses access controls, short-lived server-managed sessions, request protections, encrypted connector credentials, append-only security events, and redacted operational logs.",
  "Raw credentials and full provider payloads are not intended for logs or audit summaries.",
  "The Supabase service role key is server-side only.",
  "No token value is ever written to an audit summary."
]) {
  assert(!CREDENTIAL_VALUE_PATTERNS.some(([pattern]) => pattern.test(prose)), `credential-value guard must not flag honest security prose: ${prose.slice(0, 60)}`);
}

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const inventory = await readFile(new URL("../docs/privacy-data-inventory.md", import.meta.url), "utf8");
assert.match(source, /href="\/privacy"/);
for (const category of ["Social connectors", "Draft assets", "Security and audit", "Gmail and Calendar"]) assert(inventory.includes(category));

const server = await startPreviewServer();
try {
  const response = await fetch(`${server.baseUrl}/privacy`);
  const html = await response.text();
  assert.equal(response.status, 200);
  for (const phrase of ["Privacy Policy", "Last updated", "Data collected", "How data is used", "Storage and providers", "Access and deletion", "Draft uploads", "live gate defaults off"]) assert(html.includes(phrase), `/privacy must include ${phrase}.`);
  assert.doesNotMatch(html, /GDPR compliant|SOC 2 certified|certified compliant/i);
  for (const [pattern, label] of CREDENTIAL_VALUE_PATTERNS) {
    assert.doesNotMatch(html, pattern, `/privacy must not expose a ${label}.`);
  }
  const termsHtml = await (await fetch(`${server.baseUrl}/terms`)).text();
  for (const [pattern, label] of CREDENTIAL_VALUE_PATTERNS) {
    assert.doesNotMatch(termsHtml, pattern, `/terms must not expose a ${label}.`);
  }
} finally {
  await server.stop();
}
console.log("privacy route tests passed");
