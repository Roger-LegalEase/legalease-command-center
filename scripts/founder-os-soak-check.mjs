#!/usr/bin/env node
// Soak gate for the Founder OS releases.
//
// A release may only merge after the PREVIOUS release has been live and healthy for at
// least two hours. This replaces the pacing Roger would have applied by hand: it is not
// enough that a deploy verified once, it has to still be the deployed commit, still
// connected, and still serving every workspace route some hours later.
//
// It is read-only: the same public GETs the post-deploy verification uses, plus one local
// `git log` to read when the commit landed. It needs no credentials and changes nothing.
//
// Usage:
//   node scripts/founder-os-soak-check.mjs --commit <sha> [--min-hours 2] [--base-url <url>]
//
// Exit 0 = soak satisfied, the next release may merge.
// Exit 1 = not satisfied, with the reason and every observed value.

import { execFileSync } from "node:child_process";

import { verifyOnce } from "./post-deploy-verify.mjs";

const DEFAULT_BASE_URL = "https://legalease-command-center-prod.onrender.com";
const DEFAULT_MIN_HOURS = 2;

function readArgument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function commitLandedAt(sha) {
  // Committer date of the squash commit on main is when the release landed, which is the
  // earliest the deploy could have started.
  const iso = execFileSync("git", ["log", "-1", "--format=%cI", sha], { encoding: "utf8" }).trim();
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) throw new Error(`Could not read a commit date for ${sha}.`);
  return { iso, epoch: parsed };
}

const commit = readArgument("commit");
const baseUrl = readArgument("base-url", DEFAULT_BASE_URL).replace(/\/+$/, "");
const minHours = Number(readArgument("min-hours", String(DEFAULT_MIN_HOURS)));

if (!/^[0-9a-f]{40}$/.test(commit)) {
  console.error("A full 40-character --commit sha is required.");
  process.exit(2);
}

const landed = commitLandedAt(commit);
const elapsedHours = (Date.now() - landed.epoch) / 3_600_000;
const { failures, observed, deployedCommit, supabaseState } = await verifyOnce(baseUrl, commit);

const soakFailures = [...failures];
if (elapsedHours < minHours) {
  soakFailures.push(
    `soak is ${elapsedHours.toFixed(2)}h, needs ${minHours}h ` +
    `(commit landed ${landed.iso})`
  );
}

console.log("SOAK_EVIDENCE " + JSON.stringify({
  commit,
  landedAt: landed.iso,
  elapsedHours: Number(elapsedHours.toFixed(3)),
  minHours,
  deployedCommit,
  supabaseState,
  checkedAt: new Date().toISOString(),
  observed
}));

if (soakFailures.length) {
  console.error("\nSoak gate NOT satisfied:");
  for (const failure of soakFailures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Soak satisfied: ${commit.slice(0, 7)} has been live and healthy for ${elapsedHours.toFixed(2)}h.`);
