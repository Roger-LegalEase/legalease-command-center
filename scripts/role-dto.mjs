const list = (value) => Array.isArray(value) ? value : [];
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function viewerReportDto(state = {}) {
  const campaign = state.reactivationCampaign || {};
  const campaignStatus = ["not_configured", "draft", "paused", "completed"].includes(String(campaign.status || ""))
    ? String(campaign.status)
    : "unavailable";
  return {
    generatedAt: new Date().toISOString(),
    products: {
      total: list(state.products).length,
      live: list(state.products).filter((item) => ["live", "active"].includes(String(item.stage || "").toLowerCase())).length
    },
    partners: {
      total: list(state.partners).length,
      active: list(state.partners).filter((item) => /active|live|onboarded/i.test(String(item.status || ""))).length
    },
    campaigns: {
      total: list(state.campaigns).length,
      reactivationStatus: campaignStatus
    },
    funnel: list(state.funnelSnapshots).slice(0, 1).map((item) => ({
      screeningsStarted: num(item.screeningsStarted || item.expungementIntakeStarted),
      paymentsCompleted: num(item.paymentCompleted),
      revenue: num(item.revenue)
    }))[0] || { screeningsStarted: 0, paymentsCompleted: 0, revenue: 0 },
    reports: { total: list(state.reports).length }
  };
}

export function stateAccessAllowed(role = "") {
  return ["owner", "admin"].includes(String(role).toLowerCase());
}

export function stripServerOnlyState(state = {}) {
  const copy = { ...state };
  for (const key of ["authSessions", "webhookReplayClaims", "oauthStateClaims", "publishClaims", "auditEvents", "securityMetrics"]) delete copy[key];
  return copy;
}
