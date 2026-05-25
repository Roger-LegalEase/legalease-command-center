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

const roleDefinitions = {
  owner: {
    label: "Owner",
    can: ["read", "write", "admin", "approve", "publish_review", "compliance_review", "view_investor", "view_partner"]
  },
  admin: {
    label: "Admin",
    can: ["read", "write", "admin", "approve", "compliance_review", "view_investor", "view_partner"]
  },
  marketing: {
    label: "Marketing",
    can: ["read", "write", "approve"]
  },
  reviewer: {
    label: "Reviewer",
    can: ["read", "approve"]
  },
  partner: {
    label: "Partner",
    can: ["read", "view_partner"]
  },
  investor_readonly: {
    label: "Investor Readonly",
    can: ["read", "view_investor"]
  },
  compliance_reviewer: {
    label: "Compliance Reviewer",
    can: ["read", "compliance_review", "approve"]
  }
};

const publicPaths = [
  "/api/health",
  "/api/auth/diagnostics",
  "/api/debug/env",
  "/api/storage/debug",
  "/api/storage/diagnostics"
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
    ["marketing", env.COMMAND_CENTER_MARKETING_TOKEN],
    ["reviewer", env.COMMAND_CENTER_REVIEWER_TOKEN],
    ["partner", env.COMMAND_CENTER_PARTNER_TOKEN],
    ["investor_readonly", env.COMMAND_CENTER_INVESTOR_TOKEN],
    ["compliance_reviewer", env.COMMAND_CENTER_COMPLIANCE_TOKEN]
  ].map(([role, token]) => [role, normalizeToken(token)]).filter(([, token]) => token.length >= 16);
}

function bearerFromHeader(value = "") {
  const match = clean(value).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function tokenFromCookie(cookie = "") {
  return clean(cookie).split(";").map((part) => part.trim()).find((part) => part.startsWith("leos_session="))?.slice("leos_session=".length) || "";
}

export function tokenFromRequest(request = {}) {
  const headers = request.headers || {};
  return normalizeToken(
    headers["x-command-center-token"]
    || headers["x-leos-token"]
    || bearerFromHeader(headers.authorization || "")
    || tokenFromCookie(headers.cookie || "")
  );
}

export function actorFromRequest(request = {}, env = process.env) {
  const required = authRequiredForEnv(env);
  const registry = tokenRegistryFromEnv(env);
  const token = tokenFromRequest(request);
  if (!required && !token) {
    return { id:"local_operator", role:"owner", label:"Local Operator", authenticated:true, authRequired:false, permissions:roleDefinitions.owner.can };
  }
  const match = registry.find(([, value]) => value === token);
  if (!match) {
    return { id:"anonymous", role:"anonymous", label:"Anonymous", authenticated:false, authRequired:required, permissions:[] };
  }
  const [role] = match;
  return { id:role, role, label:roleDefinitions[role]?.label || role, authenticated:true, authRequired:required, permissions:roleDefinitions[role]?.can || [] };
}

export function permissionForRequest(method = "GET", pathname = "/") {
  if (publicPaths.includes(pathname)) return "public";
  if (pathname.startsWith("/api/oauth/google/callback")) return "public";
  if (pathname.startsWith("/data/exports/final-pngs/")) return "public";
  if (pathname.startsWith("/data/exports/openai-images/")) return "public";
  if (pathname.startsWith("/assets/")) return "public";
  if (method === "GET" || method === "HEAD") {
    if (pathname.includes("settings")) return "admin";
    return "read";
  }
  if (/\/api\/soc2\/evidence\/|\/api\/growth\/upsert/.test(pathname) && /compliance|soc2/i.test(pathname)) return "compliance_review";
  if (/\/api\/channels|\/api\/oauth|\/api\/settings|\/api\/backups\/restore/.test(pathname)) return "admin";
  if (/\/api\/publish|\/api\/posts\/.*\/publish/.test(pathname)) return "publish_review";
  if (/\/api\/approval|\/api\/autonomy\/actions|\/api\/automation\/suggestions/.test(pathname)) return "approve";
  return "write";
}

export function authorizeRequest(request = {}, urlLike = null, env = process.env) {
  const url = urlLike || new URL(request.url || "/", "http://localhost");
  const pathname = url.pathname || "/";
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
  return { ok:true, actor, requiredPermission };
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
