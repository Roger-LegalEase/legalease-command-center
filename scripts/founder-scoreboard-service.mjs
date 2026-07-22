import { buildCashRunwayPulse } from "./operator-pulse-feeders.mjs";
import { recordVisibleToActor } from "./global-search-service.mjs";
import { roleHasCapability, roles } from "./roles.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const clean = (value = "") => String(value ?? "").trim();
const lower = (value = "") => clean(value).toLocaleLowerCase("en-US");
const slug = (value = "") => lower(value).replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");

export const FOUNDER_SCOREBOARD_ENDPOINT = "/api/ui/scoreboard";
export const FOUNDER_FINANCE_INPUT_ENDPOINT = "/api/ui/scoreboard/finance";

export const SCOREBOARD_STATUSES = Object.freeze({
  live:Object.freeze({ key:"live", label:"Live" }),
  manual:Object.freeze({ key:"manual", label:"Manual" }),
  unavailable:Object.freeze({ key:"unavailable", label:"Unavailable" }),
  needs_attention:Object.freeze({ key:"needs_attention", label:"Needs attention" })
});

export const SCOREBOARD_GROUPS = Object.freeze([
  Object.freeze({ key:"financial", label:"Financial" }),
  Object.freeze({ key:"acquisition", label:"Acquisition" }),
  Object.freeze({ key:"relationships", label:"Relationships" }),
  Object.freeze({ key:"customer", label:"Customer" }),
  Object.freeze({ key:"marketing", label:"Marketing" }),
  Object.freeze({ key:"health", label:"Health" })
]);

const FUNNEL_FIELDS = Object.freeze({
  website_visits:["landingPageVisits", "landing_page_visits", "websiteVisits", "website_visits", "webVisits"],
  signups:["registered", "signups", "signupCompleted", "signup_completed", "recordShieldUsers", "recordShieldStarts"],
  paid_signups:["paid", "paidSignups", "paid_signups", "customers"],
  intake_starts:["expungementIntakeStarted", "expungement_intake_started", "screeningsStarted", "screenings_started", "intakeStarts"],
  intake_completions:["expungementIntakeCompleted", "expungement_intake_completed", "intakeCompletions", "intake_completions", "screeningsCompleted", "screenings_completed"],
  purchases:["paymentCompleted", "payment_completed", "purchases", "paidConversions", "paid_conversions"],
  revenue:["revenue", "revenueGross", "revenue_gross"]
});

const TERMINAL_PARTNER_STAGES = new Set(["lost", "closed", "closed_lost", "inactive", "archived", "rejected"]);
const ACTIVE_PARTNER_STAGES = new Set(["new", "lead", "qualified", "outreach_sent", "intro_scheduled", "meeting_requested", "meeting_booked", "proposal_sent", "pilot_scoped", "verbal_yes", "contract_pending", "active_pilot", "signed_pilot", "reporting", "renewal", "expansion", "active", "live"]);
const PROPOSAL_STAGES = new Set(["proposal", "proposal_sent", "pilot_scoped", "verbal_yes", "contract_pending"]);
const STALLED_STAGES = new Set(["stalled", "paused", "dormant"]);
const TERMINAL_TASK_STATUSES = new Set(["done", "completed", "dismissed", "archived", "closed", "resolved"]);
const RESOLVED_SUPPORT_STATUSES = new Set(["resolved", "closed", "done", "dismissed", "archived"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function actorContext(actor = {}) {
  const role = lower(actor.role);
  const authorized = actor.authenticated === true && roles.includes(role) && roleHasCapability(role, "read_internal");
  return { authorized, role:authorized ? role : null };
}

function visibleList(state = {}, collection = "", role = "viewer") {
  return list(state[collection]).filter((record) => record && typeof record === "object" && recordVisibleToActor(record, role));
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validTimestamp(value = "") {
  const text = clean(value).slice(0, 80);
  if (!text) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text);
  return Number.isFinite(parsed) ? text : null;
}

function timestampMs(value = "") {
  const timestamp = validTimestamp(value);
  if (!timestamp) return Number.NEGATIVE_INFINITY;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(timestamp) ? `${timestamp}T00:00:00.000Z` : timestamp);
}

function newestTimestamp(records = [], fields = ["fetchedAt", "generated_at", "generatedAt", "updatedAt", "updated_at", "createdAt", "created_at", "timestamp", "date"]) {
  const values = [];
  for (const record of list(records)) {
    for (const field of fields) {
      const timestamp = validTimestamp(record?.[field]);
      if (timestamp) {
        values.push(timestamp);
        break;
      }
    }
  }
  return values.sort((left, right) => timestampMs(right) - timestampMs(left))[0] || null;
}

function monthKey(value = "") {
  const text = clean(value);
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  const timestamp = validTimestamp(text);
  return timestamp ? new Date(timestampMs(timestamp)).toISOString().slice(0, 7) : "";
}

function previousMonth(currentMonth) {
  const parsed = /^([0-9]{4})-([0-9]{2})$/.exec(currentMonth);
  if (!parsed) return "";
  const date = new Date(Date.UTC(Number(parsed[1]), Number(parsed[2]) - 2, 1));
  return date.toISOString().slice(0, 7);
}

function rowMonth(row = {}) {
  for (const field of ["dateRange", "month", "period", "capturedAt", "createdAt", "created_at", "updatedAt", "updated_at", "timestamp", "date"]) {
    const month = monthKey(row[field]);
    if (month) return month;
  }
  return "";
}

function firstMetric(record = {}, fields = []) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    const value = numberOrNull(record[field]);
    if (value !== null) return value;
  }
  return null;
}

