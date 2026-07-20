import assert from "node:assert/strict";

import { readFilesHome } from "./ui-api/files-read.mjs";
import { renderFilesHome } from "./ui/pages/files-home.mjs";
import { buildFilesHome } from "./ui/view-models/files-home.mjs";

const actor = { authenticated:true, role:"owner" };
const secret = "synthetic-files-cursor-secret";
const state = {
  reports:[
    { id:"report-1", title:"Campaign report", status:"draft", campaignId:"campaign-1", updatedAt:"2026-07-19T10:00:00.000Z", owner:"Roger", starred:true },
    { id:"hidden-report", title:"Hidden", status:"draft", allowedRoles:["admin"] }
  ],
  dataRoomItems:[
    { id:"investor-1", title:"Company overview", fileName:"overview.pdf", status:"current", section:"investor-room", updatedAt:"2026-07-19T12:00:00.000Z", owner:"Roger" },
    { id:"trash-1", title:"Old plan", fileName:"old.pdf", status:"archived", filesDisposition:"trash" }
  ],
  evidencePackNotes:[{ id:"evidence-1", title:"Control note", status:"needs_update" }],
  soc2Evidence:[], soc2Policies:[],
  brandAssets:[{ id:"logo-1", name:"White logo", mimeType:"image/png", approved:true, shared:true }],
  activityEvents:[], auditHistory:[]
};

const home = buildFilesHome(state, actor, { limit:2 }, { cursorSecret:secret });
assert.equal(home.items.length, 2);
assert.equal(home.pagination.total, 4);
assert.ok(home.pagination.nextCursor && !home.pagination.nextCursor.includes("offset"));
assert.equal(home.summary.available, 4);
assert.equal(home.summary.trash, 1);
assert.equal(home.summary.starred, 1);
assert.equal(home.summary.shared, 1);
assert.equal(home.items.some((item) => item.name === "Hidden"), false);
assert.equal(JSON.stringify(home).includes("hidden-report"), false);
assert.throws(() => buildFilesHome(state, actor, { limit:2, cursor:`${home.pagination.nextCursor}x` }, { cursorSecret:secret }), /invalid/);
assert.throws(() => buildFilesHome(state, actor, { limit:2, cursor:home.pagination.nextCursor, search:"changed" }, { cursorSecret:secret }), /does not match/);
const second = readFilesHome({ state, actor, query:{ limit:2, cursor:home.pagination.nextCursor }, cursorSecret:secret });
assert.equal(second.items.length, 2);
assert.equal(second.pagination.nextCursor, null);

const investor = buildFilesHome(state, actor, { collection:"investor-room" }, { cursorSecret:secret });
assert.deepEqual(investor.items.map((item) => item.id), ["data-room-item:investor-1"]);
const starred = buildFilesHome(state, actor, { view:"starred" }, { cursorSecret:secret });
assert.deepEqual(starred.items.map((item) => item.id), ["report:report-1"]);
const trash = buildFilesHome(state, actor, { view:"trash" }, { cursorSecret:secret });
assert.deepEqual(trash.items.map((item) => item.id), ["data-room-item:trash-1"]);
const filteredEmpty = buildFilesHome(state, actor, { search:"not present" }, { cursorSecret:secret });
assert.equal(filteredEmpty.items.length, 0);
assert.match(renderFilesHome(filteredEmpty), /data-guided-empty-kind="filtered-empty"/);
assert.match(renderFilesHome(filteredEmpty), /No matches in this view/);
assert.match(renderFilesHome(filteredEmpty), /data-guided-empty-action="clear-filters"/);
assert.match(renderFilesHome(home), /data-files-new/);
assert.match(renderFilesHome(home), /#files\/data-room-item\/investor-1/);
assert.doesNotMatch(renderFilesHome(home), /Hidden|hidden-report/);
assert.deepEqual(buildFilesHome(state, { authenticated:false, role:"owner" }, {}, { cursorSecret:secret }).items, []);

console.log("Files home tests passed.");
