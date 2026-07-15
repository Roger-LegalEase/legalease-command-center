import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startPreviewServer } from "./test-support/preview-server-harness.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
const inventory = await readFile(new URL("../docs/privacy-data-inventory.md", import.meta.url), "utf8");
assert.match(source, /href="\/privacy"/);
for (const category of ["Social connectors", "Draft assets", "Security and audit", "Gmail and Calendar"]) assert(inventory.includes(category));

const server = await startPreviewServer();
try {
  const response = await fetch(`${server.baseUrl}/privacy`);
  const html = await response.text();
  assert.equal(response.status, 200);
  for (const phrase of ["Privacy Policy", "Last updated", "Data collected", "How data is used", "Storage and providers", "Access and deletion", "Draft uploads", "live gate defaults off"]) assert(html.includes(phrase), `/privacy must include ${phrase}.`);
  assert.doesNotMatch(html, /GDPR compliant|SOC 2 certified|certified compliant/i);
  assert.doesNotMatch(html, /credential|token value|service role key/i);
} finally {
  await server.stop();
}
console.log("privacy route tests passed");
