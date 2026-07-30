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
  const owner_cookie = owner.cookie;
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


  // The two allow-lists (2026-07-30). `assign` and `update_title` were permitted ACTIONS while
  // `owner` and `title` were not permitted KEYS, so the panel's own request came back 400
  // "unsupported information" and the form looked like it had saved nothing. Pinned over the wire.
  {
    const owner = await post("/api/ui/tasks/t-next/action", { action:"assign", owner:"Lawrence", expectedVersion:"legacy" });
    assert.equal(owner.status, 200, `assign must be accepted over the wire, got ${owner.status}`);
    assert.equal(stored().tasks.find((row) => row.id === "t-next").owner, "Lawrence", "and the owner must persist");
    ok("assign passes both the action allow-list and the field allow-list");
    // update_title over the PANEL route additionally needs the fresh expectedVersion handshake and
    // is not asserted here; the rename itself is pinned above on /api/tasks/:id/update_title.
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

  // ---- the stage control, through the request path -------------------------------------------
  // Stage was effectively read-only: the only write required a reply suggestion, and no reply is
  // ever recorded. These cross the ROUTE, not the module, because a route nothing calls and a
  // module nothing routes to are the two failures this project has already shipped.
  {
    const refused = await post("/api/ui/partners/p-elev/stage", { stage:"active_pilot", requestId:"stage-test-unconfirmed-01" });
    assert.equal(refused.status, 400, "an unconfirmed stage change must be refused");
    // The partner API sanitises handler messages to one generic sentence, so the guarantee tested
    // here is the refusal and the absence of a write, not the wording.
    assert.match((await refused.json()).error, /Nothing was saved/, "and must say nothing was saved");

    const invalid = await post("/api/ui/partners/p-elev/stage", { stage:"not_a_stage", confirmed:true, requestId:"stage-test-invalid-000001" });
    assert.equal(invalid.status, 400, "a stage outside the vocabulary is refused");
    assert.match((await invalid.json()).error, /Nothing was saved/);
    assert.equal(stored().partners[0].stage, "pilot", "and nothing was written");
    ok("the stage route refuses an unconfirmed change and an unknown stage");

    const response = await post("/api/ui/partners/p-elev/stage", { stage:"active_pilot", note:"Pilot signed on the call", confirmed:true, requestId:"stage-test-accepted-00001" });
    assert.equal(response.status, 200, `a confirmed valid change is accepted, got ${response.status}`);
    const state = stored();
    assert.equal(state.partners[0].stage, "active_pilot", "the stage moved");
    assert.equal(state.partners[0].status, "active_pilot", "status tracks it, as the suggestion path does");
    const activity = state.activityEvents.find((row) => row.eventType === "stage_changed");
    assert.ok(activity, "a stage_changed activity event is written, identical in type to the suggestion path");
    assert.equal(activity.fromStage, "pilot");
    assert.equal(activity.toStage, "active_pilot");
    const audit = state.auditHistory.find((row) => row.action === "partner_stage_changed");
    assert.ok(audit, "and an audit row");
    assert.match(audit.detail, /pilot to active_pilot/);
    ok("a confirmed change moves the stage and writes the same activity and audit rows");
  }

  // ---- the control on the record actually reaches that route ---------------------------------
  {
    const runtime = readFileSync(new URL("./ui/pages/partner-record.mjs", import.meta.url), "utf8");
    assert.match(runtime, /data-partner-action="set_stage"/, "the record must carry a visible stage control");
    assert.match(runtime, /\/stage"/, "and it must post to the stage route");
    assert.match(runtime, /confirmed:true/, "sending the confirmation the endpoint requires");
    assert.match(runtime, /requestId:"stage-"/, "and the requestId the endpoint requires — without it the control 400s, which is how a dead button ships");
    assert.match(runtime, /window\.confirm\(/, "behind exactly one confirmation");
    ok("the record's stage control posts to the stage route behind one confirmation");
  }
} finally {
  await server.stop();
}

console.log(`\ntask rename and delete: ${passed} checks passed`);
