import { canPerformEndpoint, normalizeRole, requiredCapabilitiesForEndpoint, roleDefinitions } from "./roles.mjs";

const clean = (value = "") => String(value || "").trim();
const lower = (value = "") => clean(value).toLowerCase();

function normalizeToken(value = "") {
  let token = clean(value);
  while (
    token.length >= 2
    && ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'")))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

const publicPaths = [
  "/api/health",
  "/api/auth/diagnostics",
  "/api/x/oauth-diagnostics",
  "/api/debug/env",
  "/api/storage/debug",
  "/api/storage/diagnostics",
  "/api/events/product"
];

function parseBoolean(value = "") {
  return ["true", "1", "yes", "on"].includes(lower(value));
}

export function authRequiredForEnv(env = process.env) {
  if (parseBoolean(env.COMMAND_CENTER_AUTH_DISABLED || "false")) return false;
  if (parseBoolean(env.COMMAND_CENTER_REQUIRE_AUTH || "false")) return true;
  const backend = lower(env.STORAGE_BACKEND || "");
  const localDemo = parseBoolean(env.LOCAL_DEMO_MODE || "false");
  return backend === "supabase" && !localDemo;
}

export function tokenRegistryFromEnv(env = process.env) {
  return [
    ["owner", env.COMMAND_CENTER_OWNER_TOKEN || env.COMMAND_CENTER_ACCESS_TOKEN],
    ["admin", env.COMMAND_CENTER_ADMIN_TOKEN],
    ["operator", env.COMMAND_CENTER_OPERATOR_TOKEN || env.COMMAND_CENTER_MARKETING_TOKEN || env.COMMAND_CENTER_REVIEWER_TOKEN || env.COMMAND_CENTER_COMPLIANCE_TOKEN],
    ["viewer", env.COMMAND_CENTER_VIEWER_TOKEN || env.COMMAND_CENTER_INVESTOR_TOKEN]
  ].map(([role, token]) => [role, normalizeToken(token)]).filter(([, token]) => token.length >= 16);
}

function bearerFromHeader(value = "") {
  const match = clean(value).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function safeDecodeCookieValue(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function tokensFromCookie(cookie = "") {
  return clean(cookie)
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("leos_session="))
    .map((part) => normalizeToken(safeDecodeCookieValue(part.slice("leos_session=".length))))
    .filter(Boolean);
}

export function tokenCandidatesFromRequest(request = {}) {
  const headers = request.headers || {};
  return [
    headers["x-command-center-token"],
    headers["x-leos-token"],
    bearerFromHeader(headers.authorization || ""),
    ...tokensFromCookie(headers.cookie || "")
  ].map((token) => normalizeToken(token)).filter(Boolean);
}

export function tokenFromRequest(request = {}) {
  return tokenCandidatesFromRequest(request)[0] || "";
}

export function actorFromRequest(request = {}, env = process.env) {
  const required = authRequiredForEnv(env);
  const registry = tokenRegistryFromEnv(env);
  const tokenCandidates = tokenCandidatesFromRequest(request);
  const token = tokenCandidates[0] || "";
  if (!required && !token) {
    return { id:"local_operator", role:"owner", label:"Local Operator", authenticated:true, authRequired:false, permissions:roleDefinitions.owner.can };
  }
  const match = registry.find(([, value]) => tokenCandidates.includes(value));
  if (!match) {
    return { id:"anonymous", role:"anonymous", label:"Anonymous", authenticated:false, authRequired:required, permissions:[] };
  }
  const [role] = match;
  const normalizedRole = normalizeRole(role);
  return { id:normalizedRole, role:normalizedRole, label:roleDefinitions[normalizedRole]?.label || normalizedRole, authenticated:true, authRequired:required, permissions:roleDefinitions[normalizedRole]?.can || [] };
}

export function permissionForRequest(method = "GET", pathname = "/") {
  if (publicPaths.includes(pathname)) return "public";
  if (pathname.startsWith("/api/oauth/google/callback")) return "public";
  if (pathname.startsWith("/api/google/callback")) return "public";
  if (pathname.startsWith("/data/exports/final-pngs/")) return "public";
  if (pathname.startsWith("/data/exports/openai-images/")) return "public";
  if (pathname.startsWith("/assets/")) return "public";
  if (method === "GET" || method === "HEAD") {
    if (pathname.includes("settings")) return "admin";
    return "read";
  }
  if (/\/api\/soc2\/evidence\/|\/api\/growth\/upsert/.test(pathname) && /compliance|soc2/i.test(pathname)) return "compliance_review";
  if (pathname === "/api/heartbeat/autopilot") return "admin";
  if (pathname === "/api/heartbeat/tick") return "write";
  if (/\/api\/channels|\/api\/oauth|\/api\/settings|\/api\/backups\/restore/.test(pathname)) return "admin";
  if (/\/api\/publish|\/api\/posts\/.*\/publish/.test(pathname)) return "publish_review";
  if (/\/api\/approval|\/api\/autonomy\/actions|\/api\/automation\/suggestions/.test(pathname)) return "approve";
  return "write";
}

export function authorizeRequest(request = {}, urlLike = null, env = process.env) {
  const url = urlLike || new URL(request.url || "/", "http://localhost");
  const pathname = url.pathname || "/";

  // Dedicated cron token (least privilege): may ONLY POST the heartbeat tick. It is
  // independent of the owner/role tokens and grants no other access whatsoever, so it
  // can be rotated/revoked on its own without touching operator access.
  const cronToken = normalizeToken(env.COMMAND_CENTER_CRON_TOKEN || "");
  if (cronToken.length >= 16 && tokenCandidatesFromRequest(request).includes(cronToken)) {
    const cronActor = { id:"cron", role:"cron", label:"Scheduled Cron", authenticated:true, authRequired:true, permissions:[] };
    if ((request.method || "GET").toUpperCase() === "POST" && pathname === "/api/heartbeat/tick") {
      return { ok:true, actor:cronActor, requiredPermission:"operate_heartbeat" };
    }
    return { ok:false, status:403, actor:cronActor, requiredPermission:"operate_heartbeat", reason:"Cron token may only trigger the heartbeat tick." };
  }

  const requiredPermission = permissionForRequest(request.method || "GET", pathname);
  const actor = actorFromRequest(request, env);
  if (requiredPermission === "public") return { ok:true, actor, requiredPermission };
  if (!actor.authRequired && actor.authenticated) return { ok:true, actor, requiredPermission };
  if (!actor.authenticated) {
    return { ok:false, status:401, actor, requiredPermission, reason:"Authentication required." };
  }
  if (!actor.permissions.includes(requiredPermission) && !actor.permissions.includes("admin")) {
    return { ok:false, status:403, actor, requiredPermission, reason:`Role ${actor.role} cannot perform ${requiredPermission}.` };
  }
  const roleDecision = canPerformEndpoint(actor.role, request.method || "GET", pathname);
  if (!roleDecision.ok) {
    return {
      ok:false,
      status:403,
      actor,
      requiredPermission,
      requiredCapabilities: roleDecision.requiredCapabilities,
      reason: roleDecision.reason
    };
  }
  return { ok:true, actor, requiredPermission, requiredCapabilities: requiredCapabilitiesForEndpoint(request.method || "GET", pathname) };
}

export function publicActor(actor = {}) {
  return {
    id: actor.id || "anonymous",
    role: actor.role || "anonymous",
    label: actor.label || "Anonymous",
    authenticated: Boolean(actor.authenticated),
    permissions: actor.permissions || []
  };
}

export { roleDefinitions };
export { normalizeToken };
