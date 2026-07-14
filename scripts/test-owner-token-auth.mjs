import "./test-session-security.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { actorFromRequest } from "./access-control.mjs";

const source = await readFile(new URL("./preview-server.mjs", import.meta.url), "utf8");
assert(!source.includes("localStorage.setItem"));
assert(!source.includes("sessionStorage.setItem"));
assert(!source.includes("storedOwnerToken"));
assert(source.includes("/api/auth/login"));
assert(source.includes("HttpOnly") || (await readFile(new URL("./session-auth.mjs", import.meta.url), "utf8")).includes("HttpOnly"));
const legacy = actorFromRequest({ headers:{ authorization:"Bearer obsolete-static-bootstrap-credential-123456" } }, { NODE_ENV:"production", COMMAND_CENTER_OWNER_TOKEN:"obsolete-static-bootstrap-credential-123456" });
assert.equal(legacy.authenticated, false);
console.log("opaque session authentication tests passed");
