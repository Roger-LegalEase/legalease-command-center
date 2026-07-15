export const consoleErrorBaseline = Object.freeze([
  Object.freeze({
    id:"geist-stylesheet-blocked-by-style-csp",
    pattern:/^Loading the stylesheet 'https:\/\/fonts\.googleapis\.com\/css2\?family=Geist:wght@400;500;600;700;800&display=swap' violates the following Content Security Policy directive: "style-src 'self' 'unsafe-inline'"\./
  }),
  Object.freeze({
    id:"geist-stylesheet-blocked-by-connect-csp",
    pattern:/^Connecting to 'https:\/\/fonts\.googleapis\.com\/css2\?family=Geist:wght@400;500;600;700;800&display=swap' violates the following Content Security Policy directive: "connect-src 'self'"\./
  })
]);

const todayContrastTargets = Object.freeze([
  "#ckm-agents > .ck-card > .ck-sec-head > .hint",
  "#ckm-campaign-safety > .ck-card > .ck-module-body > .ck-meter-note",
  "#ckm-campaign-safety > .ck-card > .ck-sec-head > .hint",
  "#ckm-conversion-funnel > .ck-card > .ck-sec-head > .hint",
  "#ckm-drafts > .ck-card > .ck-module-body > .ck-empty",
  "#ckm-inbox > .ck-card > .ck-sec-head > .hint",
  "#ckm-meetings > .ck-card > .ck-module-body > .ck-empty",
  "#ckm-money > .ck-card > .ck-module-body > .ck-rows > .ck-lrow > .txt > .s",
  "#ckm-money > .ck-card > .ck-module-body > .ck-viz-empty > div",
  "#ckm-partners > .ck-card > .ck-module-body > .ck-rows > .ck-lrow:nth-child(1) > .txt > .s",
  "#ckm-social-pulse > .ck-card > .ck-module-body > .ck-meter-note",
  "#ckm-social-pulse > .ck-card > .ck-sec-head > .hint",
  "#ckm-system-health > .ck-card > .ck-sec-head > .hint",
  "#ckm-watchlist > .ck-card > .ck-sec-head > .hint",
  "#cks-decisions > .ck-sec-head > .hint",
  "#cks-outputs > .ck-sec-head > .hint",
  "#cks-overnight > .ck-sec-head > .hint",
  "#cks-scoreboard > .ck-sec-head > .hint",
  ".ck-approve.ck-card:nth-child(1) > .from",
  ".ck-approve.ck-card:nth-child(2) > .from",
  ".ck-approve.ck-card:nth-child(3) > .from",
  ".ck-counter.good:nth-child(1) > .l",
  ".ck-counter.good:nth-child(2) > .l",
  ".ck-counter.good:nth-child(3) > .l",
  ".ck-counter:nth-child(4) > .l",
  ".ck-counter:nth-child(4) > .na.n",
  ".ck-eyebrow",
  ".ck-footnote",
  ".ck-fstep:nth-child(1) > .l",
  ".ck-fstep:nth-child(1) > .na.n",
  ".ck-fstep:nth-child(2) > .l",
  ".ck-fstep:nth-child(2) > .na.n",
  ".ck-fstep:nth-child(3) > .l",
  ".ck-fstep:nth-child(3) > .na.n",
  ".ck-fstep:nth-child(4) > .l",
  ".ck-fstep:nth-child(4) > .na.n",
  ".ck-fstep:nth-child(5) > .l",
  ".ck-kpi.ck-score.ck-card:nth-child(1) > .na.value",
  ".ck-kpi.ck-score.ck-card:nth-child(1) > .vs",
  ".ck-kpi.ck-score.ck-card:nth-child(2) > .na.value",
  ".ck-kpi.ck-score.ck-card:nth-child(2) > .vs",
  ".ck-kpi.ck-score.ck-card:nth-child(3) > .na.value",
  ".ck-kpi.ck-score.ck-card:nth-child(3) > .vs",
  ".ck-kpi.ck-score.ck-card:nth-child(4) > .na.value",
  ".ck-kpi.ck-score.ck-card:nth-child(4) > .vs",
  ".ck-kpi.ck-score.ck-card:nth-child(5) > .na.value",
  ".ck-kpi.ck-score.ck-card:nth-child(5) > .vs",
  ".ck-kpi.ck-score.ck-card:nth-child(6) > .vs",
  ".ck-lrow:nth-child(2) > .txt > .s",
  ".ck-lrow:nth-child(3) > .txt > .s",
  ".ck-module-body > .ck-sec-head > .hint",
  ".ck-when > .s",
  ".ok",
  ".scroll > .ck-empty",
  ".teal.ck-pill",
  ".when"
]);

export const accessibilityBaseline = Object.freeze({
  today:Object.freeze([
    Object.freeze({ rule:"color-contrast", impact:"serious", targets:todayContrastTargets })
  ]),
  social:Object.freeze([
    Object.freeze({
      rule:"color-contrast",
      impact:"serious",
      targets:Object.freeze([".wizard-actions > .primary[type=\"button\"]"])
    })
  ])
});
