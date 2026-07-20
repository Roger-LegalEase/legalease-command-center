export const VNEXT_PERFORMANCE_BUDGETS = Object.freeze({
  listResponseBytes:250_000,
  detailResponseBytes:150_000,
  hostedPageReadP95Ms:750,
  userFeedbackMs:100,
  criticalCssBytes:180_000,
  // The strangler shell still carries the reviewed legacy compatibility runtime. Keep a
  // tight measured ceiling until CCX-804 evidence permits that runtime to be removed.
  initialClientJavaScriptBytes:1_650_000
});

export const VNEXT_PRIMARY_READS = Object.freeze([
  Object.freeze({ surface:"Today", path:"/api/ui/today", kind:"detail" }),
  Object.freeze({ surface:"Inbox", path:"/api/ui/inbox?group=needs-me&limit=25", kind:"list" }),
  Object.freeze({ surface:"Social", path:"/api/ui/social?view=ideas&limit=25", kind:"list" }),
  Object.freeze({ surface:"Outreach", path:"/api/ui/outreach?view=all&limit=25", kind:"list" }),
  Object.freeze({ surface:"Partners", path:"/api/ui/partners?view=list&limit=25", kind:"list" }),
  Object.freeze({ surface:"Files", path:"/api/ui/files?view=all&limit=25", kind:"list" }),
  Object.freeze({ surface:"Investor Room", path:"/api/ui/files/investor-room", kind:"detail" }),
  Object.freeze({ surface:"Search", path:"/api/ui/search?q=synthetic&limit=25", kind:"list" }),
  Object.freeze({ surface:"Create", path:"/api/ui/create/capabilities", kind:"detail" }),
  Object.freeze({ surface:"Discovery", path:"/api/ui/discovery/onboarding", kind:"detail" })
]);

export function percentile(values = [], percentile = 95) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const ordered = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return 0;
  const index = Math.max(0, Math.ceil((Math.min(100, Math.max(0, percentile)) / 100) * ordered.length) - 1);
  return ordered[index];
}

export function responseBudgetFor(kind = "detail") {
  return kind === "list" ? VNEXT_PERFORMANCE_BUDGETS.listResponseBytes : VNEXT_PERFORMANCE_BUDGETS.detailResponseBytes;
}