function metricAggregate(rows = [], fields = []) {
  const contributors = list(rows).map((row) => ({ row, value:firstMetric(row, fields) })).filter(({ value }) => value !== null);
  return {
    available:contributors.length > 0,
    value:contributors.length ? contributors.reduce((sum, item) => sum + item.value, 0) : null,
    contributors:contributors.map((item) => item.row),
    refreshedAt:newestTimestamp(contributors.map((item) => item.row))
  };
}

function funnelPeriods(rows = [], now = "") {
  const currentMonth = monthKey(now);
  const priorMonth = previousMonth(currentMonth);
  const dated = list(rows).filter((row) => rowMonth(row));
  const undated = list(rows).filter((row) => !rowMonth(row));
  return {
    currentMonth,
    current:dated.length ? dated.filter((row) => rowMonth(row) === currentMonth) : undated,
    previous:dated.filter((row) => rowMonth(row) === priorMonth),
    dated:Boolean(dated.length)
  };
}

function isAutomaticRecord(record = {}) {
  return Boolean(clean(record.sourceEventId || record.source_event_id || record.eventType || record.event_type))
    || /product|webhook|analytics|live/i.test(clean(record.source));
}

function sourceStatus(kind = "unavailable", refreshedAt = null, now = "", staleDays = null) {
  if (kind === "unavailable") return SCOREBOARD_STATUSES.unavailable;
  if (kind === "needs_attention") return SCOREBOARD_STATUSES.needs_attention;
  if (staleDays !== null && refreshedAt && timestampMs(now) - timestampMs(refreshedAt) > staleDays * 86400000) return SCOREBOARD_STATUSES.needs_attention;
  return kind === "live" ? SCOREBOARD_STATUSES.live : SCOREBOARD_STATUSES.manual;
}

function valueShape(value, { unit = "count", currency = null, precision = null, available = value !== null, secondary = null } = {}) {
  return {
    available:Boolean(available),
    value:available ? value : null,
    unit:available ? unit : null,
    currency:available ? currency : null,
    precision:available ? precision : null,
    secondary:available ? secondary : null
  };
}

function previousShape(value = null, options = {}) {
  return {
    available:value !== null,
    value:value !== null ? value : null,
    unit:value !== null ? options.unit || "count" : null,
    currency:value !== null ? options.currency || null : null,
    refreshedAt:value !== null ? options.refreshedAt || null : null
  };
}

function card({ id, group, label, status = SCOREBOARD_STATUSES.unavailable, source = "Not available", refreshedAt = null, current = valueShape(null), previous = previousShape(), detail = null, href = null } = {}) {
  return {
    id,
    group,
    label,
    status,
    source:{ label:source },
    refreshedAt:validTimestamp(refreshedAt),
    current,
    previous,
    detail:clean(detail) || null,
    href:href || null
  };
}

function manualFinance(state, now) {
  const inputs = state.runwayInputs && typeof state.runwayInputs === "object" ? state.runwayInputs : {};
  const cash = numberOrNull(inputs.currentCashBalance ?? inputs.cashBalance);
  const burn = numberOrNull(inputs.monthlyBurn);
  const asOf = validTimestamp(inputs.asOfDate || inputs.as_of_date || inputs.updatedAt);
  const refreshedAt = validTimestamp(inputs.updatedAt || inputs.updated_at || inputs.asOfDate);
  const stale = asOf && timestampMs(now) - timestampMs(asOf) > 45 * 86400000;
  const status = cash === null && burn === null ? SCOREBOARD_STATUSES.unavailable : stale ? SCOREBOARD_STATUSES.needs_attention : SCOREBOARD_STATUSES.manual;
  return { inputs, cash, burn, asOf, refreshedAt, stale, status };
}

function sortedSnapshots(state, loop = "") {
  return list(state.operatingPulseSnapshots)
    .filter((snapshot) => !loop || snapshot.loop === loop)
    .sort((left, right) => timestampMs(right.generated_at || right.generatedAt) - timestampMs(left.generated_at || left.generatedAt));
}

