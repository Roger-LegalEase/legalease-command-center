// Per-request context for SAFE server telemetry (2026-07-25 mutation-convoy hotfix).
//
// The Supabase mutation executor lives in storage.mjs and has no idea which HTTP route
// submitted a write. During the convoy that was the missing fact: ~45 concurrent
// mutation RPCs with no way to attribute them to a route or a process. An
// AsyncLocalStorage store carries the method + a sanitized pathname from the request
// handler down through every await into the executor, without threading a parameter
// through ~150 call sites.
//
// SAFETY: this module deliberately carries ONLY method and pathname. No query string,
// no headers, no cookies, no tokens, no actor identity, no body. Pathname segments that
// look like identifiers (uuids, long opaque ids, digits) are replaced with ":id" before
// they are ever stored, so a route like /api/social/posts/<postId>/approve is recorded
// as /api/social/posts/:id/approve. That keeps the telemetry route-attributable without
// making it record-attributable.

import { AsyncLocalStorage } from "node:async_hooks";

const requestContextStorage = new AsyncLocalStorage();

const MAX_PATH_LENGTH = 120;
const MAX_SEGMENTS = 12;
// A segment is treated as an identifier when it is a uuid, is mostly digits, or is a
// long opaque token. Everything else is a route word and is kept verbatim.
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{21,}$/;
const NUMERIC_SEGMENT = /^\d+$/;
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function safeRoutePathname(pathname = "") {
  // Query strings and fragments never enter telemetry: they can carry tokens and ids.
  const raw = String(pathname || "").split("?")[0].split("#")[0];
  if (!raw.startsWith("/")) return "/";
  const segments = raw.split("/").filter(Boolean);
  const mapped = segments.slice(0, MAX_SEGMENTS).map((segment) => {
    if (UUID_SEGMENT.test(segment) || OPAQUE_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment)) return ":id";
    if (!SAFE_SEGMENT.test(segment)) return ":id";
    return segment.slice(0, 40);
  });
  if (segments.length > MAX_SEGMENTS) mapped.push("...");
  const result = "/" + mapped.join("/");
  return result.slice(0, MAX_PATH_LENGTH);
}

function safeMethod(method = "") {
  const normalized = String(method || "").trim().toUpperCase();
  return ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(normalized) ? normalized : "OTHER";
}

// Run `operation` with a request context attached. Only method + sanitized pathname are
// retained, regardless of what the caller passes.
export function runWithRequestContext({ method = "", pathname = "" } = {}, operation) {
  return requestContextStorage.run(
    Object.freeze({ method:safeMethod(method), route:safeRoutePathname(pathname) }),
    operation
  );
}

// Returns the current context, or a neutral one for background/CLI work that has no
// HTTP request (heartbeat ticks, scripts, boot).
export function currentRequestContext() {
  return requestContextStorage.getStore() || { method:"NONE", route:"/(background)" };
}

// Stable, non-secret identity of this Node process. RENDER_INSTANCE_ID is an
// infrastructure identifier, never a credential; the pid disambiguates within a host.
// This is what makes "which instance produced the convoy" answerable.
export function processIdentity(env = process.env) {
  const instance = String(env.RENDER_INSTANCE_ID || "").trim();
  const safeInstance = /^[A-Za-z0-9_-]{1,64}$/.test(instance) ? instance : "";
  return safeInstance ? safeInstance + ":" + process.pid : String(process.pid);
}
