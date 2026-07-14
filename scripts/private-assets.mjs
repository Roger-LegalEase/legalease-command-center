import crypto from "node:crypto";
import path from "node:path";
import { isHostedProduction, strongSecret } from "./runtime-security.mjs";

const MAX_PREVIEW_TTL_MS = 5 * 60 * 1000;
const PREFIXES = ["data/private/draft-assets/"];

export function normalizePrivateAssetPath(value = "") {
  const clean = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const normalized = path.posix.normalize(clean);
  if (normalized !== clean || normalized.includes("..") || !PREFIXES.some((prefix) => normalized.startsWith(prefix))) return "";
  return normalized;
}

export function imageTypeFromSignature(buffer = Buffer.alloc(0)) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "gif";
  return "";
}

function signingSecret(env = process.env) {
  const secret = String(env.ASSET_SIGNING_SECRET || "");
  if (isHostedProduction(env) && !strongSecret(secret)) throw new Error("Private asset signing is unavailable.");
  return secret || "development-private-asset-signing-only";
}

export function signPrivateAsset({ assetPath, sessionId, postId, expiresAt = Date.now() + 60_000, env = process.env } = {}) {
  const normalized = normalizePrivateAssetPath(assetPath);
  if (!normalized || !sessionId || !postId) throw new Error("Private asset request is invalid.");
  const expiry = Math.min(Number(expiresAt), Date.now() + MAX_PREVIEW_TTL_MS);
  const encoded = Buffer.from(JSON.stringify({ p: normalized, s: String(sessionId), r: String(postId), e: expiry })).toString("base64url");
  const signature = crypto.createHmac("sha256", signingSecret(env)).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyPrivateAsset(token, { sessionId, now = Date.now(), env = process.env } = {}) {
  const [encoded, signature, extra] = String(token || "").split(".");
  if (!encoded || !signature || extra) return { ok: false };
  const expected = crypto.createHmac("sha256", signingSecret(env)).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return { ok: false };
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const assetPath = normalizePrivateAssetPath(payload.p);
    if (!assetPath || payload.s !== String(sessionId || "") || Number(payload.e) <= now || Number(payload.e) > now + MAX_PREVIEW_TTL_MS) return { ok: false };
    return { ok: true, assetPath, postId: String(payload.r), expiresAt: Number(payload.e) };
  } catch { return { ok: false }; }
}
