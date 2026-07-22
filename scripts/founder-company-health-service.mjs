import { recordVisibleToActor } from "./global-search-service.mjs";
import { roleHasCapability, roles } from "./roles.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const slug = (value = "") => lower(value).replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");

export const FOUNDER_COMPANY_HEALTH_ENDPOINT = "/api/ui/company-health";
export const FOUNDER_COMPANY_HEALTH_READ_COLLECTIONS = Object.freeze([
  "connectorStatus",
  "funnelSnapshots",
  "heartbeatRuns",
  "osHealthSnapshots",
  "sendgridWebhookHealth",
  "socialAccounts",
  "systemHealth"
]);

export const FOUNDER_HEALTH_STATUSES = Object.freeze({
  healthy:Object.freeze({ key:"healthy", label:"Healthy" }),
  needs_attention:Object.freeze({ key:"needs_attention", label:"Needs attention" }),
  unavailable:Object.freeze({ key:"unavailable", label:"Unavailable" })
});

export const FOUNDER_HEALTH_COMPONENTS = Object.freeze([
  Object.freeze({ id:"application", label:"Production application" }),
  Object.freeze({ id:"supabase", label:"Supabase" }),
  Object.freeze({ id:"authentication", label:"Authentication" }),
  Object.freeze({ id:"storage", label:"Storage" }),
  Object.freeze({ id:"google", label:"Google connection" }),
  Object.freeze({ id:"email", label:"Email provider" }),
  Object.freeze({ id:"stripe", label:"Stripe" }),
  Object.freeze({ id:"analytics", label:"Website analytics" }),
  Object.freeze({ id:"background_jobs", label:"Background jobs" })
]);

const SUCCESS_WORDS = /connected|healthy|success|succeeded|complete|completed|ready|protected|verified|available|ok/i;
const FAILURE_WORDS = /error|fail|failed|unavailable|unhealthy|critical|blocked|needs.?attention|needs.?refresh|reconnect|expired|rejected/i;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function actorContext(actor = {}) {
  const role = lower(actor.role);
  const authorized = actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal");
  return {
    authorized,
    role:authorized ? role : null,
    canViewAdvanced:authorized && roleHasCapability(role, "view_diagnostics")
  };
}

function visibleRecords(state = {}, collection = "", role = "viewer") {
  return list(state[collection]).filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role));
}

function validTimestamp(value = "") {
  const text = clean(value).slice(0, 80);
  if (!text) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);
  return Number.isFinite(parsed) ? text : null;
}

function timestampMs(value = "") {
  const timestamp = validTimestamp(value);
  if (!timestamp) return Number.NEGATIVE_INFINITY;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? `${timestamp}T00:00:00.000Z` : timestamp);
}

function newestTimestamp(values = []) {
  return list(values).map(validTimestamp).filter(Boolean).sort((left, right) => timestampMs(right) - timestampMs(left))[0] || null;
}

function sorted(records = [], fields = ["generated_at", "generatedAt", "fetchedAt", "lastSyncAt", "updatedAt", "updated_at", "ranAt", "createdAt", "created_at"]) {
  const timestamp = (record) => fields.map((field) => validTimestamp(record?.[field])).find(Boolean) || null;
  return [...list(records)].sort((left, right) => timestampMs(timestamp(right)) - timestampMs(timestamp(left)));
}

function connector(state = {}, names = [], role = "viewer") {
  const wanted = new Set(names.map(slug));
  return visibleRecords(state, "connectorStatus", role).find((record) => wanted.has(slug(record.connector || record.key || record.name))) || null;
}

function statusFromEvidence({ healthy = null, configured = null, attention = false } = {}) {
  if (attention || healthy === false && configured === true) return FOUNDER_HEALTH_STATUSES.needs_attention;
  if (healthy === true) return FOUNDER_HEALTH_STATUSES.healthy;
  return FOUNDER_HEALTH_STATUSES.unavailable;
}

