import { permissionForRequest } from "./access-control.mjs";

const publicSafePaths = new Set([
  "GET /api/health",
  "GET /api/auth/diagnostics",
  "GET /api/debug/env",
  "GET /api/storage/debug",
  "GET /api/storage/diagnostics"
]);

const endpointPurpose = [
  [/^GET \/api\/health$/, "Public-safe health summary without secrets."],
  [/^GET \/api\/auth\/diagnostics$/, "Safe owner-token diagnostics without token values."],
  [/^GET \/api\/state$/, "Read current Command Center state."],
  [/^GET \/api\/ui\/search$/, "Search authorized Command Center records without returning full records or actions."],
  [/^GET \/api\/operator-search$/, "Search internal LegalEase OS records."],
  [/^POST \/api\/operator-search\/action$/, "Run internal command palette safe actions."],
  [/^GET \/api\/os-health$/, "Read OS Health snapshot."],
  [/^POST \/api\/os-health\/refresh$/, "Refresh internal OS Health snapshot."],
  [/^GET \/api\/smoke-test$/, "Read internal post-deploy Smoke Test Center status."],
  [/^POST \/api\/smoke-test\/start$/, "Start an internal smoke test run."],
  [/^POST \/api\/smoke-test\/[^/]+\/item$/, "Update an internal smoke test checklist item."],
  [/^POST \/api\/smoke-test\/[^/]+\/save$/, "Save an internal smoke test run."],
  [/^POST \/api\/smoke-test\/[^/]+\/finish$/, "Finish an internal smoke test run."],
  [/^GET \/api\/evidence-room$/, "Read internal Evidence Room index and summary."],
  [/^POST \/api\/evidence-room\/summary$/, "Generate an internal review-only Evidence Summary."],
  [/^GET \/api\/data-integrity$/, "Read Data Integrity snapshot and inventory."],
  [/^POST \/api\/data-integrity\/refresh$/, "Refresh internal Data Integrity snapshot."],
  [/^GET \/api\/operating-memory\/today$/, "Read today's Operating Memory."],
  [/^POST \/api\/operating-memory\/today\/save$/, "Save today's Operating Memory internally."],
  [/^GET \/api\/email\/status$/, "Read email readiness without contacting email services."],
  [/^GET \/api\/email\/inbox-summary$/, "Read internal email summary placeholders or imported summaries only."],
  [/^GET \/api\/email\/follow-ups$/, "Read internal email follow-up placeholders or imported summaries only."],
  [/^POST \/api\/email\/draft$/, "Prepare an internal email draft for review without sending."],
  [/^GET \/api\/production-activation\/rcap$/, "Read internal RCAP activation status."],
  [/^POST \/api\/production-activation\/rcap\/start$/, "Start review-only RCAP activation workflow."],
  [/^POST \/api\/production-activation\/rcap\/review-state$/, "Update RCAP review state internally."],
  [/^POST \/api\/production-activation\/rcap\/handoff-packet$/, "Generate internal RCAP handoff packet."],
  [/^POST \/api\/tasks\/rebuild$/, "Rebuild internal task recommendations."],
  [/^POST \/api\/posts\/:id\/publish-now$/, "Blocked live publish attempt."],
  [/^POST \/api\/publishing\/run$/, "Run the scheduled publishing worker; live gates still decide whether any channel can publish."],
  [/^POST \/api\/backups\/restore$/, "Blocked destructive restore endpoint."],
  [/^POST \/api\/channels\/connect$/, "Blocked channel/external connector action unless explicitly configured."]
];

