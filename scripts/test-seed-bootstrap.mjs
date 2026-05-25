import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "legalease-seed-bootstrap-"));
const dataPath = path.join(tempDir, "social-command-center.json");
const seedPath = path.join(tempDir, "social-command-center.seed.json");

const seedState = {
  settings: { organizationName: "LegalEase Seed Test" },
  posts: [{ id: "seed-post", caption: "Seed post" }],
  contentBank: [{ id: "seed-idea", title: "Seed idea" }]
};

await writeFile(seedPath, JSON.stringify(seedState, null, 2));

process.env.COMMAND_CENTER_DATA_PATH = dataPath;
process.env.COMMAND_CENTER_SEED_PATH = seedPath;
process.env.STORAGE_BACKEND = "json";
process.env.LOCAL_DEMO_MODE = "true";

const { createStore } = await import("./storage.mjs");
const store = createStore({ settings: {}, posts: [], contentBank: [] });
const state = await store.readState();
const written = JSON.parse(await readFile(dataPath, "utf8"));

assert.equal(state.settings.organizationName, "LegalEase Seed Test");
assert.equal(state.posts[0].id, "seed-post");
assert.equal(state.contentBank[0].id, "seed-idea");
assert.equal(written.posts[0].id, "seed-post");

console.log("seed bootstrap test passed");
