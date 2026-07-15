const METRICS = new Set([
  "storage_write_failures", "concurrency_conflicts", "webhook_rejections", "webhook_replays",
  "outbound_claims", "publish_claims", "reconciliation_required", "auth_failures", "auth_throttled"
]);

export async function incrementSecurityMetric(store, name, amount = 1) {
  if (!METRICS.has(name)) throw new Error("Unknown security metric.");
  return store.mutateCollectionItem("securityMetrics", "singleton", (current) => ({
    ...(current || {}), id:"singleton",
    counters:{ ...(current?.counters || {}), [name]:Number(current?.counters?.[name] || 0) + Number(amount || 0) },
    updatedAt:new Date().toISOString()
  }), { createIfMissing:true, maxRetries:2 });
}

export function operationalMetrics(state = {}, writeHealth = {}) {
  const counters = state.securityMetrics?.counters || {};
  const claims = Array.isArray(state.publishClaims) ? state.publishClaims : [];
  const lastHeartbeat = (state.heartbeatRuns || [])[0]?.ranAt || "";
  return {
    counters:Object.fromEntries([...METRICS].map((name) => [name, Number(counters[name] || 0)])),
    storage:{ writeFailures:Number(writeHealth.failedWriteCount || 0), concurrencyConflicts:Number(writeHealth.conflictCount || 0), lastWriteOkAt:writeHealth.lastWriteOkAt || "", lastWriteErrorAt:writeHealth.lastWriteErrorAt || "" },
    publish:{ active:claims.filter((claim) => ["publish_claimed","publishing"].includes(claim.status)).length, reconciliationRequired:claims.filter((claim) => claim.status === "reconciliation_required").length },
    heartbeat:{ lastSuccessAt:lastHeartbeat, overdue:Boolean(lastHeartbeat && Date.now() - Date.parse(lastHeartbeat) > 2 * 60 * 60 * 1000) },
    externalErrorTrackingConfigured:false
  };
}