const forbiddenEndpointRules = [
  {
    id: "send-email",
    label: "send email",
    pattern: /\/api\/(?:email|mail)\/(?:send|send-now|forward|delete|archive|label|modify)|\/api\/gmail\/send|send[-_]?email/i,
    reason: "Email sending is forbidden from the Command Center hardening layer."
  },
  {
    id: "publish-post",
    label: "publish post",
    pattern: /\/api\/posts\/[^/]+\/publish-now|publish[-_]?post/i,
    reason: "Live publishing is blocked while live gates remain 0."
  },
  {
    id: "publish-partner-page",
    label: "publish partner page",
    pattern: /publish[-_]?partner[-_]?page|partner[-_]?page.*publish/i,
    reason: "Partner page publishing requires manual external approval outside this OS."
  },
  {
    id: "activate-dashboard",
    label: "activate dashboard",
    pattern: /activate[-_]?dashboard|dashboard.*activate/i,
    reason: "Dashboard activation is not allowed from the internal OS."
  },
  {
    id: "change-live-gates",
    label: "change live gates",
    pattern: /live[-_]?gates?\/?(enable|change|update)|change[-_]?live[-_]?gates/i,
    reason: "Live gate changes require explicit manual approval."
  },
  {
    id: "destructive-restore",
    label: "destructive restore",
    pattern: /\/api\/backups\/restore|destructive[-_]?restore/i,
    reason: "Destructive restore is blocked. Use restore dry-run only."
  },
  {
    id: "partner-journey-call",
    label: "call Partner Journey API",
    pattern: /partner[-_]?journey.*(api|call)|\/api\/partner-journey/i,
    reason: "Partner Journey systems are not contacted by this OS."
  }
];

function normalizePath(pathname = "") {
  return String(pathname || "").replace(/\/api\/posts\/[^/]+\/publish-now$/, "/api/posts/:id/publish-now");
}

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function endpointRisk(method = "GET", path = "") {
  const key = `${method} ${path}`;
  if (publicSafePaths.has(key)) return "low";
  if (/restore|publish|channels|oauth|debug/.test(path)) return "critical";
  if (method !== "GET") return "medium";
  return "low";
}

function endpointPurposeFor(method = "GET", path = "") {
  const key = `${method} ${path}`;
  return endpointPurpose.find(([pattern]) => pattern.test(key))?.[1] || (method === "GET" ? "Read internal Command Center data." : "Mutate internal Command Center state.");
}

function endpointHasExternalAction(path = "") {
  return forbiddenEndpointRules.some(rule => rule.pattern.test(path));
}

function liveGateDependency(path = "") {
  if (/publish|posting|channels|oauth/.test(path)) return "live gates and explicit operator setup required";
  return "none";
}

export function endpointAuthRequired(method = "GET", path = "") {
  const key = `${method} ${path}`;
  return !publicSafePaths.has(key);
}