function financeCards(state, now) {
  const finance = manualFinance(state, now);
  const stripe = state.stripeRevenue && typeof state.stripeRevenue === "object" ? state.stripeRevenue : null;
  const stripeRefreshed = validTimestamp(stripe?.fetchedAt || stripe?.updatedAt);
  const pulse = buildCashRunwayPulse(state, { now });
  const cashSnapshots = sortedSnapshots(state, "cash-runway");
  const priorPulse = cashSnapshots[0] || null;
  const priorCash = numberOrNull(priorPulse?.metrics?.cash_on_hand);
  const priorBurn = numberOrNull(priorPulse?.metrics?.burn_monthly);
  const priorRunway = numberOrNull(priorPulse?.metrics?.runway_months);
  const cards = [];

  cards.push(card({
    id:"cash_available", group:"financial", label:"Cash available",
    status:finance.cash === null ? SCOREBOARD_STATUSES.unavailable : finance.status,
    source:finance.cash === null ? "Owner input" : "Owner input",
    refreshedAt:finance.refreshedAt,
    current:valueShape(finance.cash, { unit:"currency", currency:"usd" }),
    previous:previousShape(priorCash, { unit:"currency", currency:"usd", refreshedAt:priorPulse?.generated_at }),
    detail:finance.cash === null ? "Add the current cash balance and an as-of date." : finance.stale ? "The cash as-of date is more than 45 days old." : finance.asOf ? `As of ${finance.asOf.slice(0, 10)}.` : "Owner-entered balance.",
    href:"#scoreboard"
  }));

  let revenue = null;
  if (stripe?.available === true) {
    revenue = numberOrNull(stripe.monthGross ?? stripe.monthlyGross ?? stripe.revenueThisMonth);
    if (revenue === null && stripe.dailyGross && typeof stripe.dailyGross === "object") {
      const daily = Object.entries(stripe.dailyGross).filter(([date, amount]) => monthKey(date) === monthKey(now) && numberOrNull(amount) !== null);
      if (daily.length) revenue = daily.reduce((sum, [, amount]) => sum + Number(amount), 0);
    }
    if (revenue === null && monthKey(stripe.since) === monthKey(now)) revenue = numberOrNull(stripe.gross);
  }
  const growthSnapshots = list(state.engagementGrowthSnapshots).sort((left, right) => timestampMs(right.generated_at) - timestampMs(left.generated_at));
  const priorRevenue = numberOrNull(growthSnapshots[1]?.metrics?.revenue?.gross ?? stripe?.previousMonthGross ?? stripe?.previousGross);
  cards.push(card({
    id:"revenue_this_month", group:"financial", label:"Revenue this month",
    status:stripe?.available === true && revenue !== null ? sourceStatus("live", stripeRefreshed, now, 7)
      : stripe?.configured === true ? SCOREBOARD_STATUSES.needs_attention : SCOREBOARD_STATUSES.unavailable,
    source:"Stripe",
    refreshedAt:stripeRefreshed,
    current:valueShape(revenue, { unit:"currency", currency:lower(stripe?.currency) || "usd" }),
    previous:previousShape(priorRevenue, { unit:"currency", currency:lower(stripe?.currency) || "usd", refreshedAt:growthSnapshots[1]?.generated_at }),
    detail:stripe?.available === true && revenue === null ? "Stripe is live, but a current-month total is not available." : stripe?.error || null,
    href:"#scoreboard"
  }));

  const refunds = stripe?.available === true ? numberOrNull(stripe.refundsThisMonth ?? stripe.monthlyRefunds ?? stripe.refundsGross ?? stripe.refundAmount) : null;
  cards.push(card({
    id:"refunds", group:"financial", label:"Refunds",
    status:refunds !== null ? sourceStatus("live", stripeRefreshed, now, 7) : stripe?.configured && stripe?.available === false ? SCOREBOARD_STATUSES.needs_attention : SCOREBOARD_STATUSES.unavailable,
    source:"Stripe",
    refreshedAt:stripeRefreshed,
    current:valueShape(refunds, { unit:"currency", currency:lower(stripe?.currency) || "usd" }),
    previous:previousShape(numberOrNull(stripe?.previousRefunds), { unit:"currency", currency:lower(stripe?.currency) || "usd", refreshedAt:stripeRefreshed }),
    detail:refunds === null ? "No refund total is available from the current payment snapshot." : null,
    href:"#scoreboard"
  }));

  cards.push(card({
    id:"monthly_burn", group:"financial", label:"Monthly burn",
    status:finance.burn === null ? SCOREBOARD_STATUSES.unavailable : finance.status,
    source:"Owner input",
    refreshedAt:finance.refreshedAt,
    current:valueShape(finance.burn, { unit:"currency", currency:"usd" }),
    previous:previousShape(priorBurn, { unit:"currency", currency:"usd", refreshedAt:priorPulse?.generated_at }),
    detail:finance.burn === null ? "Add monthly burn and an as-of date." : finance.stale ? "The burn as-of date is more than 45 days old." : null,
    href:"#scoreboard"
  }));

  const runway = finance.cash !== null && finance.burn !== null && finance.burn > 0 ? Math.floor((finance.cash / finance.burn) * 10) / 10 : null;
  cards.push(card({
    id:"runway", group:"financial", label:"Runway",
    status:runway === null ? SCOREBOARD_STATUSES.unavailable : finance.status,
    source:"Cash available ÷ monthly burn",
    refreshedAt:finance.refreshedAt,
    current:valueShape(runway, { unit:"months", precision:1 }),
    previous:previousShape(priorRunway, { unit:"months", refreshedAt:priorPulse?.generated_at }),
    detail:runway === null ? "Cash and positive monthly burn are required to calculate runway." : null,
    href:"#scoreboard"
  }));

  const revenueEvidence = [
    ...list(state.funnelSnapshots).filter((row) => FUNNEL_FIELDS.revenue.some((field) => Object.prototype.hasOwnProperty.call(row, field))),
    ...list(state.campaigns).filter((row) => ["paidConversionsRevenue", "revenue"].some((field) => Object.prototype.hasOwnProperty.call(row, field))),
    ...list(state.partnerPrograms).filter((row) => row.metrics && Object.prototype.hasOwnProperty.call(row.metrics, "revenueBooked") || Object.prototype.hasOwnProperty.call(row, "revenueBooked")),
    ...list(state.partners).filter((row) => ["expectedValue", "revenuePotential"].some((field) => Object.prototype.hasOwnProperty.call(row, field))),
    ...list(state.pilots).filter((row) => ["price", "expectedValue"].some((field) => Object.prototype.hasOwnProperty.call(row, field)))
  ];
  const booked = revenueEvidence.length ? pulse.booked_30d : null;
  const expected = revenueEvidence.length ? pulse.pipeline_weighted : null;
  const priorBooked = numberOrNull(cashSnapshots[1]?.metrics?.booked_30d);
  cards.push(card({
    id:"booked_expected_revenue", group:"financial", label:"Booked or expected revenue",
    status:booked === null && expected === null ? SCOREBOARD_STATUSES.unavailable : SCOREBOARD_STATUSES.manual,
    source:"Funnel, campaign, Partner, and pilot records",
    refreshedAt:newestTimestamp(revenueEvidence),
    current:valueShape(booked ?? expected, { unit:"currency", currency:"usd", secondary:booked !== null && expected !== null ? { label:"Expected", value:expected, unit:"currency", currency:"usd" } : null }),
    previous:previousShape(priorBooked, { unit:"currency", currency:"usd", refreshedAt:cashSnapshots[1]?.generated_at }),
    detail:booked !== null ? "Current value is booked in the last 30 days; expected revenue is shown separately." : expected !== null ? "Only expected pipeline revenue is available." : "No booked or expected revenue value is recorded.",
    href:"#scoreboard"
  }));
  return cards;
}

