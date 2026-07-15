#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertNoSuppressedOutreachTask,
  canCreateRcapOutreachTask,
  generateRcapRevenueQueueTasks,
  isRcapContactSuppressed
} from "./rcap-revenue-os.mjs";

const source = readFileSync(join(process.cwd(), "scripts", "rcap-revenue-os.mjs"), "utf8");
const previewServer = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");
const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
const selfName = "scripts/test-rcap-suppression-matrix.mjs";

function functionBody(name) {
  const marker = `export function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const nextExport = source.indexOf("\nexport function ", start + marker.length);
  return nextExport > start ? source.slice(start, nextExport) : source.slice(start);
}

function taskStateFor(contactPatch = {}) {
  const account = {
    account_id: "A-SUPPRESS",
    source_prospect_id: "P-SUPPRESS",
    organization_name: "Suppression Matrix Legal Aid",
    segment: "A1",
    priority_tier: "Tier 1",
    priority_score: 98,
    account_status: "Engaged",
    owner: "Roger",
    next_action_date: "2026-06-10",
    source_import_id: "matrix-import"
  };
  const contact = {
    contact_id: "C-SUPPRESS",
    linked_account_id: "A-SUPPRESS",
    contact_name: "Suppressed Decision Maker",
    title: "Chief Executive Officer",
    decision_role: "CEO",
    public_email: "suppressed@example.com",
    source_confidence: "High",
    suppression_status: "Active",
    bounced: false,
    unsubscribed: false,
    email_status: "Verified",
    sequence_status: "Not Enrolled",
    source_import_id: "matrix-import",
    ...contactPatch
  };
  const deal = {
    deal_seed_id: "D-SUPPRESS",
    linked_account_id: "A-SUPPRESS",
    linked_contact_id: "C-SUPPRESS",
    proposed_offer: "RCAP pilot",
    funding_source: "Foundation grant",
    likely_decision_maker: "Suppressed Decision Maker",
    source_import_id: "matrix-import"
  };
  return {
    account,
    contact,
    state: {
      rcapRevenueAccounts: [account],
      rcapRevenueContacts: [contact],
      rcapRevenueDealSeeds: [deal],
      rcapRevenueImportBatches: [],
      rcapRevenueQueueTasks: []
    }
  };
}

const suppressionVariants = [
  ["unsubscribed true", { unsubscribed: true }],
  ["bounced true", { bounced: true }],
  ["status Unsubscribed", { suppression_status: "Unsubscribed" }],
  ["status Bounced", { suppression_status: "Bounced" }],
  ["status Suppressed", { suppression_status: "Suppressed" }],
  ["status Do Not Contact", { suppression_status: "Do Not Contact" }],
  ["status unsubscribed", { suppression_status: "unsubscribed" }],
  ["status bounced", { suppression_status: "bounced" }],
  ["status suppressed", { suppression_status: "suppressed" }],
  ["status do not contact", { suppression_status: "do not contact" }],
  ["status padded Do Not Contact", { suppression_status: " Do Not Contact " }],
  ["status uppercase DO NOT CONTACT", { suppression_status: "DO NOT CONTACT" }],
  ["active plus unsubscribed true", { suppression_status: "Active", unsubscribed: true }],
  ["active plus bounced true", { suppression_status: "Active", bounced: true }],
  ["active plus unsubscribed true bounced false", { suppression_status: "Active", unsubscribed: true, bounced: false }],
  ["active plus unsubscribed false bounced true", { suppression_status: "Active", unsubscribed: false, bounced: true }],
  ["verified plus unsubscribed true", { suppression_status: "Verified", unsubscribed: true }],
  ["verified plus bounced true", { suppression_status: "Verified", bounced: true }]
];

const outreachAdjacentTypes = new Set([
  "RCAP Outreach Approval",
  "RCAP Follow-Up",
  "RCAP Proposal Task",
  "RCAP Deal Task",
  "RCAP Onboarding Task"
]);
const suppressedSafeTypes = new Set([
  "RCAP Data Cleanup",
  "RCAP Contact Research"
]);
const forbiddenLanguage = /call|send|sent|email ready|gmail|calendar|sms|enroll|ready to enroll|active sequence|sequence ready|send-ready|enroll-ready|approval-ready/i;

const unsuppressed = taskStateFor();
const unsuppressedResult = generateRcapRevenueQueueTasks(unsuppressed.state, { now:"2026-06-11T13:00:00.000Z", owner:"owner" });
const unsuppressedTypes = new Set(unsuppressedResult.state.rcapRevenueQueueTasks.map(task => task.task_type));
assert(unsuppressedTypes.has("RCAP Outreach Approval"), "control fixture should create Outreach Approval when not suppressed.");
assert(unsuppressedTypes.has("RCAP Follow-Up"), "control fixture should create Follow-Up when not suppressed.");
assert(unsuppressedTypes.has("RCAP Proposal Task"), "control fixture should create Proposal Task when not suppressed.");

for (const [label, patch] of suppressionVariants) {
  const { account, contact, state } = taskStateFor(patch);
  assert.equal(isRcapContactSuppressed(contact), true, `${label}: contact should be classified as suppressed.`);
  assert.equal(canCreateRcapOutreachTask(contact), false, `${label}: outreach gate should block without account context.`);
  assert.equal(canCreateRcapOutreachTask(contact, account), false, `${label}: outreach gate should block with account context.`);
  assert.throws(
    () => assertNoSuppressedOutreachTask({ task_type:"RCAP Outreach Approval" }, contact),
    /Suppressed RCAP contacts/,
    `${label}: central guard should reject suppressed outreach tasks.`
  );

  const result = generateRcapRevenueQueueTasks(state, { now:"2026-06-11T13:00:00.000Z", owner:"owner" });
  const contactTasks = result.state.rcapRevenueQueueTasks.filter(task => task.linked_contact_id === contact.contact_id);
  assert(contactTasks.length >= 1, `${label}: suppressed contact should still produce cleanup/internal work.`);
  assert(
    contactTasks.every(task => suppressedSafeTypes.has(task.task_type)),
    `${label}: suppressed contact-linked tasks should be cleanup/research only. Got ${contactTasks.map(task => task.task_type).join(", ")}`
  );
  assert(
    contactTasks.every(task => !outreachAdjacentTypes.has(task.task_type)),
    `${label}: suppressed contact must not create outreach-adjacent task types.`
  );
  for (const task of contactTasks) {
    const taskText = [task.task_type, task.title, task.reason, task.status, task.safe_action_type].join(" ");
    assert(!forbiddenLanguage.test(taskText), `${label}: suppressed-safe task contains forbidden send/enroll language: ${taskText}`);
  }
}

const generatorExports = [...source.matchAll(/export function ([A-Za-z0-9_]*RcapRevenue[A-Za-z0-9_]*QueueTasks|generateRcapRevenueQueueTasks)\b/g)].map(match => match[1]);
assert.deepEqual([...new Set(generatorExports)], ["generateRcapRevenueQueueTasks"], "generateRcapRevenueQueueTasks should be the only exported RCAP queue-task producer.");

const generatorBody = functionBody("generateRcapRevenueQueueTasks");
assert(generatorBody.includes("const add = (task, contact = {}) => {"), "RCAP generator should define one local add chokepoint.");
assert(generatorBody.includes("assertNoSuppressedOutreachTask(task, contact);"), "Local add chokepoint must call assertNoSuppressedOutreachTask.");
const taskObjectCount = (generatorBody.match(/\btask_type:/g) || []).length;
const guardedTaskCallCount = (generatorBody.match(/add\(buildRcapTask\(\{/g) || []).length;
assert.equal(
  guardedTaskCallCount,
  taskObjectCount,
  "Every RCAP task object literal in generateRcapRevenueQueueTasks should be created through add(buildRcapTask(...))."
);
const addBody = generatorBody.slice(generatorBody.indexOf("const add = (task, contact = {}) => {"), generatorBody.indexOf("\n\n  for (const account", generatorBody.indexOf("const add =")));
const generatorWithoutAdd = generatorBody.replace(addBody, "");
for (const forbiddenBypass of ["nextTasks.push", "created.push", "addUniqueTask("]) {
  assert(!generatorWithoutAdd.includes(forbiddenBypass), `RCAP generator should not use ${forbiddenBypass} outside the central add chokepoint.`);
}
assert(!previewServer.includes("/api/rcap-revenue/tasks"), "RCAP-3.0 should not add a second task-generation route.");
assert.equal((previewServer.match(/generateRcapRevenueQueueTasks\(/g) || []).length, 1, "Preview server should call RCAP task generation only from the owner/admin import route.");

for (const requiredScript of [
  `${selfName}`,
  `node --check ${selfName}`,
  `node ${selfName}`
]) {
  assert(packageJson.includes(requiredScript), `package.json should register ${requiredScript}`);
}

console.log(JSON.stringify({
  suppressionVariants: suppressionVariants.map(([label]) => label),
  variantsCovered: suppressionVariants.length,
  structuralTripwire: {
    taskObjectCount,
    guardedTaskCallCount,
    onlyExportedProducer: generatorExports
  },
  conflictingFieldsCovered: suppressionVariants
    .filter(([label]) => /active plus|verified plus/i.test(label))
    .map(([label]) => label)
}, null, 2));
