# The Morning Walkthrough — Roger's acceptance test

Purpose: the usability overhaul (PRs #49–#52) is judged by ONE test, in Roger's words:
*"can Roger do his whole morning routine without asking anyone what a button does."*
Roger performs this walkthrough himself, on prod, after the Render promote. Every step
names what you should see; if any step confuses you or a click does nothing visibly,
the overhaul failed that step — note it and we fix it.

Latency budget (from the approved proposal): every button visibly reacts within 100ms
(pressed + spinner); warm actions complete in about a second; Today paints in about a
second on a warm server.

## Prerequisites

- Render promoted to a commit containing PR #52 (check `/api/version`).
- Signed in with the owner token.

## The walkthrough

**1. Open the app.**
   - You land on **Today** (no cockpit-vs-today choice; old `#cockpit` bookmarks land here too).
   - Top of page: one sentence of system truth — "All systems normal. Heartbeat ran at
     H:MM." in green, or one red sentence naming the problem with one "Open it" button.
   - The nav shows exactly: **Today · Queue · Campaigns · Review Desk · Reports · More**.
   - The Le-E bubble is in the corner (it is on every page).

**2. Read "Overnight".**
   - Plain sentences: new decisions, drafts ready, replies, posts that went out, reports,
     your brief. No jargon, no counts you cannot trace.
   - Click any sentence → you land on the thing it describes, not a section list. Click
     Back or Today to return.

**3. Read "Needs Roger", press "Work the queue".**
   - Top 3 decisions are inline; the header button "Work the queue (N)" opens the Queue.
   - On the Queue: every card has Approve / Snooze / Dismiss and **Open**.
   - Press **Open** on any card → you land on the actual artifact (the post, the report,
     the record) — not on a list you have to re-search. This includes prospect approvals,
     which live here and gate outreach sends.
   - Approve or snooze one item: the button must press, spin, and resolve — at no point
     does a click do nothing visibly. This is true of EVERY button in the app now; if you
     find one that stays inert, that is a bug.

**4. Open the Review Desk.**
   - One draft at a time, shown finished: rendered image and caption together.
   - The status line is one of exactly three things:
     - **Ready to approve** → press Approve. Done. Next card appears.
     - **Needs a fix: [a plain-English reason]** → press the one Fix button (it
       regenerates the image, or opens the caption editor for copy problems).
     - **Working…** → the system is still rendering/checking; Skip and come back.
   - You should never see "Mark Copy Reviewed", "Confirm Overlay", "Final PNG", or stage
     chips. If you want the old detail, it is under "All items (list view)" below.
   - New drafts arrive already rendered (auto-render runs only after the text checks pass,
     max 12 renders/day — manual Generate clicks are not capped).

**5. Check Campaigns.**
   - Nav → Campaigns. Status reads in sentences. Nothing here changed behavior in this
     overhaul: reactivation stays paused, sends stay gated, Approve is always a human click.

**6. Find an output.**
   - Nav → Reports. Recent exports have **Read** (opens the report text right here) and
     **Download** buttons — not a dead file path.
   - The two auto-generated report families (Code health, Engagement & growth) render at
     the bottom with their latest run, or say honestly that no run has landed yet.
   - Count your clicks from Today: every report/post/document should be reachable in two.

**7. Find something obscure.**
   - Nav → More. Type in the filter box (try "SOC 2", "prospects", "alerts"). Everything
     that left the top nav is here, grouped. Old bookmarks still work.

## Sign-off

| Step | Pass? | Notes |
|---|---|---|
| 1. Landing + truth line + six-item nav | | |
| 2. Overnight sentences land on the thing | | |
| 3. Queue Open lands on the artifact; buttons always react | | |
| 4. Review Desk: three states, approve/fix only | | |
| 5. Campaigns readable; safety unchanged | | |
| 6. Reports readable + downloadable in two clicks | | |
| 7. More finds everything | | |

If all seven pass without you asking what a button does, the overhaul met its test.
