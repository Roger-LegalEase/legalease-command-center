# vNext accessibility audit

CCX-801 treats Today, Inbox, Social, Outreach, Partners, Files, Investor Room, Search, Create,
and Discovery as primary workflows. The launch audit runs at 1440, 1280, 1024, 768, and 390 px.

The focused browser gate requires zero critical or serious axe findings, one visible `main`
landmark with an `h1`, labelled navigation, no page-level horizontal overflow, and accessible
Search, Create, and onboarding dialogs. Keyboard coverage verifies initial focus, Escape,
and focus return. Existing responsive-shell coverage separately verifies navigation-drawer focus
containment, overlay dismissal, and focus return.

The source contract checks visible focus styling, reduced-motion support, practical 44 px targets,
live regions, dialog semantics, headings, and narrow-screen alternatives. Status labels include
text; color is supplemental. Form controls and errors remain labelled and associated in the
rendered axe audit.

Run `npm run test:vnext-accessibility` and
`npm run test:browser -- vnext-accessibility-audit.spec.mjs responsive-shell.spec.mjs`.
