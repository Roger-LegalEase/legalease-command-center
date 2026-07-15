const noExternalActionsConfirmation = "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey calls, no destructive restore, no shell commands executed from browser.";
const allowedStatuses = new Set(["pass", "fail", "not_tested"]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function slug(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function checklistItem(groupId, label, route = "", expected = "") {
  return {
    id: `${groupId}-${slug(label)}`,
    label,
    route,
    expected: expected || label,
    status: "not_tested",
    notes: ""
  };
}

function group(name, items = []) {
  const id = slug(name);
  return { id, name, items: items.map(item => checklistItem(id, ...item)) };
}

export function buildSmokeTestChecklist() {
  return [
    group("App Shell", [
      ["Open Operator Cockpit", "overview", "Overview loads without render errors."],
      ["Top nav works", "overview", "Top navigation opens usable sections."],
      ["More menu works", "more", "More menu opens internal pages."],
      ["No render-error screen", "overview", "No render-error fallback is visible."],
      ["No horizontal overflow", "overview", "Page content fits viewport."],
      ["Le-E pill/panel opens", "overview", "Bottom-right Le-E panel opens."],
      ["Live gates show 0", "os-health", "Live gates count remains 0."]
    ]),
    group("Auth + Endpoint Safety", [
      ["Owner-token auth active", "os-health", "Hosted owner-token protection remains active."],
      ["Lock/sign out available", "overview", "Lock/sign out clears token."],
      ["Protected APIs require owner token", "os-health", "Protected APIs reject missing and wrong token."],
      ["/api/health is public-safe and scrubbed", "os-health", "Health response is public-safe and scrubbed."],
      ["Forbidden actions remain blocked", "os-health", "External action guard blocks forbidden work."],
      ["No secrets exposed", "os-health", "No secrets appear in HTML or API responses."]
    ]),
    group("Quick Capture + Capture Inbox", [
      ["Quick Capture card renders", "overview", "Quick Capture is visible in cockpit."],
      ["Capture with Le-E works", "capture-inbox", "Quick Capture saves internal review item."],
      ["Capture Inbox route opens", "capture-inbox", "Capture Inbox renders."],
      ["Capture can be marked reviewed", "capture-inbox", "Mark reviewed updates internal state."],
      ["Capture can route to task", "capture-inbox", "Capture routes to Task internally."],
      ["Capture can route to Operating Memory", "capture-inbox", "Capture routes to Operating Memory internally."],
      ["Ignored capture does not influence rituals", "capture-inbox", "Ignored capture stays out of rituals."]
    ]),
    group("Tasks", [
      ["#tasks opens", "tasks", "All Tasks page opens."],
      ["#tasks-today opens", "tasks-today", "Today task view opens."],
      ["#tasks-blocked opens", "tasks-blocked", "Blocked task view opens."],
      ["#tasks-waiting opens", "tasks-waiting", "Waiting task view opens."],
      ["#tasks-this-week opens", "tasks-this-week", "This Week task view opens."],
      ["Task status actions are internal-only", "tasks", "Task updates do not call external systems."],
      ["Blocked task requires blocker reason", "tasks-blocked", "Blocked status requires a reason."]
    ]),
    group("Daily Rituals", [
      ["#morning-brief opens", "morning-brief", "Morning Brief route renders."],
      ["Save Morning Brief works", "morning-brief", "Morning Brief saves internally."],
      ["#evening-reflection opens", "evening-reflection", "Evening Reflection route renders."],
      ["Save Evening Reflection works", "evening-reflection", "Evening Reflection saves internally."],
      ["Source evidence renders", "morning-brief", "Source evidence appears in ritual pages."]
    ]),
    group("Operating Memory + Closeout", [
      ["#operating-memory opens", "operating-memory", "Operating Memory route renders."],
      ["Save Today's Operating Memory works", "operating-memory", "Operating Memory saves internally."],
      ["#daily-closeout opens", "daily-closeout", "Daily Closeout route renders."],
      ["Save Closeout works", "daily-closeout", "Daily Closeout saves internally."],
      ["Generate Tomorrow Plan works", "daily-closeout", "Tomorrow Plan generates internally."],
      ["Tomorrow Plan renders", "daily-closeout", "Tomorrow Plan is visible."]
    ]),
    group("Search + Health + Integrity", [
      ["#operator-search opens", "operator-search", "Operator Search route renders."],
      ["Search finds tasks/captures/RCAP artifacts", "operator-search", "Search index includes core records."],
      ["Safe search actions appear", "operator-search", "Internal-only safe actions appear."],
      ["Forbidden search actions do not appear", "operator-search", "External actions do not appear."],
      ["#os-health opens", "os-health", "OS Health route renders."],
      ["Refresh OS Health Snapshot works", "os-health", "OS Health refresh saves internally."],
      ["#data-integrity opens", "data-integrity", "Data Integrity route renders."],
      ["Integrity status renders", "data-integrity", "Integrity status is visible."],
      ["No secret fields appear", "data-integrity", "Secret-like fields are scrubbed."]
    ]),
    group("RCAP Workflow", [
      ["RCAP Production Activation card renders", "overview", "RCAP activation card is visible."],
      ["#production-activation-rcap opens", "production-activation-rcap", "RCAP Review Workspace opens."],
      ["Review Queue renders", "production-activation-rcap", "Review Queue is visible."],
      ["Approval controls are internal-only", "production-activation-rcap", "Approval controls only update internal state."],
      ["Handoff Readiness renders", "production-activation-rcap", "Handoff Readiness section is visible."],
      ["Generate Internal Handoff Packet works internally only", "production-activation-rcap", "Internal packet generation does not contact external systems."],
      ["No Partner Journey API is contacted", "production-activation-rcap", "Partner Journey APIs are not called."]
    ]),
    group("Safety Confirmation", [
      ["No emails sent", "os-health", "Email sending remains unavailable."],
      ["No posts published", "queue", "Publishing remains blocked unless explicitly approved outside this smoke test."],
      ["No partner pages published", "partner-pages", "Partner pages remain draft/review-only."],
      ["No dashboards activated", "partner-dashboards", "Dashboards are not activated."],
      ["No destructive restore", "data-integrity", "Restore dry-run only; destructive restore remains blocked."],
      ["No live gates enabled", "settings", "Live gates are not enabled."],
      ["Live gates remain 0", "os-health", "Live gates count is 0."]
    ])
  ];
}

function flattenGroups(groups = []) {
  return list(groups).flatMap(group => list(group.items).map(item => ({ ...item, group_id: group.id, group_name: group.name })));
}

function countsFor(items = []) {
  const passed = list(items).filter(item => item.status === "pass").length;
  const failed = list(items).filter(item => item.status === "fail").length;
  const notTested = list(items).filter(item => item.status === "not_tested").length;
  return { passed, failed, notTested };
}

function withCounts(run = {}) {
  const checklistItems = flattenGroups(run.groups);
  const counts = countsFor(checklistItems);
  return {
    ...run,
    checklist_items: checklistItems,
    passed_count: counts.passed,
    failed_count: counts.failed,
    not_tested_count: counts.notTested
  };
}

function upsertRun(state = {}, run = {}) {
  return {
    ...state,
    smokeTestRuns: [run, ...list(state.smokeTestRuns).filter(item => item.id !== run.id)].slice(0, 100)
  };
}

function auditEntries(state = {}, run = {}, action = "", options = {}) {
  const timestamp = isoNow(options);
  const actor = options.actor || "owner_token";
  return {
    auditHistory: [{
      id: `audit-smoke-test-${run.id}-${slug(action)}-${Date.parse(timestamp) || Date.now()}`,
      timestamp,
      actor,
      action,
      resourceType: "smoke_test_run",
      resourceId: run.id,
      beforeValue: null,
      afterValue: {
        overall_status: run.overall_status,
        passed_count: run.passed_count,
        failed_count: run.failed_count,
        not_tested_count: run.not_tested_count,
        live_gates_count: run.live_gates_count
      }
    }, ...list(state.auditHistory)],
    activityEvents: [{
      id: `activity-smoke-test-${run.id}-${slug(action)}-${Date.parse(timestamp) || Date.now()}`,
      eventType: "Smoke Test Run updated",
      title: action,
      summary: `Smoke Test Run ${run.id} updated. Status: ${run.overall_status}. No external action was taken.`,
      relatedObjectType: "smoke_test_run",
      relatedObjectId: run.id,
      riskLevel: run.failed_count > 0 ? "medium" : "low",
      metadata: { externalSideEffects: false, liveGatesCount: run.live_gates_count },
      createdAt: timestamp
    }, ...list(state.activityEvents)].slice(0, 500)
  };
}

function applyAudit(state = {}, run = {}, action = "", options = {}) {
  return { ...state, ...auditEntries(state, run, action, options) };
}

function makeRun(state = {}, input = {}, options = {}) {
  const timestamp = isoNow(options);
  const id = input.id || `smoke-test-${timestamp.replace(/[:.]/g, "-")}`;
  return withCounts({
    id,
    commit_hash: input.commit_hash || input.commitHash || "",
    environment: input.environment || "unknown",
    started_at: input.started_at || timestamp,
    completed_at: "",
    overall_status: "in_progress",
    groups: buildSmokeTestChecklist(),
    notes: input.notes || "",
    live_gates_count: liveGatesCount(state),
    no_external_actions_confirmation: noExternalActionsConfirmation,
    created_at: timestamp,
    updated_at: timestamp
  });
}

export function startSmokeTestRun(state = {}, input = {}, options = {}) {
  const existing = list(state.smokeTestRuns).find(item => item.id === input.id);
  const timestamp = isoNow(options);
  const run = existing
    ? withCounts({ ...existing, overall_status: "in_progress", updated_at: timestamp, live_gates_count: liveGatesCount(state), no_external_actions_confirmation: noExternalActionsConfirmation })
    : makeRun(state, input, options);
  const next = applyAudit(upsertRun(state, run), run, "smoke test run started", options);
  return { state: next, run };
}

export function markSmokeTestItem(state = {}, runId = "", itemId = "", status = "not_tested", notes = "", options = {}) {
  if (!allowedStatuses.has(status)) throw new Error("Unsupported smoke test item status.");
  const timestamp = isoNow(options);
  const run = list(state.smokeTestRuns).find(item => item.id === runId);
  if (!run) throw new Error("Smoke test run not found.");
  const groups = list(run.groups).map(group => ({
    ...group,
    items: list(group.items).map(item => item.id === itemId ? { ...item, status, notes, updated_at: timestamp } : item)
  }));
  const nextRun = withCounts({ ...run, groups, updated_at: timestamp, live_gates_count: liveGatesCount(state), no_external_actions_confirmation: noExternalActionsConfirmation });
  const next = applyAudit(upsertRun(state, nextRun), nextRun, `smoke test item marked ${status}`, options);
  return { state: next, run: nextRun };
}

export function saveSmokeTestRun(state = {}, runId = "", input = {}, options = {}) {
  const timestamp = isoNow(options);
  const run = list(state.smokeTestRuns).find(item => item.id === runId);
  if (!run) throw new Error("Smoke test run not found.");
  const nextRun = withCounts({
    ...run,
    notes: input.notes !== undefined ? input.notes : run.notes,
    commit_hash: input.commit_hash !== undefined ? input.commit_hash : run.commit_hash,
    environment: input.environment !== undefined ? input.environment : run.environment,
    updated_at: timestamp,
    live_gates_count: liveGatesCount(state),
    no_external_actions_confirmation: noExternalActionsConfirmation
  });
  const next = applyAudit(upsertRun(state, nextRun), nextRun, "smoke test run saved", options);
  return { state: next, run: nextRun };
}

export function finishSmokeTestRun(state = {}, runId = "", options = {}) {
  const timestamp = isoNow(options);
  const run = list(state.smokeTestRuns).find(item => item.id === runId);
  if (!run) throw new Error("Smoke test run not found.");
  const counted = withCounts(run);
  const overallStatus = counted.failed_count > 0 ? "fail" : counted.not_tested_count > 0 ? "in_progress" : "pass";
  const nextRun = withCounts({
    ...run,
    overall_status: overallStatus,
    completed_at: timestamp,
    updated_at: timestamp,
    live_gates_count: liveGatesCount(state),
    no_external_actions_confirmation: noExternalActionsConfirmation
  });
  const next = applyAudit(upsertRun(state, nextRun), nextRun, "smoke test run finished", options);
  return { state: next, run: nextRun };
}

export function buildSmokeTestStatus(state = {}, options = {}) {
  const runs = list(state.smokeTestRuns).slice().sort((a, b) => String(b.updated_at || b.started_at || "").localeCompare(String(a.updated_at || a.started_at || "")));
  const last = runs[0] || null;
  const latestCommit = options.commit_hash || options.commitHash || "";
  if (!last) {
    return {
      status: "not_started",
      last_status: "not_started",
      last_run_at: null,
      last_run_timestamp: "",
      failed_count: 0,
      passed_count: 0,
      not_tested_count: 0,
      latest_run_id: "",
      latest_commit_hash: latestCommit,
      smoke_test_after_latest_commit: !latestCommit,
      warning: "No smoke test run recorded yet."
    };
  }
  const stale = Boolean(latestCommit && (!last?.commit_hash || last.commit_hash !== latestCommit));
  return {
    status: last?.overall_status || "not_started",
    last_status: last?.overall_status || "not_started",
    last_run_at: last?.completed_at || last?.updated_at || last?.started_at || null,
    last_run_timestamp: last?.completed_at || last?.updated_at || last?.started_at || "",
    failed_count: last?.failed_count || 0,
    passed_count: last?.passed_count || 0,
    not_tested_count: last?.not_tested_count || 0,
    latest_run_id: last?.id || "",
    latest_commit_hash: latestCommit,
    smoke_test_after_latest_commit: !stale,
    warning: stale ? "No smoke test has been run after the latest known deploy commit." : ""
  };
}

export { noExternalActionsConfirmation };
