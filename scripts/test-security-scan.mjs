import assert from "node:assert/strict";
import crypto from "node:crypto";
import { detectSecurityFindings } from "./security-scan-detectors.mjs";

const emailCanary = ["person", "canary.example"].join("@");
const tokenCanary = ["sk", "syntheticcanaryvalue0123456789ABCDEFG"].join("-");
const text = `contact=${emailCanary}\ncredential=${tokenCanary}\n`;
const categories = detectSecurityFindings(text, "synthetic.txt");
assert.equal(categories.get("non_reserved_email"), 1);
assert.equal(categories.get("high_confidence_secret"), 1);
assert.equal(detectSecurityFindings("synthetic", "docs/phaseb-20990101-reconciliation-diff.json").get("sensitive_export_path"), 1);
assert.equal(detectSecurityFindings("synthetic", "docs/ebd3dae7-5a52-4be4-a6fa-5a842780637a.csv").get("sensitive_export_path"), 1);
const safeOutput = JSON.stringify({ path:"synthetic.txt", categories:[...categories], fileFingerprint:crypto.createHash("sha256").update(text).digest("hex").slice(0, 16) });
assert.doesNotMatch(safeOutput, new RegExp(emailCanary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(safeOutput, new RegExp(tokenCanary));
console.log("security scanner synthetic canaries passed");
