import { createMemoryDevStorage } from "./memory-dev.mjs";
import { createPostgresStorage } from "./postgres.mjs";
import { durableEntityTypes } from "./migrations.mjs";
import { assertProductionReadiness, isHostedProduction, productionReadiness } from "../../scripts/runtime-security.mjs";

export const requiredProductionEnv = [
  "COMMAND_CENTER_OWNER_TOKEN",
  "COMMAND_CENTER_SESSION_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OAUTH_TOKEN_ENCRYPTION_KEY",
  "OAUTH_STATE_SECRET",
  "ASSET_SIGNING_SECRET"
];

export const socialDurableFields = [
  "id",
  "type",
  "channel",
  "title",
  "body",
  "source",
  "planned_date",
  "status",
  "created_at",
  "updated_at",
  "manually_published_at",
  "published_url"
];

export function isProductionLike(env = process.env) {
  return isHostedProduction(env);
}

export function assertProductionDatabaseConfigured(env = process.env) {
  assertProductionReadiness(env, { activeStorageBackend: env.STORAGE_BACKEND === "supabase" ? "supabase" : "unavailable" });
  return true;
}

export function databaseReadiness(env = process.env) {
  const result = productionReadiness(env, { activeStorageBackend: env.STORAGE_BACKEND === "supabase" ? "supabase" : "unavailable" });
  const configured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    configured,
    requiredInProduction: true,
    storageMode: configured ? "supabase" : isProductionLike(env) ? "unavailable" : "memory-dev",
    safeForProductionWrites: result.ok && configured,
    message: configured
      ? "Durable Supabase storage is configured."
      : isProductionLike(env)
        ? "Supabase configuration is missing. Hosted startup fails closed."
        : "Development storage can use memory-dev or local fixtures only."
  };
}

export async function createDurableStorage({ env = process.env, pg } = {}) {
  if (isProductionLike(env)) throw new Error("The legacy DATABASE_URL adapter is disabled for hosted production; use the active Supabase adapter.");
  if (env.DATABASE_URL) return createPostgresStorage({ databaseUrl: env.DATABASE_URL, pg });
  assertProductionDatabaseConfigured(env);
  return createMemoryDevStorage({ env });
}

export { createMemoryDevStorage, createPostgresStorage, durableEntityTypes };