function funnelCard({ id, label, metric, rows, periods, liveOverride = null, previousOverride = null, now }) {
  if (liveOverride?.available === true && numberOrNull(liveOverride.value) !== null) {
    return card({
      id, group:"acquisition", label,
      status:sourceStatus("live", liveOverride.refreshedAt, now, 7), source:liveOverride.source,
      refreshedAt:liveOverride.refreshedAt,
      current:valueShape(numberOrNull(liveOverride.value), { unit:"count" }),
      previous:previousShape(numberOrNull(previousOverride), { unit:"count", refreshedAt:liveOverride.refreshedAt }),
      href:"#scoreboard"
    });
  }
  const current = metricAggregate(periods.current, FUNNEL_FIELDS[metric]);
  const previous = metricAggregate(periods.previous, FUNNEL_FIELDS[metric]);
  const automatic = current.contributors.length > 0 && current.contributors.every(isAutomaticRecord);
  const status = current.available ? sourceStatus(automatic ? "live" : "manual", current.refreshedAt, now, automatic ? 7 : null) : SCOREBOARD_STATUSES.unavailable;
  return card({
    id, group:"acquisition", label, status,
    source:automatic ? "Product events" : "Funnel records",
    refreshedAt:current.refreshedAt,
    current:valueShape(current.value, { unit:"count" }),
    previous:previousShape(previous.value, { unit:"count", refreshedAt:previous.refreshedAt }),
    detail:current.available ? periods.dated ? `Current period: ${periods.currentMonth}.` : "Across the recorded funnel rows." : rows.length ? "No current comparable value is recorded." : "No funnel data is available.",
    href:"#scoreboard"
  });
}

function acquisitionCards(state, now, role) {
  const rows = visibleList(state, "funnelSnapshots", role);
  const periods = funnelPeriods(rows, now);
  const signups = state.signups && typeof state.signups === "object" ? state.signups : null;
  const signupRefresh = validTimestamp(signups?.fetchedAt || signups?.updatedAt);
  const cards = [
    funnelCard({ id:"website_visits", label:"Website visits", metric:"website_visits", rows, periods, now }),
    funnelCard({
      id:"signups", label:"Signups", metric:"signups", rows, periods, now,
      liveOverride:signups?.available ? { available:true, value:signups.registered, refreshedAt:signupRefresh, source:"Signup service" } : null,
      previousOverride:signups?.previousRegistered
    }),
    funnelCard({
      id:"paid_signups", label:"Paid signups or customers", metric:"paid_signups", rows, periods, now,
      liveOverride:signups?.available ? { available:true, value:signups.paid, refreshedAt:signupRefresh, source:"Signup service" } : null,
      previousOverride:signups?.previousPaid
    }),
    funnelCard({ id:"intake_starts", label:"Intake starts", metric:"intake_starts", rows, periods, now }),
    funnelCard({ id:"intake_completions", label:"Intake completions", metric:"intake_completions", rows, periods, now }),
    funnelCard({ id:"purchases", label:"Purchases", metric:"purchases", rows, periods, now })
  ];
  const starts = metricAggregate(periods.current, FUNNEL_FIELDS.intake_starts);
  const purchases = metricAggregate(periods.current, FUNNEL_FIELDS.purchases);
  const previousStarts = metricAggregate(periods.previous, FUNNEL_FIELDS.intake_starts);
  const previousPurchases = metricAggregate(periods.previous, FUNNEL_FIELDS.purchases);
  const conversion = starts.available && purchases.available && starts.value > 0 ? Math.round((purchases.value / starts.value) * 1000) / 10 : null;
  const priorConversion = previousStarts.available && previousPurchases.available && previousStarts.value > 0 ? Math.round((previousPurchases.value / previousStarts.value) * 1000) / 10 : null;
  const automatic = [...starts.contributors, ...purchases.contributors].length > 0 && [...starts.contributors, ...purchases.contributors].every(isAutomaticRecord);
  cards.push(card({
    id:"conversion_rate", group:"acquisition", label:"Conversion rate",
    status:conversion === null ? SCOREBOARD_STATUSES.unavailable : sourceStatus(automatic ? "live" : "manual", newestTimestamp([...starts.contributors, ...purchases.contributors]), now, automatic ? 7 : null),
    source:"Purchases ÷ intake starts",
    refreshedAt:newestTimestamp([...starts.contributors, ...purchases.contributors]),
    current:valueShape(conversion, { unit:"percent", precision:1 }),
    previous:previousShape(priorConversion, { unit:"percent", refreshedAt:newestTimestamp([...previousStarts.contributors, ...previousPurchases.contributors]) }),
    detail:starts.available && starts.value === 0 ? "Conversion is unavailable because no intake starts are recorded for the period." : null,
    href:"#scoreboard"
  }));
  return cards;
}

