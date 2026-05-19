const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(
    "Missing server-side Supabase env vars. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local. Do not expose service role keys to client code."
  );
  process.exitCode = 1;
} else {
  console.log("Server-side Supabase env vars are present.");
}
