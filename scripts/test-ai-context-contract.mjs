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

assert.match(product, /Today \/ Work \/ Social \/ Proof \/ Search/, "Product contract should preserve main workflow.");
assert.match(product, /Post Idea -> Draft -> Preview -> Ready to Publish -> Publish manually -> Mark published manually/, "Product contract should document Social workflow.");
assert.match(safety, /liveGatesCount.*0/s, "Safety contract should say live gates remain 0.");
assert.match(safety, /Owner-token auth/i, "Safety contract should preserve owner-token auth.");
assert.match(safety, /External actions remain off/i, "Safety contract should keep external actions off.");
assert.match(safety, /Social is manual-only/i, "Safety contract should keep Social manual-only.");
for (const word of ["route", "storage", "Auth", "Tests", "Health", "Social"]) {
  assert.match(arch, new RegExp(word, "i"), `Architecture map should mention ${word}.`);
}

console.log("AI context contract tests passed");
