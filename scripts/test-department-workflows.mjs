import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

const checks = [
  ["Today", /Your founder standup for the day|Founder Focus|Department Pulse|Standup Board/],
  ["Work", /Manage execution|Capture → Prioritize → Execute|My Tasks|Blockers|Daily Closeout/],
  ["Marketing", /Run content, social, and PR|Social Media Manager|PR Outreach|Marketing Stats/],
  ["Data Room", /Investor Materials|Formation & Legal|Cap Table|Diligence Checklist/],
  ["Partnerships", /Pipeline|Active Partners|Follow-ups|Partner Proof/],
  ["KPIs", /KPI Dashboard|Weekly Scorecard|Metrics Needing Update|Goals/],
  ["Proof", /Wins|Customer notes|Testimonials|Proof ready for marketing|Proof ready for investors/],
  ["Search", /Search tasks, marketing, documents, partners, metrics, proof, and notes|result groups|Tasks|Marketing|Data Room/]
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, `${label} should render its founder workflow.`);
}

console.log("department workflow tests passed");
