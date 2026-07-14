// B4 — Engagement & Growth Monitor (READ-ONLY observe-and-report).
//
// What B4 is — and, structurally, what it can NEVER be:
//   • B4 pulls the engagement/growth signals that are ACTUALLY available and writes a
//     plain-English report (engagementGrowthSnapshots) on a daily cadence: revenue, signups,
//     publishing/source cadence, and operator-entered content performance — each trended with
//     deltas vs the last run. It reports every social source (LinkedIn / Meta / X) it CANNOT
//     read as "not connected — gated on <reason>", never as zero or a fabricated number.
//   • B4 is plan()-ONLY. It has NO act() method — no posting, no sending, no mutation of any
//     external platform, and not even a data-fetch-as-action path. The single live read it does
//     is a GET (Stripe/signups) delegated to an INJECTED, read-only executor; absent that dep it
//     reports those sources as "not queried". "Read-only, never posts" is therefore STRUCTURAL:
//     the descriptor has no act key, the heartbeat skips act() for engines without one, and
//     test-engagement-growth.mjs asserts no posting/send/act path exists.
//
// HONESTY RULE (Phase 0 reality): there is NO live social-engagement data today — no platform
// has a read path, and LinkedIn/Meta/X are gated on scopes + app approval. So B4 trends only
// REAL signals (Stripe revenue, signups, publishing cadence, operator-typed performance) and is
// blunt about everything that is blocked. It fabricates nothing; on a fetch failure the injected
// executor returns an honest {available:false, configured, error} shape that B4 passes through
// unchanged. Live social reads slot into the same report when a platform is connected.
//
// REUSE, not a parallel system: B4 consumes the EXISTING honest fetchers (fetchStripeRevenueSnapshot
// / fetchSignupsSnapshot — injected by the server, where the env keys live), the EXISTING
// publishing telemetry (dailyRunPublisherRuns), the EXISTING posts/performance + funnelSnapshots
// shapes, the EXISTING connector honesty ladder ({available, configured, error}), and mirrors
// saveDataIntegritySnapshot's persistence (capped snapshot collection + auditHistory + activityEvents).

// ---------------------------------------------------------------------------
// 1. DATA MODEL — the findings surface MUST be in coreStateCollections (storage.mjs) or it
//    silently fails to persist to Supabase (the B1/B2/B3/B5 trap). test asserts membership; B3
//    flags the drift if it falls out of sync.
// ---------------------------------------------------------------------------
export const ENGAGEMENT_GROWTH_COLLECTIONS = ["engagementGrowthSnapshots"];
export const ENGAGEMENT_GROWTH_ENGINE_ID = "engagement-growth";

const noExternalActionsConfirmation =
  "Read-only engagement report. No posts published, no messages sent, no external platforms modified, no outward-facing writes.";

// Social engagement sources B4 CANNOT read today, with the verified Phase-0 reason each is
// blocked. These are facts, not guesses — they keep the report honest about what's gated.
export const SOCIAL_SOURCES = Object.freeze([
  {
    key: "linkedin", label: "LinkedIn", read_capability: "scope_missing",
    reason: "No read/analytics scope is requested (only w_member_social, which is write-only). Organization analytics also require approved LinkedIn Community Management access."
  },
  {
    key: "meta", label: "Meta (Facebook / Instagram / Threads)", read_capability: "unwired",
    reason: "pages_read_engagement is in scope but no /insights read is wired. Requires an approved Meta app plus a managed Page / linked Instagram Business account."
  },
  {
    key: "x", label: "X (Twitter)", read_capability: "scope_missing",
    reason: "Scopes are read-only tweet.read / users.read with no public_metrics. The engagement-metrics scope has not been requested (posting also lacks tweet.write)."
  }
]);

const list = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
function nowIso(options = {}) { return options.now || new Date().toISOString(); }

// ---------------------------------------------------------------------------
// 2. METRIC EXTRACTION — reuse the existing in-state shapes verbatim.
// ---------------------------------------------------------------------------

// Mirrors performanceTotals() in preview-server.mjs (operator-entered performance fields).
function performanceTotals(performance = {}) {
  return {
    impressions: num(performance.impressions), likes: num(performance.likes),
    comments: num(performance.comments), shares: num(performance.shares),
    saves: num(performance.saves), reposts: num(performance.reposts),
    clicks: num(performance.clicks), leads: num(performance.leads)
  };
}

