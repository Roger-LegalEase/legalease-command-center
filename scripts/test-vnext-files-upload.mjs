import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createLocalFilesStorage, createSupabaseFilesStorage, validateFileUpload } from "./files-storage-adapter.mjs";
import { createFilesUploadService } from "./ui-actions/files-upload.mjs";

const actor = { authenticated:true, role:"owner", name:"Roger" };
const root = await mkdtemp(path.join(os.tmpdir(), "ccx-603-files-"));
try {
  let state = { dataRoomItems:[], activityEvents:[], auditHistory:[] };
  let writes = 0;
  const storage = createLocalFilesStorage({ rootDir:root });
  const service = createFilesUploadService({
    readState:async () => structuredClone(state),
    writeCollections:async (patch) => { writes += 1; state = { ...state, ...structuredClone(patch) }; },
    storage,
    now:() => "2026-07-19T14:00:00.000Z",
    randomId:(() => { let value = 0; return () => `fixture-${++value}`; })()
  });
  const bytes = Buffer.from("synthetic file content");
  const uploaded = await service.upload({ actor, input:{ requestId:"request-1", name:"Board update", fileName:"board.md", contentType:"text/markdown", collection:"investor-room" }, bytes });
  assert.equal(uploaded.created, true);
  assert.equal(uploaded.publicUrl, null);
  assert.equal(state.dataRoomItems.length, 1);
  assert.equal(state.dataRoomItems[0].status, "draft");
  assert.equal(state.dataRoomItems[0].filesCollection, "investor-room");
  assert.equal(state.activityEvents.length, 1);
  assert.equal(state.auditHistory.length, 1);
  assert.deepEqual(await readFile(path.join(root, "2026-07-19", "upload-fixture-1", "board.md")), bytes);
  const repeated = await service.upload({ actor, input:{ requestId:"request-1", fileName:"board.md", contentType:"text/markdown" }, bytes });
  assert.equal(repeated.created, false);
  assert.equal(writes, 1);

  const replaced = await service.replace({ actor, replaces:uploaded.fileId, input:{ requestId:"request-2", fileName:"board-v2.md", contentType:"text/markdown" }, bytes:Buffer.from("v2") });
  assert.equal(replaced.versionOf, uploaded.fileId);
  assert.equal(state.dataRoomItems.length, 2);
  assert.equal(state.dataRoomItems[0].previousVersionId, uploaded.fileId);

  const beforeFailure = structuredClone(state);
  const failing = createFilesUploadService({
    readState:async () => structuredClone(state),
    writeCollections:async () => { throw new Error("scoped write failed"); },
    storage,
    now:() => "2026-07-19T14:00:00.000Z",
    randomId:() => "fixture-failed"
  });
  await assert.rejects(failing.upload({ actor, input:{ requestId:"request-failed", fileName:"failed.txt", contentType:"text/plain" }, bytes:Buffer.from("x") }), /scoped write failed/);
  assert.deepEqual(state, beforeFailure, "A failed upload must not create metadata or readiness truth.");
  await assert.rejects(readFile(path.join(root, "2026-07-19", "upload-fixture-failed", "failed.txt")));
  await assert.rejects(service.upload({ actor:{ authenticated:true, role:"viewer" }, input:{ requestId:"denied", fileName:"x.txt", contentType:"text/plain" }, bytes:Buffer.from("x") }), /cannot upload/);
  assert.throws(() => validateFileUpload({ fileName:"../secret.txt", contentType:"text/plain", size:1 }), /valid file name/);
  assert.throws(() => validateFileUpload({ fileName:"script.html", contentType:"text/html", size:1 }), /not supported/);

  const requests = [];
  const hosted = createSupabaseFilesStorage({ baseUrl:"https://project.supabase.co", serviceRoleKey:"synthetic-secret", fetchImpl:async (url, init) => { requests.push({ url:String(url), init }); return { ok:true }; } });
  const hostedResult = await hosted.put({ objectPath:"2026-07-19/file/report.pdf", bytes:Buffer.from("pdf"), contentType:"application/pdf" });
  assert.equal(hostedResult.publicUrl, null);
  assert.equal(hostedResult.objectRef, "supabase://command-center-files/2026-07-19/file/report.pdf");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers["x-upsert"], "false");
  assert.equal(JSON.stringify(hostedResult).includes("synthetic-secret"), false);
} finally {
  await rm(root, { recursive:true, force:true });
}

console.log("Files upload tests passed.");
