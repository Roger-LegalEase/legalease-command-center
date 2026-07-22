import crypto from "node:crypto";
import { isHostedProduction, strongSecret } from "./runtime-security.mjs";
import { normalizeRole } from "./roles.mjs";

export const SESSION_COOKIE = "leos_session";
export const CSRF_COOKIE = "leos_csrf";
export const SESSION_TTL_MS = 30 * 60 * 1000;
// Legacy Supabase authSessions rows are intentionally inert. They remain in place to avoid a
// destructive production cleanup during this hotfix, but authentication never reads or writes
// this collection. Keep the exported name temporarily for downstream compatibility only.
export const SESSION_COLLECTION = "authSessions";

const clean = (value = "") => String(value ?? "").trim();
const hash = (value, pepper) => crypto.createHmac("sha256", pepper).update(value).digest("hex");

function cookies(value = "") {
  return Object.fromEntries(clean(value).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const i = part.indexOf("=");
    if (i < 0) return [part, ""];
    try {
      return [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
    } catch {
      return [part.slice(0, i), ""];
    }
  }));
}

export function sessionCookie(token, { env = process.env, maxAgeSeconds = SESSION_TTL_MS / 1000 } = {}) {
  const secure = isHostedProduction(env) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure}`;
}

export function clearSessionCookie({ env = process.env } = {}) {
  return sessionCookie("", { env, maxAgeSeconds: 0 });
}

export function csrfCookie(token, { env = process.env, maxAgeSeconds = SESSION_TTL_MS / 1000 } = {}) {
  const secure = isHostedProduction(env) ? "; Secure" : "";
  return `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure}`;
}

export function clearCsrfCookie({ env = process.env } = {}) {
  return csrfCookie("", { env, maxAgeSeconds: 0 });
}

export function credentialRole(credential, env = process.env) {
  const value = clean(credential);
  const candidates = [
    ["owner", env.COMMAND_CENTER_OWNER_TOKEN || env.COMMAND_CENTER_ACCESS_TOKEN],
    ["admin", env.COMMAND_CENTER_ADMIN_TOKEN],
    ["operator", env.COMMAND_CENTER_OPERATOR_TOKEN],
    ["viewer", env.COMMAND_CENTER_VIEWER_TOKEN || env.COMMAND_CENTER_INVESTOR_TOKEN]
  ];
  for (const [role, expectedRaw] of candidates) {
    const expected = clean(expectedRaw).replace(/^(["'])(.*)\1$/, "$2");
    if (!expected || value.length !== expected.length) continue;
    if (crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))) return role;
  }
  return "";
}

export function createSessionService({ authStore, env = process.env, now = () => Date.now() } = {}) {
  if (!authStore
    || typeof authStore.createSession !== "function"
    || typeof authStore.getSession !== "function"
    || typeof authStore.deleteSession !== "function"
    || typeof authStore.revokeSessions !== "function") {
    throw new Error("Session service requires auth runtime storage.");
  }
  const pepper = clean(env.COMMAND_CENTER_SESSION_SECRET);
  if (!strongSecret(pepper) && isHostedProduction(env)) throw new Error("Session security is unavailable.");
  const sessionPepper = pepper || crypto.randomBytes(32).toString("hex");

  function unavailable(message) {
    const error = new Error(message);
    error.code = "AUTH_STORE_ERROR";
    return error;
  }

  async function create(role, metadata = {}) {
    const token = crypto.randomBytes(32).toString("base64url");
    const csrfToken = crypto.randomBytes(24).toString("base64url");
    const at = now();
    const row = {
      id: crypto.randomUUID(),
      tokenHash: hash(token, sessionPepper),
      csrfHash: hash(csrfToken, sessionPepper),
      role: normalizeRole(role),
      createdAt: new Date(at).toISOString(),
      expiresAt: new Date(at + SESSION_TTL_MS).toISOString(),
      revokedAt: "",
      generation: 1,
      userAgentHash: metadata.userAgent ? hash(metadata.userAgent, sessionPepper).slice(0, 16) : ""
    };
    const created = await authStore.createSession(row, SESSION_TTL_MS, { signal: metadata.signal });
    if (!created) throw unavailable("Session could not be created.");
    return { token, csrfToken, row };
  }

  async function authenticate(request = {}) {
    const token = cookies(request.headers?.cookie || "")[SESSION_COOKIE] || "";
    if (!token) return null;
    const tokenHash = hash(token, sessionPepper);
    const row = await authStore.getSession(tokenHash, { signal: request.signal });
    const expiresAt = Date.parse(row?.expiresAt);
    if (!row || row.tokenHash !== tokenHash || row.revokedAt || !Number.isFinite(expiresAt) || expiresAt <= now()) return null;
    const role = normalizeRole(row.role);
    const session = { ...row, role };
    return { id: row.id, role, label: role, authenticated: true, authRequired: true, session };
  }

  async function revoke(request = {}) {
    const actor = await authenticate(request);
    if (!actor) return false;
    return authStore.deleteSession(actor.session.tokenHash, { signal: request.signal });
  }

  async function revokeAll(predicate = () => true) {
    if (typeof predicate !== "function") throw new TypeError("Session revocation predicate must be a function.");
    return authStore.revokeSessions((row) => !row.revokedAt && predicate(row));
  }

  async function rotate(request = {}, role = "") {
    const actor = await authenticate(request);
    if (!actor) throw new Error("Session is unavailable.");
    const revoked = await authStore.deleteSession(actor.session.tokenHash, { signal: request.signal });
    if (!revoked) throw new Error("Session is unavailable.");
    return create(role || actor.role, { userAgent: request.headers?.["user-agent"] || "", signal: request.signal });
  }

  function csrfValid(request, actor) {
    if (!actor?.session) return false;
    const token = clean(request.headers?.["x-csrf-token"]);
    if (!token) return false;
    const actual = hash(token, sessionPepper);
    const expected = clean(actor.session.csrfHash);
    return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  }

  return { create, authenticate, revoke, revokeAll, rotate, csrfValid };
}