function countCard({ id, group, label, rows = null, filtered = [], source, refreshedAt = null, previous = null, detail = null, href = null }) {
  const available = Array.isArray(rows);
  return card({
    id, group, label,
    status:available ? SCOREBOARD_STATUSES.manual : SCOREBOARD_STATUSES.unavailable,
    source,
    refreshedAt:refreshedAt || newestTimestamp(filtered),
    current:valueShape(available ? filtered.length : null, { unit:"count" }),
    previous:previousShape(previous, { unit:"count" }),
    detail:available ? detail : "No authoritative source is available.",
    href
  });
}

function relationshipsCards(state, now, role) {
  const partners = Array.isArray(state.partners) ? visibleList(state, "partners", role) : null;
  const prospects = Array.isArray(state.prospectCandidates) ? visibleList(state, "prospectCandidates", role) : [];
  const tasks = Array.isArray(state.tasks) ? visibleList(state, "tasks", role) : null;
  const meetings = Array.isArray(state.meetingBriefs) ? visibleList(state, "meetingBriefs", role) : null;
  const replies = Array.isArray(state.outreachReplies) ? visibleList(state, "outreachReplies", role) : null;
  const openPartners = partners ? partners.filter((partner) => {
    const stage = slug(partner.commercialStage || partner.stage || partner.status);
    return stage ? !TERMINAL_PARTNER_STAGES.has(stage) : true;
  }) : [];
  const activeProspects = prospects.filter((prospect) => !/rejected|dismissed|archived/i.test(clean(prospect.review_state || prospect.status)));
  const activeOpportunities = partners === null && !Array.isArray(state.prospectCandidates) ? null : [...openPartners, ...activeProspects];
  const followUps = tasks ? tasks.filter((task) => {
    if (TERMINAL_TASK_STATUSES.has(slug(task.status))) return false;
    const related = clean(task.partnerId || task.partner_id || task.linked_partner || task.relatedPartnerId)
      || /partner|prospect|relationship/i.test(clean(task.sourceType || task.source || task.relatedObjectType));
    const due = validTimestamp(task.dueDate || task.due_date || task.due_at);
    return Boolean(related && due && timestampMs(due) <= timestampMs(now));
  }) : [];
  const futureMeetings = meetings ? meetings.filter((meeting) => timestampMs(meeting.start_at || meeting.startAt) >= timestampMs(now)) : [];
  const proposals = partners ? partners.filter((partner) => PROPOSAL_STAGES.has(slug(partner.commercialStage || partner.stage || partner.status))) : [];
  const stalled = partners ? partners.filter((partner) => STALLED_STAGES.has(slug(partner.stage || partner.status)) || lower(partner.relationshipHealth).includes("risk")) : [];
  const partnerPulse = sortedSnapshots(state, "partner-health");
  return [
    countCard({ id:"active_partner_opportunities", group:"relationships", label:"Active Partner opportunities", rows:activeOpportunities, filtered:activeOpportunities || [], source:"Partner and prospect records", href:"#partners" }),
    countCard({ id:"followups_due", group:"relationships", label:"Follow-ups due", rows:tasks, filtered:followUps, source:"Relationship tasks", href:"#partners" }),
    countCard({ id:"meetings_booked", group:"relationships", label:"Meetings booked", rows:meetings, filtered:futureMeetings, source:"Read-only Calendar", href:"#calendar" }),
    countCard({ id:"proposals_active", group:"relationships", label:"Proposals active", rows:partners, filtered:proposals, source:"Partner records", href:"#partners" }),
    countCard({ id:"stalled_relationships", group:"relationships", label:"Stalled relationships", rows:partners, filtered:stalled, source:"Partner records", previous:numberOrNull(partnerPulse[1]?.metrics?.stalled_partners), href:"#partners" }),
    countCard({ id:"outreach_replies", group:"relationships", label:"Outreach replies", rows:replies, filtered:replies || [], source:"Outreach replies", href:"#outreach" })
  ];
}

function customerCards(state, now, role) {
  const issues = Array.isArray(state.supportIssues) ? visibleList(state, "supportIssues", role) : null;
  const open = issues ? issues.filter((issue) => !RESOLVED_SUPPORT_STATUSES.has(slug(issue.status))) : [];
  const fresh = open.filter((issue) => ["new", "open", "unread"].includes(slug(issue.status || "new")));
  const urgent = open.filter((issue) => /urgent|critical|high/.test(lower(issue.urgency || issue.severity || issue.priority)));
  const waiting = open.filter((issue) => /new|open|waiting_on_legalease|needs_reply|in_progress/.test(slug(issue.status || "open")));
  const weekAgo = timestampMs(now) - 7 * 86400000;
  const resolved = issues ? issues.filter((issue) => RESOLVED_SUPPORT_STATUSES.has(slug(issue.status))
    && timestampMs(issue.resolvedAt || issue.resolved_at || issue.updatedAt || issue.updated_at) >= weekAgo) : [];
  return [
    countCard({ id:"new_support_issues", group:"customer", label:"New support issues", rows:issues, filtered:fresh, source:"Support queue", href:"#support" }),
    countCard({ id:"open_urgent_issues", group:"customer", label:"Open urgent issues", rows:issues, filtered:urgent, source:"Support queue", href:"#support" }),
    countCard({ id:"waiting_on_legalease", group:"customer", label:"Waiting on LegalEase", rows:issues, filtered:waiting, source:"Support queue", href:"#support" }),
    countCard({ id:"resolved_this_week", group:"customer", label:"Resolved this week", rows:issues, filtered:resolved, source:"Support queue", href:"#support" })
  ];
}