// Content performance is OPERATOR-ENTERED, not platform-sourced. We aggregate ONLY posts a human
// actually updated (performanceUpdatedAt present) so seeded/demo engagement numbers never leak in.
function contentMetrics(state = {}) {
  const posted = list(state.posts).filter((p) => p.manuallyPostedAt || p.postedAt || p.publishedAt);
  const withMetrics = posted.filter((p) => p.performanceUpdatedAt);
  const totals = { impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0, reposts: 0, clicks: 0, leads: 0 };
  for (const p of withMetrics) {
    const t = performanceTotals(p.performance);
    for (const k of Object.keys(totals)) totals[k] += t[k];
  }
  return {
    data_source: "manual_operator_entry",      // NOT platform-sourced — labeled so it cannot mislead
    posted_count: posted.length,
    with_operator_metrics_count: withMetrics.length,
    needing_metrics_count: posted.length - withMetrics.length,
    manual_performance_totals: totals
  };
}

// Reuses the funnelSnapshots reduce shape from reportBody.
function funnelMetrics(state = {}) {
  const rows = list(state.funnelSnapshots);
  const totals = rows.reduce((memo, item) => ({
    landingPageVisits: memo.landingPageVisits + num(item.landingPageVisits),
    recordShieldStarts: memo.recordShieldStarts + num(item.recordShieldStarts),
    recordShieldCompletions: memo.recordShieldCompletions + num(item.recordShieldCompletions),
    cleanupCtaClicks: memo.cleanupCtaClicks + num(item.cleanupCtaClicked ?? item.cleanupCtaClicks),
    expungementIntakeStarted: memo.expungementIntakeStarted + num(item.expungementIntakeStarted),
    paymentCompleted: memo.paymentCompleted + num(item.paymentCompleted),
    revenue: memo.revenue + num(item.revenue)
  }), { landingPageVisits: 0, recordShieldStarts: 0, recordShieldCompletions: 0, cleanupCtaClicks: 0, expungementIntakeStarted: 0, paymentCompleted: 0, revenue: 0 });
  return { data_source: rows.length ? "operator_or_seed_entry" : "none", rows: rows.length, totals };
}

// Publishing cadence from the EXISTING dailyRunPublisherRuns telemetry (workflow accounting only —
// NO audience signal; labeled as such). Not persisted to Supabase, so absent on a cold read.
function publishingMetrics(state = {}) {
  const runs = list(state.dailyRunPublisherRuns);
  const latest = runs[0] || null;
  const settings = state.settings || {};
  return {
    data_source: "publishing_workflow_telemetry",
    available: Boolean(latest),
    latest_run: latest ? {
      dueChecked: num(latest.dueChecked), published: num(latest.published),
      blocked: num(latest.blocked), failed: num(latest.failed), skipped: num(latest.skipped),
      lastRunTime: latest.lastRunTime || null
    } : null,
    source_automation: {
      lastCount: num(settings.lastSourceAutomationCount),
      lastAt: settings.lastSourceAutomationAt || null
    },
    note: latest ? "" : "No publishing run recorded yet."
  };
}

// ---------------------------------------------------------------------------
// 3. HONESTY LADDER — one entry per source: live / configured-but-unavailable / not-connected.
//    Mirrors the connector-tile + Users-box convention; no cached/estimated number is ever shown.
// ---------------------------------------------------------------------------
function externalSourceEntry(key, label, snap, liveDetail) {
  if (snap && snap.available) {
    return { key, label, state: "live", available: true, configured: true, detail: liveDetail || "Connected and reporting live." };
  }
  if (snap && snap.configured) {
    return { key, label, state: "configured_unavailable", available: false, configured: true, detail: (snap.error || "Wired but currently unavailable.") + " No cached or estimated number is shown." };
  }
  return { key, label, state: "not_connected", available: false, configured: false, detail: (snap && snap.error) || "Not connected. No number is shown until a real source is wired." };
}

function socialSourceEntry(src) {
  return {
    key: src.key, label: src.label, state: "not_connected", available: false, configured: false,
    read_capability: src.read_capability, detail: src.reason
  };
}

