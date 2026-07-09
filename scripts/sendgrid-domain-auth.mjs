// B2 outreach — SendGrid domain authentication driver (activation run 2026-07-09).
//
// Why this exists: cold outreach must send from a DEDICATED subdomain
// (outreach.legalease.com) so B2B cold-send reputation is isolated from the
// legalease.com domain that the live B1 reactivation campaign depends on. The
// CNAME values SendGrid requires are account-specific: only the SendGrid API,
// called with the account key, can produce them. That key exists ONLY in the
// production environment, so the server exposes this driver behind the
// admin-gated POST /api/outreach/domain-auth endpoint instead of anyone
// handling the key by hand.
//
// Scope is deliberately narrow: this module can talk to the SendGrid
// authenticated-domains API (v3/whitelabel/domains) and NOTHING else — it is
// not a general SendGrid proxy, it cannot send mail, and it never returns or
// logs the API key. Actions:
//   status   — read-only: fetch the domain's auth record + DNS records, if any.
//   create   — idempotent: return the existing record if one exists, else
//              create the authenticated domain and return the DNS records to
//              install (automatic security => 3 CNAMEs: mail + 2 DKIM).
//   validate — ask SendGrid to check the installed DNS records; returns the
//              per-record verdicts. Safe to repeat until everything is valid.
// None of these actions touches app state; the caller records the audit event.

const SENDGRID_DOMAINS_URL = "https://api.sendgrid.com/v3/whitelabel/domains";

export const DEFAULT_OUTREACH_AUTH_DOMAIN = "outreach.legalease.com";
export const DOMAIN_AUTH_ACTIONS = ["status", "create", "validate"];

const clean = (v = "") => String(v ?? "").trim();
const lower = (v = "") => clean(v).toLowerCase();

// Bare-hostname check: letters/digits/hyphens, dot-separated, no scheme, no
// path, no port. Rejects anything that could smuggle a different URL shape
// into the SendGrid query string.
const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function normalizeAuthDomain(domain = "") {
  const value = lower(domain) || DEFAULT_OUTREACH_AUTH_DOMAIN;
  if (!HOSTNAME_RE.test(value)) {
    throw new Error(`Invalid domain "${value}": expected a bare hostname like ${DEFAULT_OUTREACH_AUTH_DOMAIN}.`);
  }
  return value;
}

// Map SendGrid's domain object to the stable shape the run doc and Roger see.
// SendGrid returns dns as an object keyed by record purpose (mail_cname,
// dkim1, dkim2 with automatic security), each { valid, type, host, data }.
export function mapAuthenticatedDomain(raw = {}) {
  const dnsEntries = raw && typeof raw.dns === "object" && raw.dns ? Object.entries(raw.dns) : [];
  return {
    id: raw.id ?? null,
    domain: lower(raw.domain || ""),
    subdomain: clean(raw.subdomain || ""),
    valid: raw.valid === true,
    dns: dnsEntries.map(([record, r]) => ({
      record,
      type: lower((r || {}).type || "cname"),
      host: clean((r || {}).host || ""),
      value: clean((r || {}).data || ""),
      valid: (r || {}).valid === true
    }))
  };
}

async function sendgridRequest(fetchImpl, apiKey, url, { method = "GET", body } = {}) {
  const resp = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await resp.text().catch(() => "");
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  if (!resp.ok) {
    // Provider detail only — never the key, never the Authorization header.
    throw new Error(`SendGrid domain-auth API ${method} failed: ${resp.status} ${String(text).slice(0, 300)}`);
  }
  return parsed;
}

async function findDomainRecord(fetchImpl, apiKey, domain) {
  const listUrl = `${SENDGRID_DOMAINS_URL}?domain=${encodeURIComponent(domain)}&limit=50`;
  const listed = await sendgridRequest(fetchImpl, apiKey, listUrl);
  const rows = Array.isArray(listed) ? listed : [];
  return rows.find((r) => lower(r.domain) === domain) || null;
}

export async function runDomainAuthAction({ action = "", domain = "", env = process.env, fetchImpl = fetch } = {}) {
  const verb = lower(action);
  if (!DOMAIN_AUTH_ACTIONS.includes(verb)) {
    throw new Error(`Unknown action "${verb}": expected one of ${DOMAIN_AUTH_ACTIONS.join(", ")}.`);
  }
  const authDomain = normalizeAuthDomain(domain);
  const apiKey = clean((env || {}).SENDGRID_API_KEY);
  // Fail closed BEFORE any network contact when the key is absent.
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured in this environment.");

  const existing = await findDomainRecord(fetchImpl, apiKey, authDomain);

  if (verb === "status") {
    return existing
      ? { action: verb, found: true, domainAuth: mapAuthenticatedDomain(existing) }
      : { action: verb, found: false, domain: authDomain, domainAuth: null };
  }

  if (verb === "create") {
    if (existing) {
      // Idempotent: never create a second auth record for the same domain.
      return { action: verb, created: false, alreadyExisted: true, domainAuth: mapAuthenticatedDomain(existing) };
    }
    const created = await sendgridRequest(fetchImpl, apiKey, SENDGRID_DOMAINS_URL, {
      method: "POST",
      // automatic_security => SendGrid manages SPF/DKIM via 3 CNAMEs (the
      // copy-paste records for the DNS provider). default:false so this can
      // never displace the account's existing default sending domain (B1).
      body: { domain: authDomain, automatic_security: true, default: false }
    });
    return { action: verb, created: true, alreadyExisted: false, domainAuth: mapAuthenticatedDomain(created) };
  }

  // verb === "validate"
  if (!existing) {
    throw new Error(`No authenticated domain found for "${authDomain}": run action "create" first.`);
  }
  const verdict = await sendgridRequest(fetchImpl, apiKey, `${SENDGRID_DOMAINS_URL}/${existing.id}/validate`, { method: "POST" });
  // Re-read so callers get the post-validation record (valid flags updated).
  const fresh = await findDomainRecord(fetchImpl, apiKey, authDomain);
  return {
    action: verb,
    valid: (verdict || {}).valid === true,
    validationResults: (verdict || {}).validation_results || null,
    domainAuth: mapAuthenticatedDomain(fresh || existing)
  };
}