function marketingCards(state, role) {
  const posts = Array.isArray(state.posts) ? visibleList(state, "posts", role) : null;
  const campaigns = Array.isArray(state.outreachCampaigns) ? visibleList(state, "outreachCampaigns", role) : null;
  const contacts = Array.isArray(state.outreachContacts) ? visibleList(state, "outreachContacts", role) : null;
  const attempts = Array.isArray(state.outreachAttempts) ? visibleList(state, "outreachAttempts", role) : null;
  const replies = Array.isArray(state.outreachReplies) ? visibleList(state, "outreachReplies", role) : null;
  const ready = posts ? posts.filter((post) => /ready|approved|ready_to_publish/.test(slug(post.status))) : [];
  const published = posts ? posts.filter((post) => Boolean(post.manuallyPostedAt || post.postedAt || post.publishedAt) || /published|posted/.test(slug(post.status))) : [];
  const needsResults = published.filter((post) => !validTimestamp(post.performanceUpdatedAt || post.resultsUpdatedAt));
  const activeCampaigns = campaigns ? campaigns.filter((campaign) => /active|live|running|released/.test(slug(campaign.status))) : [];
  const pressCampaignIds = new Set((campaigns || []).filter((campaign) => /press|media|journalist/.test(lower([campaign.name, campaign.classification, campaign.type, campaign.lane].join(" ")))).map((campaign) => clean(campaign.campaign_id || campaign.campaignId || campaign.id)));
  const pressContactIds = new Set((contacts || []).filter((contact) => /press|media|journalist/.test(lower([contact.classification, contact.type, contact.relationshipCategory].join(" ")))).map((contact) => clean(contact.contact_id || contact.id)));
  const pressAttempts = (attempts || []).filter((attempt) => pressCampaignIds.has(clean(attempt.campaign_id || attempt.campaignId)) || pressContactIds.has(clean(attempt.contact_id || attempt.contactId)));
  const pressReplies = (replies || []).filter((reply) => pressCampaignIds.has(clean(reply.campaign_id || reply.campaignId)) || pressContactIds.has(clean(reply.contact_id || reply.contactId)));
  const pressSourceAvailable = campaigns !== null && contacts !== null && attempts !== null && replies !== null;
  const growthSnapshots = list(state.engagementGrowthSnapshots).sort((left, right) => timestampMs(right.generated_at) - timestampMs(left.generated_at));
  return [
    countCard({ id:"social_drafts_ready", group:"marketing", label:"Social drafts ready", rows:posts, filtered:ready, source:"Social drafts", href:"#social" }),
    countCard({ id:"posts_published", group:"marketing", label:"Posts recorded as published", rows:posts, filtered:published, source:"Social records", previous:numberOrNull(growthSnapshots[1]?.metrics?.content?.posted_count), href:"#social" }),
    countCard({ id:"content_needing_results", group:"marketing", label:"Content requiring results", rows:posts, filtered:needsResults, source:"Social records", href:"#social" }),
    countCard({ id:"active_outreach_campaigns", group:"marketing", label:"Active outreach campaigns", rows:campaigns, filtered:activeCampaigns, source:"Outreach campaigns", href:"#outreach" }),
    countCard({ id:"press_pitches_replies", group:"marketing", label:"Press pitches and replies", rows:pressSourceAvailable ? [...pressAttempts, ...pressReplies] : null, filtered:[...pressAttempts, ...pressReplies], source:"Press outreach", detail:pressSourceAvailable ? `${pressAttempts.length} pitch touch(es), ${pressReplies.length} reply/replies.` : null, href:"#outreach" })
  ];
}

function connector(state, keys = []) {
  const wanted = new Set(keys.map(slug));
  return list(state.connectorStatus).find((item) => wanted.has(slug(item.connector || item.key || item.name))) || null;
}

function healthEvidence({ connected = null, configured = null, needsAttention = false, source, refreshedAt = null, detail = null }) {
  const status = needsAttention || configured === true && connected === false ? SCOREBOARD_STATUSES.needs_attention
    : connected === true ? SCOREBOARD_STATUSES.live : SCOREBOARD_STATUSES.unavailable;
  return { status, source, refreshedAt, detail, value:connected === true ? "Healthy" : status.key === "needs_attention" ? "Needs attention" : null };
}

function healthCard(id, label, evidence, href = "#os-health") {
  return card({
    id, group:"health", label,
    status:evidence.status,
    source:evidence.source,
    refreshedAt:evidence.refreshedAt,
    current:valueShape(evidence.value, { unit:"status", available:evidence.value !== null }),
    detail:evidence.detail,
    href
  });
}

