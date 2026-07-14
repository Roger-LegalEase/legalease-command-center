import crypto from "node:crypto";
import { isHostedProduction, strongSecret } from "./runtime-security.mjs";

export const SESSION_COOKIE = "leos_session";
export const CSRF_COOKIE = "leos_csrf";
export const SESSION_TTL_MS = 30 * 60 * 1000;
export const SESSION_COLLECTION = "authSessions";

const clean = (value = "") => String(value ?? "").trim();
const hash = (value, pepper) => crypto.createHmac("sha256", pepper).update(value).digest("hex");

function cookies(value = "") {
  return Object.fromEntries(clean(value).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const i = part.indexOf("=");
    return i < 0 ? [part, ""] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
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

export function createSessionService({ store, env = process.env, now = () => Date.now() } = {}) {
  if (!store) throw new Error("Session service requires durable storage.");
  const pepper = clean(env.COMMAND_CENTER_SESSION_SECRET);
  if (!strongSecret(pepper) && isHostedProduction(env)) throw new Error("Session security is unavailable.");
  const sessionPepper = pepper || crypto.randomBytes(32).toString("hex");

  async function create(role, metadata = {}) {
    const token = crypto.randomBytes(32).toString("base64url");
    const csrfToken = crypto.randomBytes(24).toString("base64url");
    const at = now();
    const row = {
      id: crypto.randomUUID(),
      tokenHash: hash(token, sessionPepper),
      csrfHash: hash(csrfToken, sessionPepper),
      role,
      createdAt: new Date(at).toISOString(),
      expiresAt: new Date(at + SESSION_TTL_MS).toISOString(),
      revokedAt: "",
      generation: 1,
      userAgentHash: metadata.userAgent ? hash(metadata.userAgent, sessionPepper).slice(0, 16) : ""
    };
    const outcome = await store.claimCollectionItems(SESSION_COLLECTION, [row]);
    if (!outcome.inserted?.length) throw new Error("Session could not be created.");
    return { token, csrfToken, row };
  }

  async function authenticate(request = {}) {
    const token = cookies(request.headers?.cookie || "")[SESSION_COOKIE] || "";
    if (!token) return null;
    const tokenHash = hash(token, sessionPepper);
    const state = await store.readState();
    const row = (state[SESSION_COLLECTION] || []).find((entry) => entry.tokenHash === tokenHash);
    if (!row || row.revokedAt || Date.parse(row.expiresAt) <= now()) return null;
    return { id: row.id, role: row.role, label: row.role, authenticated: true, authRequired: true, session: row };
  }

  async function revoke(request = {}) {
    const actor = await authenticate(request);
    if (!actor) return false;
    await store.mutateCollectionItem(SESSION_COLLECTION, actor.id, (row) => ({ ...row, revokedAt: new Date(now()).toISOString() }));
    return true;
  }

  async function revokeAll(predicate = () => true) {
    const state = await store.readState();
    const active = (state[SESSION_COLLECTION] || []).filter((row) => !row.revokedAt && predicate(row));
    for (const row of active) {
      await store.mutateCollectionItem(SESSION_COLLECTION, row.id, (current) => ({ ...current, revokedAt: new Date(now()).toISOString(), generation: Number(current.generation || 1) + 1 }), { expectedVersion: row._version });
    }
    return active.length;
  }

  async function rotate(request = {}, role = "") {
    const actor = await authenticate(request);
    if (!actor) throw new Error("Session is unavailable.");
    await revoke(request);
    return create(role || actor.role, { userAgent: request.headers?.["user-agent"] || "" });
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
