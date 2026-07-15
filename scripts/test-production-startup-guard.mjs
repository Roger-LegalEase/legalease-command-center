import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { authRequiredForEnv } from "./access-control.mjs";
import { ProductionReadinessError, assertProductionReadiness, isHostedProduction, productionReadiness } from "./runtime-security.mjs";

const { publicKey } = crypto.generateKeyPairSync("ec", { namedCurve:"prime256v1" });
const webhookKey = publicKey.export({ type:"spki", format:"der" }).toString("base64");
const secret = (label) => `9q-${label}-A7v!m2Zx#4Lp8Wc6Rk3Tn5Ys1Hd0`;
const ready = {
  NODE_ENV:"production", STORAGE_BACKEND:"supabase", SUPABASE_URL:"https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:secret("supabase"), COMMAND_CENTER_OWNER_TOKEN:secret("owner"),
  COMMAND_CENTER_SESSION_SECRET:secret("session"), COMMAND_CENTER_CRON_TOKEN:secret("cron"),
  OAUTH_TOKEN_ENCRYPTION_KEY:secret("encryption"), OAUTH_STATE_SECRET:secret("oauth-state"),
  ASSET_SIGNING_SECRET:secret("asset"), SENDGRID_WEBHOOK_ENABLED:"true", SENDGRID_WEBHOOK_PUBLIC_KEY:webhookKey,
  SOCIAL_DRAFT_ASSETS_BUCKET:"social-draft-assets-private",
  PRODUCT_EVENT_WEBHOOK_ENABLED:"true", PRODUCT_EVENT_WEBHOOK_SECRET:secret("product-event"),
  APP_BASE_URL:"https://command.example.com", LOCAL_DEMO_MODE:"false", ALLOW_LOCAL_IMAGE_FALLBACK:"false"
};

assert.equal(productionReadiness(ready, { activeStorageBackend:"supabase" }).ok, true);
for (const [name, env, code] of [
  ["missing durable storage", { ...ready, STORAGE_BACKEND:"" }, "durable_storage_backend_required"],
  ["json production", { ...ready, STORAGE_BACKEND:"json" }, "durable_storage_backend_required"],
  ["render missing auth", { ...ready, NODE_ENV:"development", RENDER:"true", COMMAND_CENTER_OWNER_TOKEN:"" }, "owner_login_secret_required"],
  ["missing encryption", { ...ready, OAUTH_TOKEN_ENCRYPTION_KEY:"" }, "oauth_encryption_key_required"],
  ["missing webhook key", { ...ready, SENDGRID_WEBHOOK_PUBLIC_KEY:"" }, "sendgrid_webhook_verification_key_required"]
]) {
  const result = productionReadiness(env, { activeStorageBackend:env.STORAGE_BACKEND });
  assert.equal(result.ok, false, name);
  assert(result.errors.includes(code), name);
}
assert.equal(productionReadiness({ NODE_ENV:"development", STORAGE_BACKEND:"json", LOCAL_DEMO_MODE:"true" }, { activeStorageBackend:"json" }).ok, true);
assert.equal(isHostedProduction({ NODE_ENV:"test", RENDER:"true", COMMAND_CENTER_TEST_MODE:"true" }), false);
assert.equal(authRequiredForEnv({ NODE_ENV:"production", STORAGE_BACKEND:"" }), true);
const sensitive = secret("must-not-appear");
assert.throws(() => assertProductionReadiness({ ...ready, COMMAND_CENTER_SESSION_SECRET:sensitive, SUPABASE_URL:"" }, { activeStorageBackend:"supabase" }), (error) => {
  assert(error instanceof ProductionReadinessError);
  assert(!error.message.includes(sensitive));
  return true;
});
const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
assert(source.indexOf("assertProductionReadiness") < source.indexOf("http.createServer"));
console.log("production startup guard tests passed");