function healthCards(state, now) {
  const health = list(state.osHealthSnapshots).sort((left, right) => timestampMs(right.generated_at) - timestampMs(left.generated_at))[0] || null;
  const healthAt = validTimestamp(health?.generated_at || health?.generatedAt);
  const runtime = state.runtime && typeof state.runtime === "object" ? state.runtime : {};
  const applicationGood = health ? health.overall_health === "healthy" : typeof runtime.applicationHealthy === "boolean" ? runtime.applicationHealthy : null;
  const application = healthEvidence({ connected:applicationGood, configured:health ? true : null, needsAttention:health ? !["healthy"].includes(health.overall_health) : false, source:"Application health", refreshedAt:healthAt, detail:health?.summary?.next_operator_action || null });

  const db = health?.connection_health?.supabase_db;
  const storage = health?.connection_health?.supabase_storage;
  const runtimeDb = typeof runtime.supabaseDbConnected === "boolean" ? runtime.supabaseDbConnected : null;
  const supabaseConnected = db || storage ? Boolean(db?.ok && storage?.ok) : runtimeDb;
  const supabase = healthEvidence({ connected:supabaseConnected, configured:db || storage || runtimeDb !== null ? true : null, source:"Supabase health", refreshedAt:healthAt, detail:db?.detail || storage?.detail || null });

  const emailConnector = connector(state, ["sendgrid", "email", "email_provider"]);
  const webhook = state.sendgridWebhookHealth && typeof state.sendgridWebhookHealth === "object" ? state.sendgridWebhookHealth : null;
  const emailError = clean(emailConnector?.lastError || webhook?.last_error || webhook?.lastError);
  const emailConnected = emailConnector ? /connected|healthy|ok|success/.test(lower(emailConnector.lastSyncStatus || emailConnector.status))
    : webhook && validTimestamp(webhook.lastOkAt || webhook.last_ok_at) ? true : null;
  const email = healthEvidence({ connected:emailConnected, configured:emailConnector?.configured ?? (webhook ? true : null), needsAttention:Boolean(emailError), source:"Email provider health", refreshedAt:emailConnector?.lastSyncAt || webhook?.lastOkAt || webhook?.last_ok_at, detail:emailError || null });

  const googleConnector = connector(state, ["gmail", "calendar", "google", "google_workspace"]);
  const googleAccount = list(state.socialAccounts).find((account) => account.platform === "google_workspace") || null;
  const googleConnected = googleAccount ? Boolean(googleAccount.connected || googleAccount.status === "connected" || googleAccount.hasStoredToken || googleAccount.connectedAt || googleAccount.accessTokenEncrypted || googleAccount.refreshTokenEncrypted)
    : googleConnector ? /connected|healthy|ok|success/.test(lower(googleConnector.lastSyncStatus || googleConnector.status)) : null;
  const googleError = clean(googleAccount?.lastErrorSummary || googleAccount?.lastError || googleConnector?.lastError);
  const google = healthEvidence({ connected:googleConnected, configured:googleAccount || googleConnector ? true : null, needsAttention:Boolean(googleError) || /refresh|reconnect|error|fail/.test(lower(googleAccount?.status || googleConnector?.lastSyncStatus)), source:"Google read-only connection", refreshedAt:googleConnector?.lastSyncAt || googleAccount?.updatedAt || googleAccount?.connectedAt, detail:googleError || null });

  const websiteConnector = connector(state, ["website", "analytics", "website_analytics"]);
  const websiteConnected = websiteConnector ? /connected|healthy|ok|success|available/.test(lower(websiteConnector.lastSyncStatus || websiteConnector.status)) : null;
  const websiteError = clean(websiteConnector?.lastError);
  const website = healthEvidence({ connected:websiteConnected, configured:websiteConnector?.configured ?? null, needsAttention:Boolean(websiteError), source:"Website analytics", refreshedAt:websiteConnector?.lastSyncAt, detail:websiteError || null });

  const stripe = state.stripeRevenue && typeof state.stripeRevenue === "object" ? state.stripeRevenue : null;
  const stripeEvidence = healthEvidence({ connected:stripe?.available === true ? true : stripe ? false : null, configured:stripe?.configured ?? (stripe?.available ? true : null), needsAttention:Boolean(stripe?.configured && !stripe?.available), source:"Stripe", refreshedAt:stripe?.fetchedAt, detail:stripe?.error || null });

  const runs = list(state.heartbeatRuns).sort((left, right) => timestampMs(right.ranAt || right.createdAt || right.startedAt) - timestampMs(left.ranAt || left.createdAt || left.startedAt));
  const latestRun = runs[0] || null;
  const runStatus = lower(latestRun?.status);
  const runAt = validTimestamp(latestRun?.ranAt || latestRun?.createdAt || latestRun?.startedAt);
  const recent = runAt && timestampMs(now) - timestampMs(runAt) <= 2 * 86400000;
  const jobs = healthEvidence({ connected:latestRun ? Boolean(recent && /success|complete|completed|ok/.test(runStatus)) : null, configured:latestRun ? true : null, needsAttention:Boolean(latestRun && (!recent || /fail|error|blocked/.test(runStatus))), source:"Background job history", refreshedAt:runAt, detail:latestRun && !recent ? "No successful background job is recorded in the last two days." : null });

  return [
    healthCard("application_health", "Application", application),
    healthCard("supabase_health", "Supabase", supabase),
    healthCard("email_provider_health", "Email provider", email),
    healthCard("google_connection_health", "Google connection", google, "#settings"),
    healthCard("website_analytics_health", "Website or analytics source", website, "#settings"),
    healthCard("stripe_health", "Stripe", stripeEvidence, "#settings"),
    healthCard("background_jobs_health", "Background jobs", jobs)
  ];
}