export function endpointMutatesState(method = "GET") {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

export function buildEndpointInventoryFromSource(source = "") {
  const endpoints = [];
  const seen = new Set();
  const patterns = [
    /url\.pathname\s*===\s*["']([^"']+)["']\s*&&\s*request\.method\s*===\s*["']([A-Z]+)["']/g,
    /request\.method\s*===\s*["']([A-Z]+)["']\s*&&\s*url\.pathname\s*===\s*["']([^"']+)["']/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const first = match[1];
      const second = match[2];
      const method = /^[A-Z]+$/.test(first) ? first : second;
      const rawPath = /^[A-Z]+$/.test(first) ? second : first;
      const path = normalizePath(rawPath);
      const key = `${method} ${path}`;
      if (seen.has(key) || !path.startsWith("/api/")) continue;
      seen.add(key);
      endpoints.push({
        method,
        path,
        purpose: endpointPurposeFor(method, path),
        auth_required: endpointAuthRequired(method, path),
        state_mutation: endpointMutatesState(method),
        external_action: endpointHasExternalAction(path),
        live_gate_dependency: liveGateDependency(path),
        risk_level: endpointRisk(method, path)
      });
    }
  }
  for (const item of [
    { method:"POST", path:"/api/posts/:id/publish-now" },
    { method:"POST", path:"/api/publishing/run" },
    { method:"POST", path:"/api/backups/restore" },
    { method:"POST", path:"/api/smoke-test/:id/item" },
    { method:"POST", path:"/api/smoke-test/:id/save" },
    { method:"POST", path:"/api/smoke-test/:id/finish" }
  ]) {
    const key = `${item.method} ${item.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      endpoints.push({
        ...item,
        purpose: endpointPurposeFor(item.method, item.path),
        auth_required: endpointAuthRequired(item.method, item.path),
        state_mutation: true,
        external_action: true,
        live_gate_dependency: liveGateDependency(item.path),
        risk_level: endpointRisk(item.method, item.path)
      });
    }
  }
  return endpoints.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

export function buildEndpointInventory(source = "") {
  return buildEndpointInventoryFromSource(source);
}

export function forbiddenActionStatus(state = {}, source = "") {
  const liveGates = liveGatesCount(state);
  const inventory = source ? buildEndpointInventory(source) : [];
  return {
    status: liveGates === 0 ? "blocked" : "needs_review",
    live_gates_count: liveGates,
    rules: forbiddenEndpointRules.map(rule => ({ id: rule.id, label: rule.label, reason: rule.reason, blocked: true })),
    protected_external_endpoints: inventory.filter(endpoint => endpoint.external_action).length,
    no_external_actions_confirmation: "Forbidden external actions are blocked or unavailable from the LegalEase OS."
  };
}

export function endpointProtectionStatus(source = "") {
  const inventory = buildEndpointInventory(source);
  const unexpected = inventory.filter(endpoint => endpoint.path.startsWith("/api/") && !endpoint.auth_required && !publicSafePaths.has(`${endpoint.method} ${endpoint.path}`));
  const mutatingUnprotected = inventory.filter(endpoint => endpoint.state_mutation && !endpoint.auth_required);
  return {
    status: unexpected.length || mutatingUnprotected.length ? "needs_attention" : "protected",
    endpoint_count: inventory.length,
    public_safe_count: inventory.filter(endpoint => !endpoint.auth_required).length,
    protected_count: inventory.filter(endpoint => endpoint.auth_required).length,
    mutating_unprotected_count: mutatingUnprotected.length,
    unexpected_public_endpoints: unexpected.map(endpoint => `${endpoint.method} ${endpoint.path}`),
    last_checked_at: new Date().toISOString()
  };
}

export function secretLeakageStatusFromText(text = "") {
  const patterns = [
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /OPENAI_API_KEY/i,
    /OWNER_TOKEN/,
    /OAUTH_TOKEN_ENCRYPTION_KEY/i,
    /STRIPE_SECRET_KEY/i,
    /service_role/i,
    /\bsk-[A-Za-z0-9_-]{8,}/,
    /\bwhsec_[A-Za-z0-9_-]{8,}/,
    /Bearer\s+[A-Za-z0-9._~+/-]{16,}/i
  ];
  const matches = patterns.filter(pattern => pattern.test(text)).map(pattern => String(pattern));
  return {
    status: matches.length ? "leak_detected" : "clean",
    matches,
    scanned_at: new Date().toISOString()
  };
}

export function guardForbiddenEndpoint({ method = "GET", pathname = "", state = {} } = {}) {
  const descriptor = `${method} ${pathname}`;
  const rule = forbiddenEndpointRules.find(item => item.pattern.test(pathname) || item.pattern.test(descriptor));
  if (!rule) return { ok: true };
  return {
    ok: false,
    status: 403,
    code: "forbidden_external_action_blocked",
    action: rule.id,
    error: rule.reason,
    live_gates_count: liveGatesCount(state),
    external_action: false
  };
}

export function safeAuthHardeningSummary({ state = {}, source = "" } = {}) {
  return {
    endpoint_protection: endpointProtectionStatus(source),
    secret_leakage: { status: "clean", note: "Runtime responses are scanned by auth endpoint hardening tests." },
    forbidden_action_guard: forbiddenActionStatus(state, source),
    last_auth_hardening_check: new Date().toISOString()
  };
}

export { forbiddenEndpointRules, publicSafePaths };
