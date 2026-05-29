import { buildDailyOperatingLoop } from "./daily-operating-loop.mjs";
import { computeRcapPartnerJourneyHandoffReadiness, rcapReviewQueue } from "./review-approval-engine.mjs";
import { safeAuthHardeningSummary } from "./auth-endpoint-hardening.mjs";
import { buildSmokeTestStatus } from "./smoke-test-center.mjs";
import { buildEvidenceOverview, latestEvidenceSummary } from "./evidence-room.mjs";
import { handoffContractStatus } from "./partner-journey-handoff-contract.mjs";

const noExternalActionsConfirmation = "No emails sent, no posts published, no partner pages published, no dashboards activated, no Partner Journey calls, no external systems contacted beyond existing internal health checks.";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isoNow(options = {}) {
  return options.now || new Date().toISOString();
}

function dayKey(options = {}) {
  return options.date || isoNow(options).slice(0, 10);
}

function liveGatesCount(state = {}) {
  return Object.values(state.runtime?.livePostingGates || {}).filter(gate => gate?.enabled).length;
}

function latestTime(items = [], fields = ["created_at", "createdAt", "timestamp", "updated_at", "updatedAt", "generated_at", "generatedAt"]) {
  return list(items)
    .map(item => fields.map(field => item?.[field]).find(Boolean) || "")
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function status(name, ok, detail = "", options = {}) {
  return {
    name,
    status: ok ? options.okStatus || "ready" : options.badStatus || "needs_attention",
    ok: Boolean(ok),
    detail: detail || (ok ? "Ready." : "Needs attention.")
  };
}

function warning(title, detail, options = {}) {
  return {
    title,
    detail,
    severity: options.severity || "warning",
    href: options.href || "os-health"
  };
}

function sameDayRecord(items = [], date = "", keyPrefix = "") {
  return list(items).find(item => item.date === date || (keyPrefix && item.key === `${keyPrefix}-${date}`)) || null;
}

function verificationChecklist(state = {}) {
  const lastKnown = state.verificationStatus || state.productionVerification || {};
  const commands = [
    "npm run verify",
    "npm run verify:production",
    "npm audit --audit-level=high",
    "npm test",
    "node scripts/test-daily-closeout.mjs",
    "node scripts/test-daily-rituals.mjs",
    "node scripts/test-os-health-center.mjs"
  ];
  return commands.map(command => ({
    command,
    status: lastKnown[command]?.status || "last_known_not_recorded",
    last_run_at: lastKnown[command]?.last_run_at || ""
  }));
}

export function buildOsHealthSnapshot(state = {}, options = {}) {
  const generatedAt = isoNow(options);
  const date = dayKey({ ...options, now: generatedAt });
  const liveGates = liveGatesCount(state);
  const loop = buildDailyOperatingLoop(state);
  const reviewQueue = rcapReviewQueue(state);
  const handoff = computeRcapPartnerJourneyHandoffReadiness(state);
  const authHardening = options.authHardening || safeAuthHardeningSummary({ state, source: options.endpointInventorySource || "" });
  const smokeTestStatus = buildSmokeTestStatus(state, { commit_hash: options.commit_hash || options.commitHash || state.runtime?.commitHash || state.runtime?.commit_hash || "" });
  const evidenceOverview = buildEvidenceOverview(state, options);
  const evidenceSummary = latestEvidenceSummary(state);
  const contractStatus = handoffContractStatus(state, options);
  const morning = sameDayRecord(state.morningBriefs, date, "morning-brief");
  const memory = sameDayRecord(state.operatingMemory, date, "operating-memory");
  const evening = sameDayRecord(state.eveningReflections, date, "evening-reflection");
  const closeout = sameDayRecord(state.dailyCloseouts, date, "daily-closeout");
  const unreviewedCaptures = list(state.captureInbox).filter(item => item.review_state === "review_required");
  const lastAuditActivity = latestTime([...list(state.activityEvents), ...list(state.auditHistory), ...list(state.events)]);
  const connectionHealth = {
    supabase_db: status("Supabase DB", Boolean(options.supabaseDbConnected ?? state.runtime?.supabaseDbConnected), options.supabaseDbConnected ?? state.runtime?.supabaseDbConnected ? "Supabase DB reports connected." : "Supabase DB is unavailable or unverified.", { okStatus: "connected", badStatus: "unavailable" }),
    supabase_storage: status("Supabase Storage", Boolean(options.supabaseStorageConnected ?? state.runtime?.supabaseStorage?.connected ?? state.runtime?.supabaseStorage?.ok), options.supabaseStorageConnected ?? state.runtime?.supabaseStorage?.connected ?? state.runtime?.supabaseStorage?.ok ? "Supabase Storage reports connected." : "Supabase Storage is unavailable or unverified.", { okStatus: "connected", badStatus: "unavailable" }),
    openai: status("OpenAI configured", Boolean(options.openAIConfigured ?? state.runtime?.openAIConfigured), options.openAIConfigured ?? state.runtime?.openAIConfigured ? "OpenAI is configured." : "OpenAI is unavailable.", { okStatus: "configured", badStatus: "unavailable" }),
    owner_token_auth: status("Owner-token auth", Boolean(options.ownerTokenAuthConfigured ?? state.runtime?.accessControl?.authRequired), options.ownerTokenAuthConfigured ?? state.runtime?.accessControl?.authRequired ? "Hosted owner-token protection is active." : "Owner-token auth is unverified.", { okStatus: "protected", badStatus: "unverified" }),
    local_fallback: status("Local fallback", Boolean(options.localFallbackAvailable ?? true), "Local JSON fallback remains available.", { okStatus: "available", badStatus: "unavailable" })
  };
  const workflowHealth = {
    quick_capture: status("Quick Capture", true, "Quick Capture is available from the cockpit."),
    capture_inbox: status("Capture Inbox", Array.isArray(state.captureInbox), `${list(state.captureInbox).length} capture item(s) tracked.`),
    morning_brief: status("Morning Brief", Boolean(morning), morning ? "Morning Brief saved today." : "Morning Brief is not saved today."),
    daily_operating_loop: status("Daily Operating Loop", Boolean(loop.top3?.length), `${loop.top3?.length || 0} top action(s) generated.`),
    operating_memory: status("Operating Memory", Boolean(memory), memory ? "Operating Memory saved today." : "Operating Memory is not saved today."),
    evening_reflection: status("Evening Reflection", Boolean(evening), evening ? "Evening Reflection saved today." : "Evening Reflection is not saved today."),
    daily_closeout: status("Daily Closeout", Boolean(closeout), closeout ? "Daily Closeout saved today." : "Daily Closeout is not saved today."),
    rcap_activation: status("RCAP Activation", list(state.partnerPrograms).some(item => item.slug === "rcap") || list(state.partners).some(item => item.slug === "rcap"), "RCAP activation records are tracked internally."),
    rcap_review_workspace: status("RCAP Review Workspace", reviewQueue.length > 0, `${reviewQueue.length} review artifact(s) tracked.`),
    approval_engine: status("Approval Engine", reviewQueue.every(item => Boolean(item.review_state)), "Review states are available for tracked artifacts."),
    handoff_readiness: status("Handoff Readiness", Boolean(handoff), handoff.handoff_ready ? "Handoff readiness is ready for manual decision." : handoff.next_manual_action || "Handoff readiness needs attention."),
    handoff_contract: status("Partner Journey Handoff Contract", contractStatus.latest_validation_result === "valid", contractStatus.latest_validation_result === "valid" ? "Handoff contract validates internally." : `${contractStatus.missing_fields_count} handoff contract field(s) need review.`),
    smoke_test_center: status("Smoke Test Center", smokeTestStatus.last_status !== "not_started", smokeTestStatus.last_status === "not_started" ? "No post-deploy smoke test run has been saved yet." : `Last smoke test status: ${smokeTestStatus.last_status}.`),
    evidence_room: status("Evidence Room", evidenceOverview.total_evidence_items > 0, evidenceOverview.total_evidence_items ? `${evidenceOverview.total_evidence_items} evidence item(s) indexed. ${evidenceOverview.open_review_items} open review item(s).` : "No evidence items are indexed yet.")
  };
  const dataFreshness = {
    last_capture_time: latestTime(state.captureInbox, ["created_at", "updated_at"]),
    last_morning_brief_save: morning?.generated_at || morning?.updated_at || "",
    last_operating_memory_save: memory?.generated_at || memory?.updated_at || "",
    last_evening_reflection_save: evening?.generated_at || evening?.updated_at || "",
    last_closeout_save: closeout?.updated_at || closeout?.generated_at || "",
    last_rcap_activation: latestTime([...list(state.partnerPrograms), ...list(state.partnerProgramArtifacts)], ["updatedAt", "createdAt", "review_updated_at"]),
    last_review_state_change: latestTime(reviewQueue, ["review_updated_at", "updatedAt", "createdAt"]),
    last_smoke_test_run: smokeTestStatus.last_run_timestamp || "",
    latest_evidence_summary_timestamp: evidenceSummary?.updated_at || evidenceSummary?.generated_at || "",
    last_evidence_update: evidenceOverview.last_evidence_update || "",
    last_audit_activity_event: lastAuditActivity
  };
  const trustWarnings = [
    !memory ? warning("No recent Operating Memory", "No Operating Memory has been saved today.", { href: "operating-memory" }) : null,
    !morning ? warning("No Morning Brief saved today", "Morning Brief is generated but not persisted for today.", { href: "morning-brief" }) : null,
    !evening ? warning("No Evening Reflection saved today", "Evening Reflection is generated but not persisted for today.", { href: "evening-reflection" }) : null,
    !closeout ? warning("No Closeout saved today", "Daily Closeout and Tomorrow Plan are not saved today.", { href: "daily-closeout" }) : null,
    unreviewedCaptures.length ? warning("Capture Inbox has unreviewed items", `${unreviewedCaptures.length} capture item(s) need review.`, { href: "capture-inbox" }) : null,
    !handoff.handoff_ready ? warning("Handoff readiness blocked", handoff.next_manual_action || "RCAP is not handoff ready.", { href: "production-activation-rcap" }) : null,
    liveGates !== 0 ? warning("Live gates are not 0", `${liveGates} live gate(s) are enabled.`, { severity: "critical", href: "settings" }) : null,
    !connectionHealth.openai.ok ? warning("OpenAI unavailable", "Le-E may fall back to local state only.", { href: "os-health" }) : null,
    !connectionHealth.supabase_db.ok ? warning("Supabase unavailable", "Hosted durable backend is unavailable or unverified.", { href: "os-health" }) : null,
    authHardening.endpoint_protection?.status !== "protected" ? warning("Endpoint protection needs review", "One or more API endpoints are unexpectedly public or unverified.", { href: "os-health" }) : null,
    authHardening.secret_leakage?.status === "leak_detected" ? warning("Secret leakage check failed", "A hardening scan detected a secret-like response value.", { severity: "critical", href: "os-health" }) : null,
    authHardening.forbidden_action_guard?.status !== "blocked" ? warning("Forbidden action guard needs review", "External action guard is not in the expected blocked state.", { href: "os-health" }) : null,
    contractStatus.warning ? warning("Handoff contract validation mismatch", contractStatus.warning, { href: "handoff-contract" }) : null,
    contractStatus.latest_validation_result !== "valid" ? warning("Handoff contract needs review", `${contractStatus.missing_fields_count} required handoff field(s) are missing or invalid.`, { href: "handoff-contract" }) : null,
    smokeTestStatus.last_status === "fail" ? warning("Last smoke test failed", `${smokeTestStatus.failed_count} smoke test step(s) failed.`, { href: "smoke-test" }) : null,
    smokeTestStatus.warning ? warning("Smoke test not run for latest deploy", smokeTestStatus.warning, { href: "smoke-test" }) : null,
    evidenceOverview.missing_proof_warnings.length ? warning("Evidence Room needs review", evidenceOverview.missing_proof_warnings[0], { href: "evidence-room" }) : null,
    evidenceOverview.stale_evidence_warnings.length ? warning("Evidence may be stale", evidenceOverview.stale_evidence_warnings[0], { href: "evidence-room" }) : null
  ].filter(Boolean);
  const overallHealth = liveGates !== 0 || !connectionHealth.supabase_db.ok
    ? "critical"
    : trustWarnings.length
      ? "needs_attention"
      : "healthy";

  return {
    id: `os-health-${date}`,
    generated_at: generatedAt,
    overall_health: overallHealth,
    connection_health: connectionHealth,
    workflow_health: workflowHealth,
    data_freshness: dataFreshness,
    trust_warnings: trustWarnings,
    self_test_status: {
      last_known_status: state.verificationStatus?.overall || "last_known_not_recorded",
      checklist: verificationChecklist(state)
    },
    auth_hardening: authHardening,
    smoke_test_status: smokeTestStatus,
    evidence_room_status: {
      total_evidence_items: evidenceOverview.total_evidence_items,
      recent_evidence_items: evidenceOverview.recent_evidence_items,
      open_review_items: evidenceOverview.open_review_items,
      latest_evidence_summary_timestamp: evidenceSummary?.updated_at || evidenceSummary?.generated_at || "",
      last_evidence_update: evidenceOverview.last_evidence_update || ""
    },
    handoff_contract_status: contractStatus,
    missing_evidence_warnings: evidenceOverview.missing_proof_warnings,
    stale_evidence_warnings: evidenceOverview.stale_evidence_warnings,
    summary: {
      safe_to_trust: [
        "Internal state synthesis is available.",
        liveGates === 0 ? "Live gates are off." : "",
        connectionHealth.owner_token_auth.ok ? "Hosted owner-token protection is active." : ""
      ].filter(Boolean),
      needs_attention: trustWarnings.map(item => item.title).slice(0, 6),
      do_not_trust_yet: [
        !morning ? "Today is missing a saved Morning Brief." : "",
        !memory ? "Today is missing saved Operating Memory." : "",
        !closeout ? "Tomorrow Plan is not persisted yet." : "",
        !handoff.handoff_ready ? "RCAP handoff readiness is not approved." : ""
      ].filter(Boolean),
      next_operator_action: trustWarnings[0]?.detail || "Refresh OS Health after the next internal ritual save."
    },
    live_gates_count: liveGates,
    no_external_actions_confirmation: noExternalActionsConfirmation
  };
}

export function saveOsHealthSnapshot(state = {}, options = {}) {
  const snapshot = buildOsHealthSnapshot(state, options);
  const timestamp = snapshot.generated_at;
  const actor = options.actor || "owner_token";
  const next = {
    ...state,
    osHealthSnapshots: [snapshot, ...list(state.osHealthSnapshots).filter(item => item.id !== snapshot.id)].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${snapshot.id}-${Date.parse(timestamp) || Date.now()}`,
    timestamp,
    actor,
    action: "os health snapshot refreshed",
    resourceType: "os_health_snapshot",
    resourceId: snapshot.id,
    beforeValue: null,
    afterValue: {
      overall_health: snapshot.overall_health,
      live_gates_count: snapshot.live_gates_count,
      warnings: snapshot.trust_warnings.length
    }
  }, ...list(state.auditHistory)].slice(0, 1000);
  next.activityEvents = [{
    id: `activity-${snapshot.id}-${Date.parse(timestamp) || Date.now()}`,
    eventType: "OS Health Snapshot refreshed",
    title: "OS Health Snapshot refreshed",
    summary: `OS Health Snapshot refreshed. Overall health: ${snapshot.overall_health}. No external action was taken.`,
    relatedObjectType: "os_health_snapshot",
    relatedObjectId: snapshot.id,
    riskLevel: snapshot.overall_health === "critical" ? "high" : snapshot.overall_health === "needs_attention" ? "medium" : "low",
    metadata: { liveGatesCount: snapshot.live_gates_count, externalSideEffects: false, noExternalSystemsContacted: true },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, snapshot };
}
