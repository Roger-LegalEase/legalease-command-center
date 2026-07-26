#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "scripts", "preview-server.mjs"), "utf8");

function functionBlock(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} should exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n    function [a-zA-Z0-9_$]+\(/);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

const more = functionBlock("moreWorkspaceHtml");
const today = functionBlock("commandCenterOverviewHtml");
const appStatus = functionBlock("osHealthPageHtml");
const calendarModel = functionBlock("calendarReadinessState");
const normalUi = [more, today, appStatus, calendarModel].join("\n");

for (const forbidden of [
  "Create Event",
  "Edit Event",
  "Delete Event",
  "Send Invite",
  "Create events",
  "Edit events",
  "Delete events",
  "Send invites"
]) {
  assert(!normalUi.includes(`>${forbidden}<`) && !normalUi.includes(`${forbidden}</button>`), `Calendar normal UI should not expose ${forbidden}`);
}

for (const forbiddenRoute of [
  '"/api/calendar/create"',
  '"/api/calendar/update"',
  '"/api/calendar/delete"',
  '"/api/calendar/invite"',
  'google.calendar.events.insert',
  'google.calendar.events.patch',
  'google.calendar.events.delete'
]) {
  assert(!source.includes(forbiddenRoute), `Calendar write route/function should not exist: ${forbiddenRoute}`);
}

// PORTED 2026-07-26 (hygiene, extended-test triage). The OAuth scope list moved out of
// preview-server.mjs into scripts/google-workspace.mjs (`googleReadOnlyScopes`), so the
// positive assertion failed while the three write-scope negatives had quietly gone VACUOUS —
// they were checking a file that no longer declares any Google scope. All four now read the
// module that owns the scopes, and the negatives are additionally applied to preview-server so
// a write scope cannot be reintroduced in either place.
const googleWorkspaceSource = readFileSync(join(process.cwd(), "scripts", "google-workspace.mjs"), "utf8");
assert(googleWorkspaceSource.includes("https://www.googleapis.com/auth/calendar.readonly"), "Calendar should only use read-only scope");
assert(googleWorkspaceSource.includes("export const googleReadOnlyScopes"), "the Google scope list should stay a single exported constant, not be inlined per call site");
for (const writeScope of [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar\"",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify"
]) {
  assert(!googleWorkspaceSource.includes(writeScope), `Calendar/Gmail write scope should not be present in google-workspace.mjs: ${writeScope}`);
  assert(!source.includes(writeScope), `Calendar/Gmail write scope should not be present in preview-server.mjs: ${writeScope}`);
}

for (const forbiddenVisible of [
  "provider secret",
  "API key",
  "access token",
  "refresh token",
  "calendar ID",
  "event ID"
]) {
  assert(!normalUi.toLowerCase().includes(forbiddenVisible.toLowerCase()), `Calendar normal UI should not show ${forbiddenVisible}`);
}

assert(source.includes("Calendar writes: Off"), "Visible safety should keep Calendar writes off");
assert(source.includes("External actions: Off"), "Visible safety should keep external actions off");
assert(source.includes("liveGatesCount:0"), "liveGatesCount should remain 0");

console.log("calendar read-only safety tests passed.");
