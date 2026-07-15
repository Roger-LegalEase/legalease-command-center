import assert from "node:assert/strict";
import { authorizeRequest } from "./access-control.mjs";

const env = { NODE_ENV:"production" };
const anonymous = authorizeRequest({ method:"GET", url:"/", headers:{} }, new URL("https://command.example.com/"), env);
assert.equal(anonymous.ok, false);
assert.equal(anonymous.status, 401);
const owner = authorizeRequest({ method:"GET", url:"/", headers:{}, authenticatedActor:{ id:"session-owner", role:"owner", authenticated:true } }, new URL("https://command.example.com/"), env);
assert.equal(owner.ok, true);
console.log("root shell session boundary tests passed");
