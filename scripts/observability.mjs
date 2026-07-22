const BUSINESS_METRICS = new Set([
  "storage_write_failures", "concurrency_conflicts", "webhook_rejections", "webhook_replays",
  "outbound_claims", "publish_claims", "reconciliation_required"
]);
const AUTH_RUNTIME_METRICS = new Set([
  "auth_failures", "auth_throttled", "auth_rate_limit_errors", "auth_session_create_errors",
  "auth_session_lookup_errors", "auth_logins"
]);

export async function incrementSecurityMetric(store, name, amount = 1) {
  if (!BUSINESS_METRICS.has(name)) throw new Error("Unknown business security metric.");
  return store.mutateCollectionItem("securityMetrics", "singleton", (current) => ({
    ...(current || {}), id:"singleton",
    counters:{ ...(current?.counters || {}), [name]:Number(current?.counters?.[name] || 0) + Number(amount || 0) },
    updatedAt:new Date().toISOString()
  }), { createIfMissing:true, maxRetries:2, returnState:false });
}

export function operationalMetrics(state = {}, writeHealth = {}, authRuntimeCounters = {}) {
  const counters = state.securityMetrics?.counters || {};
  const claims = Array.isArray(state.publishClaims) ? state.publishClaims : [];
  const lastHeartbeat = (state.heartbeatRuns || [])[0]?.ranAt || "";
  return {
    counters:{
      ...Object.fromEntries([...BUSINESS_METRICS].map((name) => [name, Number(counters[name] || 0)])),
      ...Object.fromEntries([...AUTH_RUNTIME_METRICS].map((name) => [name, Number(authRuntimeCounters[name] || 0)]))
    },
    storage:{ writeFailures:Number(writeHealth.failedWriteCount || 0), concurrencyConflicts:Number(writeHealth.conflictCount || 0), lastWriteOkAt:writeHealth.lastWriteOkAt || "", lastWriteErrorAt:writeHealth.lastWriteErrorAt || "" },
    publish:{ active:claims.filter((claim) => ["publish_claimed","publishing"].includes(claim.status)).length, reconciliationRequired:claims.filter((claim) => claim.status === "reconciliation_required").length },
    heartbeat:{ lastSuccessAt:lastHeartbeat, overdue:Boolean(lastHeartbeat && Date.now() - Date.parse(lastHeartbeat) > 2 * 60 * 60 * 1000) },
    externalErrorTrackingConfigured:false
  };
}