function component({ id, status, summary, lastCheckedAt = null, lastSuccessfulAt = null, actionHref = "#os-health" } = {}) {
  const contract = FOUNDER_HEALTH_COMPONENTS.find((item) => item.id === id);
  return {
    id,
    label:contract?.label || "Company service",
    status:status || FOUNDER_HEALTH_STATUSES.unavailable,
    summary:clean(summary) || "No recent health information is available.",
    lastCheckedAt:validTimestamp(lastCheckedAt),
    lastSuccessfulAt:validTimestamp(lastSuccessfulAt),
    actionHref
  };
}

function boolOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function goodStatus(record = {}) {
  if (typeof record.ok === "boolean") return record.ok;
  const status = clean(record.status || record.lastSyncStatus || record.state);
  if (!status) return null;
  if (FAILURE_WORDS.test(status)) return false;
  if (SUCCESS_WORDS.test(status)) return true;
  return null;
}

function hasError(record = {}) {
  return Boolean(clean(record.lastError || record.lastErrorSummary || record.error || record.last_error));
}

function latestHealthSnapshot(state, role) {
  return sorted(visibleRecords(state, "osHealthSnapshots", role))[0] || null;
}

function applicationComponent(state, context, snapshot) {
  const runtime = state.runtime && typeof state.runtime === "object" ? state.runtime : {};
  const snapshotStatus = lower(snapshot?.overall_health);
  const runtimeHealthy = boolOrNull(runtime.applicationHealthy ?? runtime.ready ?? state.systemHealth?.applicationHealthy);
  const healthy = snapshot ? snapshotStatus === "healthy" : runtimeHealthy;
  const attention = snapshot ? ["critical", "needs_attention", "unhealthy"].includes(snapshotStatus) : runtimeHealthy === false;
  const checked = validTimestamp(snapshot?.generated_at || snapshot?.generatedAt || state.systemHealth?.updatedAt);
  const status = statusFromEvidence({ healthy, configured:snapshot || runtimeHealthy !== null ? true : null, attention });
  return component({
    id:"application",
    status,
    summary:status.key === "healthy" ? "The latest application check completed successfully."
      : status.key === "needs_attention" ? "The latest application check found something that needs review."
        : "No recent application check is available.",
    lastCheckedAt:checked,
    lastSuccessfulAt:healthy ? checked : null
  });
}

function supabaseComponent(state, context, snapshot) {
  const database = snapshot?.connection_health?.supabase_db || null;
  const statusRecord = connector(state, ["supabase", "database"], context.role);
  const runtimeValue = boolOrNull(state.runtime?.supabaseDbConnected);
  const healthy = database ? goodStatus(database) : statusRecord ? goodStatus(statusRecord) : runtimeValue;
  const configured = database || statusRecord ? true : runtimeValue !== null ? true : null;
  const attention = hasError(statusRecord || {}) || healthy === false && configured === true;
  const checked = newestTimestamp([snapshot?.generated_at, statusRecord?.lastSyncAt, state.runtime?.supabaseLastCheckedAt]);
  const status = statusFromEvidence({ healthy, configured, attention });
  return component({
    id:"supabase",
    status,
    summary:status.key === "healthy" ? "The database connection is available."
      : status.key === "needs_attention" ? "The database connection needs attention."
        : "The database connection has not been verified.",
    lastCheckedAt:checked,
    lastSuccessfulAt:healthy ? checked : null
  });
}

