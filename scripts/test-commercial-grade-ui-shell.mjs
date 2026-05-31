import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./preview-server.mjs", import.meta.url), "utf8");

assert.match(source, /class="commercial-sidebar"/, "Commercial left sidebar should exist.");
assert.match(source, /class="command-bar"/, "Top command bar should exist.");
for (const label of ["Today", "Work", "Marketing", "Data Room", "Partnerships", "KPIs", "Proof", "Search"]) {
  assert.match(source, new RegExp(`>${label}<|>${label}</span>|${label}`), `Primary nav should include ${label}.`);
}
assert.match(source, /utility-menu|Settings/, "Settings should remain secondary.");
assert.match(source, /data-nav-section="marketing"/, "Marketing should be a primary nav section.");
assert.match(source, /data-nav-section="data-room"/, "Data Room should be a primary nav section.");
assert.match(source, /data-nav-section="partnerships"/, "Partnerships should be a primary nav section.");
assert.match(source, /data-nav-section="kpis"/, "KPIs should be a primary nav section.");
assert.match(source, /Department Pulse|department-pulse|department-card/, "Today should include department pulse cards.");
assert.match(source, /#111827|#0F172A|#0f172a|commercial-shell/, "App should use a dark-accented commercial shell, not a plain white page shell.");
assert.match(source, /lee-floating-bubble|lee-assistant-window|Le-E/, "Persistent Le-E assistant access should exist.");
assert.match(source, /Your LegalEase operating assistant/, "Le-E window should have premium assistant subtitle.");

const shellBlock = source.match(/<body>[\s\S]*?<script>/)?.[0] || "";
for (const banned of ["generated client", "route map", "event bus", "internal state", "diagnostics"]) {
  assert(!new RegExp(banned, "i").test(shellBlock), `Normal shell should not show ${banned}.`);
}

console.log("commercial grade UI shell tests passed");
