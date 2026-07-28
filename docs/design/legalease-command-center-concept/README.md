# LegalEase Command Center — Solo Operator Concept

A polished product concept for a founder-led LegalEase operating system, designed from the functions and Founder OS direction already present in `Roger-LegalEase/legalease-command-center`.

## Product structure

The interface reduces the Command Center to four primary workspaces:

1. **Today** — a ranked operating queue, not a passive dashboard.
2. **Relationships** — one CRM for partners, investors, press, vendors, and customers.
3. **Campaigns** — Social, Reactivation, Partner Outreach, and Press Outreach using the same Plan → Review → Run → Monitor → Stop lifecycle.
4. **Scoreboard** — a source-aware operating picture with financial, acquisition, pipeline, customer, marketing, and platform-health metrics.

Global controls are Search, Create, Le-E, and Settings. Email, publishing, campaign activation, and calendar writes remain review-and-confirm actions.

## Included screens

- 01 Today
- 02 Today — universal action panel
- 03 Relationships
- 04 Relationship detail
- 05 Campaigns
- 06 Social campaign workspace
- 07 Scoreboard
- 08 Global search
- 09 Global create
- 10 Le-E side panel
- 11 Settings and safety

## Files

- `gallery.html` — visual gallery with links to every full-size screen.
- `command-center-concept.html` — static HTML/CSS prototype. Add `?screen=SCREEN_KEY` to the filename, using: `today`, `todayAction`, `relationships`, `relationshipDetail`, `campaigns`, `socialCampaign`, `scoreboard`, `searchOverlay`, `createOverlay`, `leeOverlay`, or `settings`.
- `screens/` — 3200 × 2000 PNG exports.
- `LegalEase-Command-Center-Screen-Set.png` — contact sheet.
- `build_prototype.py` — source used to generate the prototype HTML.
- `build_screenshots.mjs` — regenerates `screens/` and the contact sheet FROM the prototype. Run it
  after any change to `build_prototype.py`: a PNG carries its content as pixels, which no secret or
  PII scanner in this repository reads, so screenshots must be rebuilt rather than trusted.

All people, organizations, emails, counts, dates, and financial values in this package are
synthetic design fixtures. They are illustrative only and must never be copied into production
renderers or default application state.

This is a visual product concept and does not write to the repository or connect to production data.