function authenticationComponent(state, context, snapshot) {
  const auth = snapshot?.connection_health?.owner_token_auth || snapshot?.auth_hardening?.endpoint_protection || null;
  const runtimeRequired = boolOrNull(state.runtime?.accessControl?.authRequired);
  const authGood = auth ? goodStatus(auth) : runtimeRequired;
  const leakage = lower(snapshot?.auth_hardening?.secret_leakage?.status);
  const endpoint = lower(snapshot?.auth_hardening?.endpoint_protection?.status);
  const attention = authGood === false || leakage === "leak_detected" || endpoint && endpoint !== "protected";
  const checked = validTimestamp(snapshot?.generated_at || snapshot?.generatedAt || state.runtime?.accessControl?.checkedAt);
  const status = statusFromEvidence({ healthy:authGood, configured:auth || runtimeRequired !== null ? true : null, attention });
  return component({
    id:"authentication",
    status,
    summary:status.key === "healthy" ? "Sign-in protection passed its latest check."
      : status.key === "needs_attention" ? "Sign-in protection needs review."
        : "No recent sign-in protection check is available.",
    lastCheckedAt:checked,
    lastSuccessfulAt:status.key === "healthy" ? checked : null,
    actionHref:"#settings"
  });
}

function storageComponent(state, context, snapshot) {
  const stored = snapshot?.connection_health?.supabase_storage || null;
  const runtime = state.runtime?.supabaseStorage && typeof state.runtime.supabaseStorage === "object" ? state.runtime.supabaseStorage : null;
  const healthy = stored ? goodStatus(stored) : runtime ? boolOrNull(runtime.connected ?? runtime.ok) : null;
  const configured = stored || runtime ? true : null;
  const checked = newestTimestamp([snapshot?.generated_at, runtime?.lastCheckedAt, runtime?.updatedAt]);
  const status = statusFromEvidence({ healthy, configured, attention:healthy === false && configured === true });
  return component({
    id:"storage",
    status,
    summary:status.key === "healthy" ? "File storage is available."
      : status.key === "needs_attention" ? "File storage needs attention."
        : "File storage has not been verified.",
    lastCheckedAt:checked,
    lastSuccessfulAt:healthy ? checked : null
  });
}

function googleComponent(state, context) {
  const account = visibleRecords(state, "socialAccounts", context.role).find((record) => slug(record.platform) === "google_workspace") || null;
  const gmail = connector(state, ["gmail", "google", "google_workspace"], context.role);
  const calendar = connector(state, ["calendar"], context.role);
  const hasConnectionRecord = Boolean(account || gmail || calendar);
  const accountConnected = account ? Boolean(account.connected || account.status === "connected" || account.hasStoredToken || account.connectedAt || account.accessTokenEncrypted || account.refreshTokenEncrypted) : null;
  const connectorStates = [gmail, calendar].filter(Boolean).map(goodStatus).filter((value) => value !== null);
  const connectorConnected = connectorStates.length ? connectorStates.every(Boolean) : null;
  const healthy = accountConnected !== null ? accountConnected && (connectorConnected ?? true) : connectorConnected;
  const attention = hasError(account || {}) || hasError(gmail || {}) || hasError(calendar || {})
    || /refresh|reconnect|error|expired|failed/.test(lower(account?.status || gmail?.lastSyncStatus || calendar?.lastSyncStatus));
  const checked = newestTimestamp([account?.updatedAt, account?.connectedAt, gmail?.lastSyncAt, calendar?.lastSyncAt]);
  const success = newestTimestamp([healthy ? checked : null, goodStatus(gmail || {}) ? gmail?.lastSyncAt : null, goodStatus(calendar || {}) ? calendar?.lastSyncAt : null]);
  const status = statusFromEvidence({ healthy, configured:hasConnectionRecord ? true : null, attention });
  return component({
    id:"google",
    status,
    summary:status.key === "healthy" ? "Google read-only access is available."
      : status.key === "needs_attention" ? "The Google connection needs attention."
        : "Google is not connected.",
    lastCheckedAt:checked,
    lastSuccessfulAt:success,
    actionHref:"#settings"
  });
}

