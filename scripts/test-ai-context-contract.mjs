import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const requiredDocs = [
  "docs/product-contract.md",
  "docs/architecture-map.md",
  "docs/safety-contract.md",
  "docs/founder-language-guide.md",
  "docs/data-model.md",
  "docs/test-matrix.md",
  "docs/ai-change-rules.md"
];
for (const file of requiredDocs) assert(existsSync(file), `${file} should exist.`);

const product = readFileSync("docs/product-contract.md", "utf8");
const safety = readFileSync("docs/safety-contract.md", "utf8");
const arch = readFileSync("docs/architecture-map.md", "utf8");

assert.match(product, /Today, Queue, Campaigns, Review Desk, Reports, and More/, "Product contract should preserve the current founder workflow.");
assert.match(product, /claim-before-call/i, "Product contract should document outbound claims.");
assert.match(safety, /defaults off/i, "Safety contract should keep every live gate off by default.");
assert.match(safety, /opaque sessions in HttpOnly cookies/i, "Safety contract should require server-managed sessions.");
assert.match(safety, /claim-before-call/i, "Safety contract should document durable outbound claims.");
assert.match(safety, /single-use/i, "Safety contract should document OAuth state consumption.");
for (const word of ["route", "storage", "Auth", "Tests", "Health", "Social"]) {
  assert.match(arch, new RegExp(word, "i"), `Architecture map should mention ${word}.`);
}

console.log("AI context contract tests passed");
