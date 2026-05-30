import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([".git", "node_modules", "data", ".cache", ".local"]);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (/\.(mjs|js|json|md|yaml|yml|example|sql|html|css)$/.test(name)) files.push(full);
  }
  return files;
}

for (const file of walk(root)) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, "utf8");
  if (rel === ".env.example") {
    assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{20,}|postgres:\/\/[^:\s]+:[^@\s]+@[^"\s]+/i, ".env.example must use placeholders only.");
    continue;
  }
  const keyMatches = text.match(/\bsk-[A-Za-z0-9_-]{24,}/g) || [];
  for (const value of keyMatches) {
    assert.match(value, /test|placeholder|redacted/i, `${rel} should not contain likely real API keys.`);
  }
  const dbMatches = text.match(/postgres:\/\/[^:\s]+:[^@\s]+@[^"\s]+/gi) || [];
  for (const value of dbMatches) {
    assert.match(value, /example|placeholder|redacted|USER|PASSWORD/i, `${rel} should not contain a real DATABASE_URL.`);
  }
}

const clientSource = readFileSync("scripts/preview-server.mjs", "utf8");
const htmlShell = clientSource.match(/function htmlShell\(\)[\s\S]*?async function handleRequest/)?.[0] || "";
for (const forbidden of ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "GOOGLE_CLIENT_SECRET", "LINKEDIN_CLIENT_SECRET"]) {
  assert(!htmlShell.includes(forbidden), `Generated client output must not include ${forbidden}.`);
}
assert.doesNotMatch(clientSource, /NEXT_PUBLIC_(OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY)|VITE_(OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY)|REACT_APP_(OPENAI_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY)/, "Server secrets must not use public prefixes.");

console.log("secret exposure tests passed");