function emailComponent(state, context) {
  const connection = connector(state, ["email", "sendgrid", "email_provider"], context.role);
  const telemetry = state.sendgridWebhookHealth && typeof state.sendgridWebhookHealth === "object" ? state.sendgridWebhookHealth : null;
  const verifiedBatches = Number(telemetry?.verified_batches ?? telemetry?.verifiedBatches);
  const rejectedBatches = Number(telemetry?.rejected_batches ?? telemetry?.rejectedBatches);
  const lastOk = validTimestamp(telemetry?.lastOkAt || telemetry?.last_ok_at);
  const connectorGood = connection ? goodStatus(connection) : null;
  const healthy = connectorGood !== null ? connectorGood : lastOk ? true : null;
  const configured = connection ? Boolean(connection.configured ?? true) : telemetry ? true : null;
  const attention = hasError(connection || {}) || hasError(telemetry || {})
    || Number.isFinite(rejectedBatches) && rejectedBatches > 0 && (!Number.isFinite(verifiedBatches) || rejectedBatches >= verifiedBatches);
  const checked = newestTimestamp([connection?.lastSyncAt, telemetry?.lastReceivedAt, telemetry?.last_received_at, telemetry?.updatedAt]);
  const success = newestTimestamp([connectorGood ? connection?.lastSyncAt : null, lastOk]);
  const status = statusFromEvidence({ healthy, configured, attention });
  return component({
    id:"email",
    status,
    summary:status.key === "healthy" ? "Email delivery reporting is available."
      : status.key === "needs_attention" ? "The email provider connection needs attention."
        : "The email provider has not been verified.",
    lastCheckedAt:checked,
    lastSuccessfulAt:success,
    actionHref:"#settings"
  });
}

function stripeComponent(state, context) {
  const revenue = state.stripeRevenue && typeof state.stripeRevenue === "object" ? state.stripeRevenue : null;
  const connection = connector(state, ["stripe", "payments"], context.role);
  const healthy = revenue ? revenue.available === true : connection ? goodStatus(connection) : null;
  const configured = revenue ? Boolean(revenue.configured ?? revenue.available) : connection ? Boolean(connection.configured ?? true) : null;
  const attention = Boolean(revenue?.configured && !revenue?.available) || hasError(revenue || {}) || hasError(connection || {});
  const checked = newestTimestamp([revenue?.fetchedAt, revenue?.updatedAt, connection?.lastSyncAt]);
  const success = newestTimestamp([revenue?.available ? revenue?.fetchedAt : null, goodStatus(connection || {}) ? connection?.lastSyncAt : null]);
  const status = statusFromEvidence({ healthy, configured, attention });
  return component({
    id:"stripe",
    status,
    summary:status.key === "healthy" ? "Payment reporting is available."
      : status.key === "needs_attention" ? "The payment connection needs attention."
        : "Stripe is not connected.",
    lastCheckedAt:checked,
    lastSuccessfulAt:success,
    actionHref:"#settings"
  });
}

function analyticsComponent(state, context) {
  const connection = connector(state, ["website", "analytics", "website_analytics", "recordshield", "expungement_ai"], context.role);
  const automaticRows = visibleRecords(state, "funnelSnapshots", context.role).filter((row) => Boolean(clean(row.sourceEventId || row.source_event_id || row.eventType || row.event_type)) || /product|webhook|analytics|live/i.test(clean(row.source)));
  const connectionGood = connection ? goodStatus(connection) : null;
  const healthy = connectionGood !== null ? connectionGood : automaticRows.length ? true : null;
  const configured = connection ? Boolean(connection.configured ?? true) : automaticRows.length ? true : null;
  const attention = hasError(connection || {}) || connectionGood === false && configured === true;
  const eventSuccess = newestTimestamp(automaticRows.map((row) => row.capturedAt || row.createdAt || row.created_at || row.updatedAt || row.updated_at));
  const checked = newestTimestamp([connection?.lastSyncAt, eventSuccess]);
  const success = newestTimestamp([connectionGood ? connection?.lastSyncAt : null, eventSuccess]);
  const status = statusFromEvidence({ healthy, configured, attention });
  return component({
    id:"analytics",
    status,
    summary:status.key === "healthy" ? "Website activity reporting is available."
      : status.key === "needs_attention" ? "Website activity reporting needs attention."
        : "Website analytics are not connected.",
    lastCheckedAt:checked,
    lastSuccessfulAt:success,
    actionHref:"#settings"
  });
}

