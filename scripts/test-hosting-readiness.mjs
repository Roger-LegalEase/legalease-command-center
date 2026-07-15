import "./test-production-startup-guard.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = await readFile(new URL("../render.yaml", import.meta.url), "utf8");
assert.match(manifest, /STORAGE_BACKEND\s*\n\s*value: supabase/);
for (const variable of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","COMMAND_CENTER_OWNER_TOKEN","COMMAND_CENTER_SESSION_SECRET","OAUTH_TOKEN_ENCRYPTION_KEY","OAUTH_STATE_SECRET","ASSET_SIGNING_SECRET","SENDGRID_WEBHOOK_PUBLIC_KEY"]) {
  assert.match(manifest, new RegExp(`key: ${variable}\\s*\\n\\s*sync: false`));
}
for (const gate of ["ENABLE_LIVE_LINKEDIN_POSTING","ENABLE_LIVE_FACEBOOK_POSTING","ENABLE_LIVE_INSTAGRAM_POSTING","ENABLE_LIVE_X_POSTING","REACTIVATION_LIVE_SEND","OUTREACH_LIVE_SEND"]) {
  assert.match(manifest, new RegExp(`key: ${gate}\\s*\\n\\s*value: "false"`));
}
console.log("hosting readiness tests passed");
