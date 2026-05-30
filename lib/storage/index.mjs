import { createMemoryDevStorage } from "./memory-dev.mjs";
import { createPostgresStorage } from "./postgres.mjs";
import { durableEntityTypes } from "./migrations.mjs";

export const requiredProductionEnv = [
  "COMMAND_CENTER_OWNER_TOKEN",
  "DATABASE_URL"
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
  return env.NODE_ENV === "production" || env.RENDER === "true" || env.LEGALEASE_ENV === "production";
}

export function assertProductionDatabaseConfigured(env = process.env) {
  if (isProductionLike(env) && !env.DATABASE_URL) {
    throw new Error("Production durable storage is unavailable. Set DATABASE_URL before enabling production writes.");
  }
  return true;
}

export function databaseReadiness(env = process.env) {
  const configured = Boolean(env.DATABASE_URL);
  return {
    configured,
    requiredInProduction: true,
    storageMode: configured ? "postgres" : isProductionLike(env) ? "unavailable" : "memory-dev",
    safeForProductionWrites: configured,
    message: configured
      ? "Durable Postgres storage is configured."
      : isProductionLike(env)
        ? "DATABASE_URL is missing. Production writes must fail safely instead of using local files."
        : "Development storage can use memory-dev or local fixtures only."
  };
}

export async function createDurableStorage({ env = process.env, pg } = {}) {
  if (env.DATABASE_URL) return createPostgresStorage({ databaseUrl: env.DATABASE_URL, pg });
  assertProductionDatabaseConfigured(env);
  return createMemoryDevStorage({ env });
}

export { createMemoryDevStorage, createPostgresStorage, durableEntityTypes };