function backgroundJobsComponent(state, context, now) {
  const runs = sorted(visibleRecords(state, "heartbeatRuns", context.role), ["ranAt", "startedAt", "createdAt", "created_at"]);
  const latest = runs[0] || null;
  const checked = validTimestamp(latest?.ranAt || latest?.startedAt || latest?.createdAt || latest?.created_at);
  const recent = checked ? timestampMs(now) - timestampMs(checked) <= 2 * 86400000 : false;
  const successfulRuns = runs.filter((run) => SUCCESS_WORDS.test(clean(run.status)) && !FAILURE_WORDS.test(clean(run.status)));
  const success = newestTimestamp(successfulRuns.map((run) => run.ranAt || run.completedAt || run.createdAt || run.created_at));
  const latestGood = latest ? SUCCESS_WORDS.test(clean(latest.status)) && !FAILURE_WORDS.test(clean(latest.status)) : null;
  const attention = Boolean(latest && (!recent || latestGood === false));
  const status = statusFromEvidence({ healthy:latest ? Boolean(recent && latestGood) : null, configured:latest ? true : null, attention });
  return component({
    id:"background_jobs",
    status,
    summary:status.key === "healthy" ? "Scheduled background checks are running."
      : status.key === "needs_attention" ? "Scheduled background checks need attention."
        : "No recent background check is available.",
    lastCheckedAt:checked,
    lastSuccessfulAt:success
  });
}

function overallHealth(components) {
  const needsAttention = components.filter((item) => item.status.key === "needs_attention").length;
  const healthy = components.filter((item) => item.status.key === "healthy").length;
  const unavailable = components.filter((item) => item.status.key === "unavailable").length;
  const status = needsAttention ? FOUNDER_HEALTH_STATUSES.needs_attention
    : healthy ? FOUNDER_HEALTH_STATUSES.healthy : FOUNDER_HEALTH_STATUSES.unavailable;
  return {
    status,
    summary:status.key === "needs_attention" ? `${needsAttention} area${needsAttention === 1 ? " needs" : "s need"} attention.`
      : status.key === "healthy" ? `${healthy} area${healthy === 1 ? " is" : "s are"} healthy${unavailable ? `; ${unavailable} unavailable.` : "."}`
        : "No recent company health information is available.",
    counts:{ healthy, needsAttention, unavailable }
  };
}

function lastSuccessfulOperation(components) {
  const successful = components.filter((item) => item.lastSuccessfulAt)
    .sort((left, right) => timestampMs(right.lastSuccessfulAt) - timestampMs(left.lastSuccessfulAt));
  const latest = successful[0] || null;
  return latest ? {
    available:true,
    label:`${latest.label} check completed`,
    area:latest.label,
    occurredAt:latest.lastSuccessfulAt
  } : { available:false, label:"No recent successful operation is recorded.", area:null, occurredAt:null };
}

