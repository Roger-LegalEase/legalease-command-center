#!/usr/bin/env node
// Task rename and deletion (2026-07-30, approved by Roger).
//
// Deletion is the only task action that destroys rather than transitions, so it is tested through
// the REQUEST PATH rather than the module: the owner guard, the confirmation string and the
// refuse-or-clear rule all live in the handler, and a module-level test would cross none of them.
// That gap is exactly how a filtered approval and a dead run button shipped before.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loginWithCredential, startPreviewServer } from "./test-support/preview-server-harness.mjs";

let passed = 0;
const ok = (name) => { console.log(`  ✓ ${name}`); passed += 1; };

const seed = {
  partners:[{ partner_id:"p-elev", id:"p-elev", name:"Elevation Project", stage:"pilot",
    nextAction:"Send the pilot summary", nextActionDueDate:"2026-08-01", nextFollowUpDate:"2026-08-01" }],
  tasks:[
    { id:"t-plain", title:"Tidy the shared drive", status:"open", owner:"Roger" },
    { id:"t-next", title:"Send the pilot summary", status:"open", owner:"Roger", partnerId:"p-elev" }
  ],
  activityEvents:[], auditHistory:[]
};

const server = await startPreviewServer({ seed, env:{ COMMAND_CENTER_UX_VNEXT:"true", FOUNDER_OS_RELATIONSHIPS:"true" } });
const stored = () => JSON.parse(readFileSync(server.dataPath, "utf8"));
try {
  const owner = await loginWithCredential(server, server.ownerCredential);
  const post = (path, body, auth = owner) => fetch(`${server.baseUrl}${path}`, {
    method:"POST",
    headers:{ cookie:auth.cookie, "content-type":"application/json", "x-csrf-token":auth.csrfToken },
    body:JSON.stringify(body || {})
  });

  // ---- rename, over the wire ----------------------------------------------------------------
  {
    const response = await post("/api/tasks/t-plain/update_title", { title:"Tidy the shared drive folders" });
    assert.equal(response.status, 200, "rename must be accepted");
    const task = stored().tasks.find((row) => row.id === "t-plain");
    assert.equal(task.title, "Tidy the shared drive folders");
    ok("update_title renames through the request path and persists");
  }

  // ---- deletion removes exactly one row ------------------------------------------------------
  {
    const before = stored().tasks.length;
    const response = await post("/api/tasks/t-plain/delete");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.deleted, true);
    assert.equal(body.title, "Tidy the shared drive folders", "the response names what it removed, for the confirmation");
    const after = stored().tasks;
    assert.equal(after.length, before - 1, "exactly one row is removed");
    assert.ok(!after.some((row) => row.id === "t-plain"), "and it is the requested one");
    assert.ok(after.some((row) => row.id === "t-next"), "the other task is untouched");
    ok("deletion removes exactly one row and names the title it removed");
  }

  // ---- refuse-or-clear: a next action cannot be orphaned -------------------------------------
  {
    const refused = await post("/api/tasks/t-next/delete");
    const body = await refused.json();
    assert.equal(refused.status, 409, "deleting a next action must refuse the first time");
    assert.match(body.error, /Elevation Project/, "the refusal names the relationship it would strand");
    assert.match(body.error, /Send the pilot summary/, "and the task it would remove");
    assert.ok(stored().tasks.some((row) => row.id === "t-next"), "nothing was deleted by the refusal");
    assert.equal(stored().partners[0].nextAction, "Send the pilot summary", "and the record still has its next action");
    ok("deleting a relationship's next action refuses, naming the relationship and the task");

    const confirmed = await post("/api/tasks/t-next/delete", { clearNextAction:true });
    assert.equal(confirmed.status, 200, "confirming proceeds");
    const state = stored();
    assert.ok(!state.tasks.some((row) => row.id === "t-next"), "the task is gone");
    assert.equal(state.partners[0].nextAction, "", "and the next action was cleared in the same write");
    assert.equal(state.partners[0].nextActionDueDate, "", "including its due date");
    ok("confirming clears the next action in the same write, so the record is never orphaned");
  }

  // ---- a missing task is a 404, not a silent success -----------------------------------------
  {
    const response = await post("/api/tasks/t-missing/delete");
    assert.equal(response.status, 404);
    ok("deleting a task that does not exist is a 404");
  }

  // ---- authorization -------------------------------------------------------------------------
  {
    const anonymous = await fetch(`${server.baseUrl}/api/tasks/t-plain/delete`, { method:"POST" });
    assert.ok([401, 403].includes(anonymous.status), `an unauthenticated delete must be refused, got ${anonymous.status}`);
    ok("an unauthenticated delete is refused");
  }
} finally {
  await server.stop();
}

console.log(`\ntask rename and delete: ${passed} checks passed`);