export function buildFounderScoreboard(state = {}, actor = {}, now = "") {
  const context = actorContext(actor);
  const generatedAt = validTimestamp(now);
  if (!context.authorized) return deepFreeze({
    available:false,
    generatedAt:generatedAt || null,
    availability:{ state:"not_authorized", reason:"read_access_required" },
    groups:[],
    cards:[],
    summary:{ live:0, manual:0, unavailable:0, needsAttention:0 },
    safety:{ fullStateReturned:false, mutations:0, externalActions:0 }
  });
  if (!generatedAt) return deepFreeze({
    available:false,
    generatedAt:null,
    availability:{ state:"unavailable", reason:"valid_timestamp_required" },
    groups:[], cards:[], summary:{ live:0, manual:0, unavailable:0, needsAttention:0 },
    safety:{ fullStateReturned:false, mutations:0, externalActions:0 }
  });
  const cards = [
    ...financeCards(state, generatedAt),
    ...acquisitionCards(state, generatedAt, context.role),
    ...relationshipsCards(state, generatedAt, context.role),
    ...customerCards(state, generatedAt, context.role),
    ...marketingCards(state, context.role),
    ...healthCards(state, generatedAt)
  ];
  const groups = SCOREBOARD_GROUPS.map((group) => ({ ...group, cards:cards.filter((item) => item.group === group.key) }));
  return deepFreeze({
    available:true,
    generatedAt,
    availability:{ state:"available", reason:null },
    groups,
    cards,
    summary:{
      live:cards.filter((item) => item.status.key === "live").length,
      manual:cards.filter((item) => item.status.key === "manual").length,
      unavailable:cards.filter((item) => item.status.key === "unavailable").length,
      needsAttention:cards.filter((item) => item.status.key === "needs_attention").length
    },
    manualFinance:{
      endpoint:FOUNDER_FINANCE_INPUT_ENDPOINT,
      currentCashBalance:numberOrNull(state.runwayInputs?.currentCashBalance ?? state.runwayInputs?.cashBalance),
      monthlyBurn:numberOrNull(state.runwayInputs?.monthlyBurn),
      asOfDate:validTimestamp(state.runwayInputs?.asOfDate || state.runwayInputs?.as_of_date),
      updatedAt:validTimestamp(state.runwayInputs?.updatedAt || state.runwayInputs?.updated_at)
    },
    safety:{ fullStateReturned:false, mutations:0, externalActions:0, missingValuesRenderedAsZero:false }
  });
}

export class FounderScoreboardValidationError extends Error {
  constructor(message, code = "invalid_scoreboard_input", status = 400) {
    super(message);
    this.name = "FounderScoreboardValidationError";
    this.code = code;
    this.status = status;
  }
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function moneyInput(value, label) {
  if (value === "" || value === null) return "";
  const number = numberOrNull(value);
  if (number === null || number < 0 || number > 1_000_000_000_000) throw new FounderScoreboardValidationError(`${label} must be a non-negative number.`);
  return Math.round(number * 100) / 100;
}

function asOfInput(value, now) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !validTimestamp(text)) throw new FounderScoreboardValidationError("Choose a valid as-of date.");
  if (text > now.slice(0, 10)) throw new FounderScoreboardValidationError("The as-of date cannot be in the future.");
  return text;
}

export function updateFounderFinanceInputs(state = {}, actor = {}, input = {}, now = "") {
  const context = actorContext(actor);
  if (!context.authorized || context.role !== "owner") throw new FounderScoreboardValidationError("Only the signed-in owner can update cash and burn.", "owner_required", 403);
  const updatedAt = validTimestamp(now);
  if (!updatedAt) throw new FounderScoreboardValidationError("A valid server timestamp is required.");
  const existing = state.runwayInputs && typeof state.runwayInputs === "object" ? state.runwayInputs : {};
  if (hasOwn(input, "expectedUpdatedAt") && clean(input.expectedUpdatedAt) !== clean(existing.updatedAt || existing.updated_at)) {
    throw new FounderScoreboardValidationError("Financial inputs changed; refresh and try again.", "financial_inputs_changed", 409);
  }
  if (!["currentCashBalance", "monthlyBurn", "asOfDate"].some((key) => hasOwn(input, key))) {
    throw new FounderScoreboardValidationError("Enter cash, monthly burn, or an as-of date.");
  }
  const runwayInputs = {
    ...existing,
    currentCashBalance:hasOwn(input, "currentCashBalance") ? moneyInput(input.currentCashBalance, "Cash available") : existing.currentCashBalance ?? existing.cashBalance ?? "",
    monthlyBurn:hasOwn(input, "monthlyBurn") ? moneyInput(input.monthlyBurn, "Monthly burn") : existing.monthlyBurn ?? "",
    asOfDate:hasOwn(input, "asOfDate") ? asOfInput(input.asOfDate, updatedAt) : updatedAt.slice(0, 10),
    updatedAt,
    updatedBy:clean(actor.id || actor.label || actor.role).slice(0, 120) || "owner"
  };
  delete runwayInputs.cashBalance;
  delete runwayInputs.as_of_date;
  delete runwayInputs.updated_at;
  // Do not deep-freeze this mutation result: next state intentionally shares untouched
  // records with the input, and freezing those references would mutate caller-owned state.
  return {
    state:{ ...state, runwayInputs },
    runwayInputs,
    patch:{ runwayInputs },
    changedCollections:["runwayInputs"],
    message:"Financial inputs saved.",
    safety:{ scopedWrite:true, externalActions:0, liveConfigurationChanged:false }
  };
}
