import crypto from "node:crypto";

const clean = (value = "") => String(value ?? "").trim();

export function parseBoolean(value = "") {
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

export function isHostedProduction(env = process.env) {
  if (clean(env.NODE_ENV).toLowerCase() === "test" || parseBoolean(env.COMMAND_CENTER_TEST_MODE)) return false;
  return clean(env.NODE_ENV).toLowerCase() === "production" || parseBoolean(env.RENDER) || clean(env.LEGALEASE_ENV).toLowerCase() === "production";
}

export function isTestEnvironment(env = process.env) {
  return clean(env.NODE_ENV).toLowerCase() === "test" || parseBoolean(env.COMMAND_CENTER_TEST_MODE);
}

const PLACEHOLDER = /(replace[-_ ]?with|change[-_ ]?me|example|placeholder|dummy|test[-_ ]?(token|secret|key)|your[-_ ]?(token|secret|key)|<[^>]+>)/i;
const REPEATED = /^(.)\1+$/;

export function strongSecret(value, { min = 32 } = {}) {
  const text = clean(value);
  return text.length >= min && !PLACEHOLDER.test(text) && !REPEATED.test(text) && new Set(text).size >= 8;
}

export function webhookRouteEnabled(env = process.env) {
  return clean(env.SENDGRID_WEBHOOK_ENABLED) === "" ? true : parseBoolean(env.SENDGRID_WEBHOOK_ENABLED);
}

export function validSendGridPublicKey(value = "") {
  try {
    const key = crypto.createPublicKey({ key:Buffer.from(clean(value), "base64"), format:"der", type:"spki" });
    return key.asymmetricKeyType === "ec";
  } catch { return false; }
}

export function productEventRouteEnabled(env = process.env) {
  return clean(env.PRODUCT_EVENT_WEBHOOK_ENABLED) === "" ? true : parseBoolean(env.PRODUCT_EVENT_WEBHOOK_ENABLED);
}

export class ProductionReadinessError extends Error {
  constructor(codes = []) {
    super(`Production readiness failed: ${codes.join(", ")}.`);
    this.name = "ProductionReadinessError";
    this.codes = [...codes];
    this.exitCode = 78;
  }
}

export function productionReadiness(env = process.env, { activeStorageBackend = "" } = {}) {
  const hosted = isHostedProduction(env);
  if (!hosted) return { ok: true, hosted: false, errors: [] };

  const errors = [];
  if (clean(env.STORAGE_BACKEND).toLowerCase() !== "supabase") errors.push("durable_storage_backend_required");
  if (activeStorageBackend && activeStorageBackend !== "supabase") errors.push("durable_storage_adapter_not_selected");
  if (!/^https:\/\//i.test(clean(env.SUPABASE_URL))) errors.push("supabase_url_required");
  if (!strongSecret(env.SUPABASE_SERVICE_ROLE_KEY)) errors.push("supabase_service_role_key_required");
  if (!strongSecret(env.COMMAND_CENTER_OWNER_TOKEN || env.COMMAND_CENTER_ACCESS_TOKEN)) errors.push("owner_login_secret_required");
  for (const [name, value] of [["admin", env.COMMAND_CENTER_ADMIN_TOKEN], ["operator", env.COMMAND_CENTER_OPERATOR_TOKEN], ["viewer", env.COMMAND_CENTER_VIEWER_TOKEN || env.COMMAND_CENTER_INVESTOR_TOKEN]]) {
    if (clean(value) && !strongSecret(value)) errors.push(`${name}_login_secret_invalid`);
  }
  if (!strongSecret(env.COMMAND_CENTER_SESSION_SECRET)) errors.push("session_secret_required");
  if (!strongSecret(env.COMMAND_CENTER_CRON_TOKEN)) errors.push("cron_secret_required");
  if (!strongSecret(env.OAUTH_TOKEN_ENCRYPTION_KEY)) errors.push("oauth_encryption_key_required");
  if (!strongSecret(env.OAUTH_STATE_SECRET)) errors.push("oauth_state_secret_required");
  if (!strongSecret(env.ASSET_SIGNING_SECRET)) errors.push("asset_signing_secret_required");
  if (!/^[a-z0-9][a-z0-9._-]{2,62}$/i.test(clean(env.SOCIAL_DRAFT_ASSETS_BUCKET))) errors.push("private_draft_bucket_required");
  if (!/^https:\/\//i.test(clean(env.APP_BASE_URL || env.PUBLIC_APP_BASE_URL))) errors.push("https_app_base_url_required");
  if (webhookRouteEnabled(env) && (!strongSecret(env.SENDGRID_WEBHOOK_PUBLIC_KEY, { min: 40 }) || !validSendGridPublicKey(env.SENDGRID_WEBHOOK_PUBLIC_KEY))) errors.push("sendgrid_webhook_verification_key_required");
  if (productEventRouteEnabled(env) && !strongSecret(env.PRODUCT_EVENT_WEBHOOK_SECRET || env.LEGALEASE_OS_EVENTS_SECRET)) errors.push("product_event_webhook_secret_required");
  if (parseBoolean(env.COMMAND_CENTER_AUTH_DISABLED)) errors.push("authentication_cannot_be_disabled");
  if (parseBoolean(env.LOCAL_DEMO_MODE)) errors.push("local_demo_mode_forbidden");
  if (parseBoolean(env.ALLOW_LOCAL_IMAGE_FALLBACK)) errors.push("local_image_fallback_forbidden");
  return { ok: errors.length === 0, hosted: true, errors };
}

export function assertProductionReadiness(env = process.env, options = {}) {
  const result = productionReadiness(env, options);
  if (!result.ok) throw new ProductionReadinessError(result.errors);
  return result;
}

export function safeStartupError(error) {
  if (error instanceof ProductionReadinessError) return error.message;
  return "Production startup failed securely.";
}