function advancedView(state, context, components, requested) {
  if (!requested) return { available:false, reason:"not_requested", checks:[] };
  if (!context.canViewAdvanced) return { available:false, reason:"diagnostic_access_required", checks:[] };
  const checks = components.map((item) => ({
    id:item.id,
    label:item.label,
    status:item.status,
    lastCheckedAt:item.lastCheckedAt,
    lastSuccessfulAt:item.lastSuccessfulAt,
    detail:item.status.key === "healthy" ? "Latest bounded check passed."
      : item.status.key === "needs_attention" ? "Latest bounded check did not pass."
        : "No bounded check is available."
  }));
  const snapshot = latestHealthSnapshot(state, context.role);
  const protection = lower(snapshot?.auth_hardening?.endpoint_protection?.status);
  if (protection) checks.push({
    id:"request_protection",
    label:"Request protection",
    status:protection === "protected" ? FOUNDER_HEALTH_STATUSES.healthy : FOUNDER_HEALTH_STATUSES.needs_attention,
    lastCheckedAt:validTimestamp(snapshot?.generated_at),
    lastSuccessfulAt:protection === "protected" ? validTimestamp(snapshot?.generated_at) : null,
    detail:protection === "protected" ? "The latest request-protection check passed." : "The latest request-protection check needs review."
  });
  const leakage = lower(snapshot?.auth_hardening?.secret_leakage?.status);
  if (leakage) checks.push({
    id:"response_safety",
    label:"Response safety",
    status:leakage === "leak_detected" ? FOUNDER_HEALTH_STATUSES.needs_attention : FOUNDER_HEALTH_STATUSES.healthy,
    lastCheckedAt:validTimestamp(snapshot?.generated_at),
    lastSuccessfulAt:leakage === "leak_detected" ? null : validTimestamp(snapshot?.generated_at),
    detail:leakage === "leak_detected" ? "The latest response-safety check needs review." : "The latest response-safety check passed."
  });
  return {
    available:true,
    reason:null,
    summary:"Bounded health checks only. Sensitive settings and raw operational output are omitted.",
    checks:checks.slice(0, 16)
  };
}

export function buildFounderCompanyHealth(state = {}, actor = {}, now = "", options = {}) {
  const context = actorContext(actor);
  const generatedAt = validTimestamp(now);
  if (!context.authorized) return deepFreeze({
    available:false,
    generatedAt:generatedAt || null,
    availability:{ state:"not_authorized", reason:"read_access_required" },
    overall:{ status:FOUNDER_HEALTH_STATUSES.unavailable, summary:"Company Health is not available for this account.", counts:{ healthy:0, needsAttention:0, unavailable:0 } },
    components:[],
    lastSuccessfulOperation:{ available:false, label:"No recent successful operation is recorded.", area:null, occurredAt:null },
    advanced:{ available:false, reason:"diagnostic_access_required", checks:[] },
    safety:{ fullStateReturned:false, rawLogsReturned:false, sensitiveSettingsReturned:false, externalActions:0 }
  });
  if (!generatedAt) return deepFreeze({
    available:false,
    generatedAt:null,
    availability:{ state:"unavailable", reason:"valid_timestamp_required" },
    overall:{ status:FOUNDER_HEALTH_STATUSES.unavailable, summary:"Company Health is unavailable.", counts:{ healthy:0, needsAttention:0, unavailable:0 } },
    components:[],
    lastSuccessfulOperation:{ available:false, label:"No recent successful operation is recorded.", area:null, occurredAt:null },
    advanced:{ available:false, reason:"not_requested", checks:[] },
    safety:{ fullStateReturned:false, rawLogsReturned:false, sensitiveSettingsReturned:false, externalActions:0 }
  });
  const snapshot = latestHealthSnapshot(state, context.role);
  const components = [
    applicationComponent(state, context, snapshot),
    supabaseComponent(state, context, snapshot),
    authenticationComponent(state, context, snapshot),
    storageComponent(state, context, snapshot),
    googleComponent(state, context),
    emailComponent(state, context),
    stripeComponent(state, context),
    analyticsComponent(state, context),
    backgroundJobsComponent(state, context, generatedAt)
  ];
  return deepFreeze({
    available:true,
    generatedAt,
    availability:{ state:"available", reason:null },
    overall:overallHealth(components),
    components,
    lastSuccessfulOperation:lastSuccessfulOperation(components),
    advanced:advancedView(state, context, components, options.advanced === true),
    safety:{
      fullStateReturned:false,
      rawLogsReturned:false,
      sensitiveSettingsReturned:false,
      internalNamesReturned:false,
      externalActions:0
    }
  });
}
