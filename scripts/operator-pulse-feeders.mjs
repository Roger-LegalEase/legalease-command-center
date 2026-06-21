import { buildDailyRunSnapshot } from "./daily-run-session.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value = 0) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function manualRunwayInputs(state = {}) {
  const inputs = state.runwayInputs || {};
  const cashRaw = inputs.currentCashBalance ?? inputs.cashBalance ?? "";
  const burnRaw = inputs.monthlyBurn ?? "";
  const cashEntered = cashRaw !== "" && cashRaw !== null && cashRaw !== undefined;
  const burnEntered = burnRaw !== "" && burnRaw !== null && burnRaw !== undefined;
  const cashOnHand = cashEntered ? number(cashRaw) : 0;
  const burnMonthly = burnEntered ? number(burnRaw) : 0;
  const complete = cashEntered && burnEntered && cashOnHand > 0 && burnMonthly > 0;
  return { cashOnHand, burnMonthly, complete };
}

function dateMs(value = "") {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function withinDays(item = {}, days = 30, now = Date.now()) {
  const values = [item.date, item.dateRange, item.month, item.createdAt, item.created_at, item.updatedAt, item.updated_at].filter(Boolean);
  if (!values.length) return true;
  const newest = Math.max(...values.map(dateMs));
  if (!newest) return true;
  return now - newest <= days * 86400000;
}

export function buildCashRunwayPulse(state = {}, options = {}) {
  const now = dateMs(options.now || Date.now()) || Date.now();
  const funnelBooked = list(state.funnelSnapshots).filter(item => withinDays(item, 30, now)).reduce((sum, item) => sum + number(item.revenue), 0);
  const campaignBooked = list(state.campaigns).filter(item => withinDays(item, 30, now)).reduce((sum, item) => sum + number(item.paidConversionsRevenue || item.revenue), 0);
  const partnerProgramBooked = list(state.partnerPrograms).filter(item => withinDays(item, 30, now)).reduce((sum, item) => sum + number(item.metrics?.revenueBooked || item.revenueBooked), 0);
  const booked_30d = funnelBooked + campaignBooked + partnerProgramBooked;
  const partnerPipelineWeighted = list(state.partners).reduce((sum, item) => {
    const probability = number(item.probability);
    return sum + number(item.expectedValue || item.revenuePotential) * (probability > 1 ? probability / 100 : probability);
  }, 0);
  const pilotPipeline = list(state.pilots).reduce((sum, item) => sum + number(item.price || item.expectedValue), 0);
  const runway = manualRunwayInputs(state);
  return {
    booked_30d,
    booked_sources: { funnel: funnelBooked, campaigns: campaignBooked, partner_programs: partnerProgramBooked },
    pipeline_weighted: partnerPipelineWeighted + pilotPipeline,
    pipeline_sources: { partners_weighted: partnerPipelineWeighted, pilots: pilotPipeline },
    burn_monthly: runway.burnMonthly,
    cash_on_hand: runway.cashOnHand,
    runway_months: runway.complete ? Math.floor((runway.cashOnHand / runway.burnMonthly) * 10) / 10 : null,
    read_only: true,
    external_action: false,
    todo: runway.complete ? "" : "Add cash + burn to compute."
  };
}

export function buildFounderCapacityPulse(state = {}, options = {}) {
  const snapshot = buildDailyRunSnapshot(state, options);
  const itemsNeedingOperator = list(snapshot.buckets).reduce((sum, bucket) => sum + list(bucket.items).length, 0);
  const completedToday = list(state.activityEvents).filter(item => /complete|completed|reviewed|approved|resolved/i.test([item.eventType, item.action, item.title].join(" ")) && withinDays(item, 1, dateMs(options.now || Date.now()) || Date.now())).length;
  const backlogTrend = itemsNeedingOperator > completedToday ? "growing" : itemsNeedingOperator < completedToday ? "clearing" : "steady";
  return {
    items_needing_operator: itemsNeedingOperator,
    completed_today: completedToday,
    backlog_trend: backlogTrend,
    overload_warning: itemsNeedingOperator >= number(options.warningThreshold || 12) || backlogTrend === "growing",
    read_only: true,
    external_action: false
  };
}