// ---------------------------------------------------------------------------
// 4. SNAPSHOT + DELTAS — mirrors buildCodebaseHealthSnapshot / buildDataIntegritySnapshot.
//    `fetched` is the injected read-only result: { revenue?, signups? } honest snapshots.
// ---------------------------------------------------------------------------
export function buildEngagementGrowthSnapshot(state = {}, fetched = {}, options = {}) {
  const generatedAt = nowIso(options);
  const date = generatedAt.slice(0, 10);

  const revenue = (fetched && fetched.revenue) || { available: false, configured: false, error: "Revenue source was not queried this run." };
  const signups = (fetched && fetched.signups) || { available: false, configured: false, error: "Signup source was not queried this run." };
  const publishing = publishingMetrics(state);
  const content = contentMetrics(state);
  const funnel = funnelMetrics(state);

  const sources = [
    externalSourceEntry("stripe_revenue", "Stripe revenue", revenue, `Live gross ${revenue.currency || "usd"} since ${revenue.since || "cutoff"}.`),
    externalSourceEntry("signups", "Signups (paid / registered)", signups, "Live signup counts."),
    { key: "publishing", label: "Publishing cadence", state: publishing.available ? "live" : "not_connected", available: publishing.available, configured: true, detail: publishing.available ? "Workflow telemetry only — no audience/engagement signal." : "No publishing run recorded yet." },
    { key: "content_performance", label: "Content performance", state: content.with_operator_metrics_count > 0 ? "manual" : "no_data", available: false, configured: true, detail: `Operator-entered only (not platform-sourced). ${content.with_operator_metrics_count}/${content.posted_count} posted items have metrics.` },
    ...SOCIAL_SOURCES.map(socialSourceEntry)
  ];

  const blocked_sources = sources
    .filter((s) => s.state === "not_connected" || s.state === "configured_unavailable")
    .map((s) => `${s.label} — ${s.detail}`);

  const liveConnected = sources.filter((s) => s.available).length;

  const metrics = {
    revenue: revenue.available
      ? { available: true, gross: num(revenue.gross), currency: revenue.currency || "usd", since: revenue.since || null }
      : { available: false, configured: Boolean(revenue.configured), error: revenue.error || "" },
    signups: signups.available
      ? { available: true, paid: num(signups.paid), registered: num(signups.registered) }
      : { available: false, configured: Boolean(signups.configured), error: signups.error || "" },
    publishing, content, funnel
  };

  // ---- deltas vs the most recent prior snapshot (trend since last run) -----
  const previous = list(state.engagementGrowthSnapshots)[0] || null;
  const prev = previous ? previous.metrics || {} : {};
  const delta = (cur, old) => (typeof cur === "number" && typeof old === "number" ? cur - old : null);
  const deltas = {
    since: previous ? previous.id : null,
    since_generated_at: previous ? previous.generated_at : null,
    revenue_gross: metrics.revenue.available && prev.revenue?.available ? delta(metrics.revenue.gross, prev.revenue.gross) : null,
    signups_paid: metrics.signups.available && prev.signups?.available ? delta(metrics.signups.paid, prev.signups.paid) : null,
    signups_registered: metrics.signups.available && prev.signups?.available ? delta(metrics.signups.registered, prev.signups.registered) : null,
    posted_count: delta(content.posted_count, prev.content?.posted_count),
    funnel_revenue: delta(funnel.totals.revenue, prev.funnel?.totals?.revenue)
  };
  deltas.whats_working = buildWhatsWorking(metrics, deltas, liveConnected);

  const status = liveConnected > 0 ? "reporting" : "limited_data";

  return {
    id: `engagement-growth-${date}`,
    generated_at: generatedAt,
    status,
    live_sources_connected: liveConnected,
    metrics,
    sources,
    blocked_sources,
    deltas,
    no_external_actions_confirmation: noExternalActionsConfirmation
  };
}

// Plain-English "what's working" — derived ONLY from real numbers/deltas. Never invents a trend.
function buildWhatsWorking(metrics, deltas, liveConnected) {
  const lines = [];
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  if (deltas.signups_paid !== null) lines.push(`Paid signups ${sign(deltas.signups_paid)} since last run (now ${metrics.signups.paid}).`);
  else if (metrics.signups.available) lines.push(`Paid signups at ${metrics.signups.paid} (first reading — no prior run to compare).`);
  if (deltas.revenue_gross !== null) lines.push(`Gross revenue ${sign(deltas.revenue_gross)} ${metrics.revenue.currency} since last run (now ${metrics.revenue.gross}).`);
  else if (metrics.revenue.available) lines.push(`Gross revenue at ${metrics.revenue.gross} ${metrics.revenue.currency} (first reading).`);
  if (metrics.publishing.available) {
    const r = metrics.publishing.latest_run;
    lines.push(`Last publishing run: ${r.published} published, ${r.blocked} blocked, ${r.failed} failed (workflow telemetry only — not engagement).`);
  }
  if (metrics.content.posted_count > 0) lines.push(`${metrics.content.posted_count} posted items; ${metrics.content.needing_metrics_count} still need metrics entered.`);
  if (liveConnected === 0) lines.push("No live growth source is connected — revenue/signups unavailable this run; channel/content engagement cannot be assessed.");
  // The honest ceiling: we cannot rank channels/content without platform reads.
  lines.push("Channel ROI and which content/categories respond CANNOT be determined yet — no social platform read access is connected (LinkedIn/Meta/X). See blocked_sources.");
  return lines;
}

