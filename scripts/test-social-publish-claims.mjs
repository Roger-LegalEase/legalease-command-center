import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireSocialPublishClaim, reconciliationQueue, transitionSocialPublishClaim } from "./social-publish-service.mjs";

const dir = await mkdtemp(path.join(os.tmpdir(), "leos-social-claim-"));
process.env.COMMAND_CENTER_DATA_PATH = path.join(dir, "state.json");
process.env.COMMAND_CENTER_SEED_PATH = path.join(dir, "missing.json");
const { JsonStore } = await import("./storage.mjs");
const initial = { posts:[{ id:"post-a", status:"approved", approvedAt:"2026-07-13T00:00:00.000Z", _version:1 }], publishClaims:[] };
const one = new JsonStore(initial);
const two = new JsonStore(initial);
await one.writeState(initial);
const post = (await one.readState()).posts[0];
const outcomes = await Promise.all([
  acquireSocialPublishClaim(one, { post, channel:"linkedin", actorId:"owner-a", requestId:"request-a" }),
  acquireSocialPublishClaim(two, { post, channel:"linkedin", actorId:"owner-b", requestId:"request-b" })
]);
assert.equal(outcomes.filter((result) => result.claimed).length, 1);
const won = outcomes.find((result) => result.claimed);
await transitionSocialPublishClaim(one, won.claim.id, "publishing");
assert.equal(reconciliationQueue(await two.readState()).length, 1);
await transitionSocialPublishClaim(two, won.claim.id, "reconciliation_required", { errorCode:"ambiguous_provider_result" });
await assert.rejects(() => transitionSocialPublishClaim(one, won.claim.id, "published"));
console.log("social publish claim tests passed");
