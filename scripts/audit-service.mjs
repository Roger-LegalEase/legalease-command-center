import crypto from "node:crypto";

const clean = (value = "") => String(value ?? "").trim();

function safeSummary(summary = {}) {
  const result = {};
  for (const [key, value] of Object.entries(summary || {}).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) continue;
    if (["string", "number", "boolean"].includes(typeof value)) result[key] = typeof value === "string" ? clean(value).slice(0, 160) : value;
  }
  return result;
}

export function createAuditService({ store, now = () => new Date() } = {}) {
  if (!store?.appendAuditEvent) throw new Error("Append-only audit storage is required.");
  async function append({ actor = {}, action, targetType, targetId, requestId, outcome = "success", summary = {}, source = "http" } = {}) {
    const event = {
      id: crypto.randomUUID(),
      occurredAt: now().toISOString(),
      actorId: clean(actor.id || "system"),
      role: clean(actor.role || "system"),
      action: clean(action).slice(0, 96),
      targetType: clean(targetType).slice(0, 64),
      targetId: clean(targetId).slice(0, 128),
      requestId: clean(requestId).slice(0, 96),
      outcome: clean(outcome).slice(0, 32),
      summary: safeSummary(summary),
      source: clean(source).slice(0, 32)
    };
    if (!event.action || !event.targetType || !event.targetId) throw new Error("Audit event is invalid.");
    return store.appendAuditEvent(event);
  }
  return { append };
}