// ---------------------------------------------------------------------------
// 5. PERSISTENCE — verbatim saveDataIntegritySnapshot pattern. Writes ONLY to state (a report);
//    never to an external platform. Idempotent per ET date.
// ---------------------------------------------------------------------------
export function saveEngagementGrowthSnapshot(state = {}, fetched = {}, options = {}) {
  const snapshot = buildEngagementGrowthSnapshot(state, fetched, options);
  const timestamp = snapshot.generated_at;
  const stamp = Date.parse(timestamp) || timestamp;
  const actor = options.actor || "heartbeat";
  const next = {
    ...state,
    engagementGrowthSnapshots: [snapshot, ...list(state.engagementGrowthSnapshots).filter((s) => s.id !== snapshot.id)].slice(0, 90)
  };
  next.auditHistory = [{
    id: `audit-${snapshot.id}-${stamp}`,
    timestamp,
    actor,
    action: "engagement growth snapshot refreshed",
    resourceType: "engagement_growth_snapshot",
    resourceId: snapshot.id,
    beforeValue: null,
    afterValue: {
      status: snapshot.status,
      live_sources_connected: snapshot.live_sources_connected,
      blocked_sources: snapshot.blocked_sources.length
    }
  }, ...list(state.auditHistory)];
  next.activityEvents = [{
    id: `activity-${snapshot.id}-${stamp}`,
    eventType: "Engagement & Growth Snapshot refreshed",
    title: "Engagement & Growth Snapshot refreshed",
    summary: `Engagement & growth report generated. Status: ${snapshot.status}. ${snapshot.live_sources_connected} live source(s), ${snapshot.blocked_sources.length} blocked/unavailable. ${noExternalActionsConfirmation}`,
    relatedObjectType: "engagement_growth_snapshot",
    relatedObjectId: snapshot.id,
    riskLevel: "low",
    metadata: { externalSideEffects: false, noExternalSystemsContacted: false, outwardWrites: false, readOnly: true },
    createdAt: timestamp
  }, ...list(state.activityEvents)].slice(0, 500);
  return { state: next, snapshot };
}

// ---------------------------------------------------------------------------
// 6. plan() — read the available signals and write the report. NO act() exists.
//    The ONLY live read is ctx.fetchEngagementMetrics (injected, read-only GETs). Absent it,
//    revenue/signups report as "not queried" and B4 still reports in-state telemetry.
// ---------------------------------------------------------------------------
export async function planEngagementGrowth(state = {}, ctx = {}) {
  let fetched = {};
  if (typeof ctx.fetchEngagementMetrics === "function") {
    try {
      fetched = (await ctx.fetchEngagementMetrics(state, ctx)) || {};
    } catch (error) {
      // The injected fetcher is read-only and already returns honest shapes; a thrown error here
      // is recorded honestly as unavailable rather than fabricating numbers.
      fetched = {
        revenue: { available: false, configured: true, error: `Revenue fetch failed: ${String(error.message || error)}` },
        signups: { available: false, configured: true, error: `Signup fetch failed: ${String(error.message || error)}` }
      };
    }
  }
  const { state: next, snapshot } = saveEngagementGrowthSnapshot(state, fetched, { now: ctx.nowIso, actor: ctx.actor });
  return {
    state: next,
    // Blocked sources are surfaced as proposals a human may act on (B4 itself never does).
    proposals: snapshot.blocked_sources.map((line) => ({ type: "connect_source", detail: line })),
    observations: [{
      type: "engagement_growth_summary",
      status: snapshot.status,
      live_sources_connected: snapshot.live_sources_connected,
      blocked_sources: snapshot.blocked_sources.length,
      whats_working: snapshot.deltas.whats_working
    }]
  };
}

// ---------------------------------------------------------------------------
// Heartbeat engine descriptor. cadence "daily" (revenue/signups don't move meaningfully hourly,
// and a daily GET keeps external reads cheap). DELIBERATELY no act():
//   • Read-only / never-posts is structural — there is no action path of any kind.
//   • The heartbeat skips act() for engines without one, so a toggled-ON autopilot is a no-op.
// Autopilot OFF by default (heartbeat.mjs) remains the uniform outer posture.
// ---------------------------------------------------------------------------
export function buildEngagementGrowthEngine(deps = {}) {
  return {
    id: ENGAGEMENT_GROWTH_ENGINE_ID,
    cadence: "daily",
    plan(state, ctx) {
      return planEngagementGrowth(state, { ...ctx, ...deps });
    }
    // NO act — by design. B4 observes and reports; it must never post, send, or write outward.
  };
}
