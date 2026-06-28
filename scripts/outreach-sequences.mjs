// B2 — Per-classification outreach SEQUENCES (the approved copy + the fail-safe routing that
// decides which sequence, if any, a prospect's classification maps to).
//
// SAFETY / FAIL-CLOSED ROUTING (§3 of the go-live staging spec):
//   - A classification routes to a sequence ONLY through CLASSIFICATION_SEQUENCE_MAP.
//   - CSI (and anything in DO_NOT_ENROLL_CLASSIFICATIONS) is do-not-enroll — handled manually
//     through Alex, NEVER auto-sent.
//   - A classification with no mapped sequence returns { ok:false, reason:"unmapped_classification" }.
//     There is NO default sequence. Unknown => no send. Ever.
//   - resolveSequenceForClassification() is the single routing chokepoint; the planner and the
//     send executor both call it, so a do-not-enroll / unmapped prospect can be neither queued
//     nor sent.
//
// The copy below is the APPROVED outreach copy and must not be rewritten. [First Name] /
// [Organization] are filled at assembly time; [CALENDAR_LINK] is replaced with a real anchor
// (HTML) or the raw URL (plaintext); [specific reason: ...] in the final touch is a manual fill.

// Google Calendar booking link (rendered as an HTML hyperlink; raw URL in plaintext).
export const CALENDAR_URL =
  "https://calendar.google.com/appointments/schedules/AcZssZ1IiOqdkuV67gyzBJa46Hkv4Ipr0VQLwDra7Gg6AOg5Wyzmxk5AMMk30i0Vfzbob-wTHU9Q5mM5";

// Shared cadence for both sequences — day offsets from enrollment for touches 1..5.
export const OUTREACH_CADENCE_DAYS = [1, 4, 9, 16, 30];

// ---------------------------------------------------------------------------
// Sequence A — verified-reporting (nonprofit / government / funders & intermediaries)
// ---------------------------------------------------------------------------
const VERIFIED_REPORTING_TOUCHES = [
  {
    step_number: 1,
    day: 1,
    subject: "Can your funder see the record-clearing work your team is doing?",
    body: `Hi [First Name],

Your team may already be doing the hard part: screening people, preparing packets, coordinating filings, and following up.

The harder part is turning that work into a report a funder can trust without rebuilding it from spreadsheets.

That is what RCAP is built for. Your record-clearing workflow runs through RCAP, key steps are captured as timestamped events, and the result is a verified impact report showing distinct people served, case progress, filing milestones, and outcomes where they are reported.

Worth 15 minutes to see a sample report and pressure-test whether this would help before your next funder update? You can grab a time here: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 2,
    day: 4,
    subject: "What the report could look like",
    body: `Hi [First Name],

Following up with something more concrete.

The reason RCAP matters is simple: the report at the end is only credible because the work ran through the system first.

The report can show:
- Distinct people served
- Where each case stands
- Filing and status milestones
- Outcomes by jurisdiction
- The timestamped trail behind the numbers

The goal is less manual reporting, stronger proof, and a cleaner story for the people funding the work.

Open to walking through the sample report? Pick a time that works: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 3,
    day: 9,
    subject: "The reporting bar is getting higher",
    body: `Hi [First Name],

One reason I thought of [Organization] is that record-clearing programs are being asked to show more than activity numbers.

The shift is from "we served X people" to "here is what happened, where each case stands, and what proof supports the numbers."

RCAP is built for that second standard. It gives your team a way to run the work through one trackable workflow and come out with a verified impact report at the end.

Would it be useful to look at what a 90-day RCAP launch could look like for [Organization]? You can grab a time here: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 4,
    day: 16,
    subject: "Should I close the loop?",
    body: `Hi [First Name],

I do not want to clutter your inbox.

If proving record-clearing outcomes to funders, boards, or program partners is a priority this year, I would be glad to show you the sample RCAP report. You can book a quick 15 minutes here: [CALENDAR_LINK]

If timing is not right, no problem. Just say so and I can step back.

Either way, I appreciate the work your team is doing.

Roger`
  },
  {
    step_number: 5,
    day: 30,
    trigger_based: true,
    subject: "Before your next funder update",
    body: `Hi [First Name],

Reaching back out because [specific reason: upcoming grant report, new report sample, new partner launch, clinic season, board update, funding cycle, or relevant public announcement].

The strongest use case for RCAP is not "another tool." It is a cleaner way to produce the report most funders already want: who moved through the process, where cases stand, what milestones were reached, and what proof supports the numbers.

If your team has a funder update, board report, or campaign recap coming up, RCAP may be worth pressure-testing now. Here is my calendar if it is easier: [CALENDAR_LINK]

Roger`
  }
];

// ---------------------------------------------------------------------------
// Sequence B — clinic-extension (legal aid / public defender / clinic-running orgs)
// ---------------------------------------------------------------------------
const CLINIC_EXTENSION_TOUCHES = [
  {
    step_number: 1,
    day: 1,
    subject: "What if your record-clearing clinic started before people walked in?",
    body: `Hi [First Name],

Most record-clearing clinics are asked to do too much in one day: intake, screening, document readiness, routing, follow-up, and reporting.

RCAP helps move part of that work before and after the clinic. People can scan a QR code, start intake from home, get routed or prepared before the event, and continue afterward instead of falling off.

Your clinic stops being the only moment someone can get started. It becomes a record-clearing access pathway.

Worth 15 minutes to see how it works? You can reply here or grab a time directly: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 2,
    day: 4,
    subject: "Know who needs what before clinic day",
    body: `Hi [First Name],

Quick follow-up on the operational side.

Before a clinic starts, RCAP can help your team see how many people have started intake, which jurisdictions are showing up, who is missing basic information, and who may need document support, background-record review, or a different route.

That means clinic time can be used for the higher-value work: helping prepared participants move forward, reviewing harder cases, supporting packets, and making the right referrals.

It is capacity, not just software.

Open to a short walkthrough? You can pick a time that works: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 3,
    day: 9,
    subject: "The clinic should not be a cliff",
    body: `Hi [First Name],

One more piece. A lot of people do not finish everything in one sitting.

They leave needing a document, a background report, a filing step, a follow-up, or a clearer next step. Without a system, that follow-up turns into scattered texts, spreadsheets, and missed calls.

With RCAP, the same co-branded path can keep people moving after the clinic, while your team sees where people stand on a dashboard instead of guessing.

Every flyer, QR code, and referral source can become measurable too, so you can see what outreach actually produced intake.

Want me to send over the sample report, or would it be easier to grab 15 minutes here: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 4,
    day: 16,
    subject: "Should I close the loop?",
    body: `Hi [First Name],

I do not want to clutter your inbox.

If extending your record-clearing clinic before and after the event is a priority this year, I would be glad to show you how RCAP works.

The idea is simple: reach people earlier, make clinic day more efficient, keep people moving afterward, and come out with a cleaner impact report for funders, boards, or program partners.

You can book a quick 15 minutes here: [CALENDAR_LINK]

If timing is not right, no problem. Just say so and I can step back.

Either way, real respect for the work your team is doing.

Roger`
  },
  {
    step_number: 5,
    day: 30,
    trigger_based: true,
    subject: "Before your next clinic",
    body: `Hi [First Name],

Reaching back out because [specific reason: upcoming clinic, clinic season, grant cycle, new partner launch, board update, or relevant announcement].

The strongest case for RCAP is not "another tool." It is a way to reach more people before your clinic, run the day with better triage, keep people moving afterward, and produce an impact report backed by the workflow trail.

If you have a clinic, campaign, or funding cycle coming up, it may be worth a look now.

Here is my calendar if it is easier: [CALENDAR_LINK]

Roger`
  }
];

// ---------------------------------------------------------------------------
// Sequence C — government-accountability (government / county reentry programs)
// ---------------------------------------------------------------------------
const GOVERNMENT_ACCOUNTABILITY_TOUCHES = [
  {
    step_number: 1,
    day: 1,
    subject: "Showing what your reentry dollars actually produce",
    body: `Hi [First Name],

Reentry programs are increasingly asked to show more than activity. Commissioners, oversight bodies, and the public want to see what the work produced, where each case stands, and what proof supports the numbers.

RCAP is the infrastructure that makes that possible. Record-clearing work runs through it, key steps are captured as timestamped events, and the result is a defensible report showing distinct people served, case progress, filing milestones, and outcomes where they are reported.

Worth 15 minutes to see how it works for a county program? You can grab a time here: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 2,
    day: 4,
    subject: "Less walk-in chaos, cleaner intake",
    body: `Hi [First Name],

Quick follow-up on the operational side.

A lot of reentry intake happens cold: people arrive with uneven information, staff spend time on basic triage, and some are not ready or are in the wrong jurisdiction. RCAP moves part of that work upstream. People can start intake before they arrive, get routed or prepared, and your staff can see who is coming and what they likely need.

That means public dollars go toward moving people forward, not sorting paperwork.

Open to a short walkthrough? Pick a time that works: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 3,
    day: 9,
    subject: "Defensible numbers, not a spreadsheet",
    body: `Hi [First Name],

One more piece. The reason RCAP reporting holds up is that every figure traces to a timestamped event that cannot be edited after the fact.

For a public program, that matters: you can show distinct people served, where cases stand, outcomes by jurisdiction, and the trail behind every number, without rebuilding it from spreadsheets at reporting time.

Would it be useful to see what a 90-day RCAP launch could look like for your program? You can grab a time here: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 4,
    day: 16,
    subject: "Should I close the loop?",
    body: `Hi [First Name],

I do not want to clutter your inbox.

If documenting demand, tracking outcomes, and showing public accountability for your reentry work is a priority this year, I would be glad to show you how RCAP works. You can book a quick 15 minutes here: [CALENDAR_LINK]

If timing is not right, no problem. Just say so and I can step back.

Either way, I appreciate the work your program is doing.

Roger`
  },
  {
    step_number: 5,
    day: 30,
    trigger_based: true,
    subject: "Before your next reporting cycle",
    body: `Hi [First Name],

Reaching back out because [specific reason: upcoming budget cycle, council or commissioner update, grant report, program review, or relevant announcement].

The strongest case for RCAP is not "another tool." It is a cleaner way to produce the accountability most public programs already need: who moved through the process, where cases stand, what milestones were reached, and what proof supports the numbers.

If you have a reporting cycle or program review coming up, it may be worth a look now. Here is my calendar if it is easier: [CALENDAR_LINK]

Roger`
  }
];

// ---------------------------------------------------------------------------
// Sequence D — employer-pathway (second-chance / fair-chance employers)
// ---------------------------------------------------------------------------
const EMPLOYER_PATHWAY_TOUCHES = [
  {
    step_number: 1,
    day: 1,
    subject: "A record-clearing pathway for your second-chance hires",
    body: `Hi [First Name],

[Organization] already gives people with records a chance most employers will not. There is often a next step that helps them even more: clearing the record itself, which can open up roles, licensing, and advancement that a record currently blocks.

RCAP gives you a way to offer a record-clearing pathway, for your own workforce or alongside the reentry partners you work with, without becoming a legal provider yourself. People start from a co-branded path, get routed and prepared, and you can see what the program produces.

Worth 15 minutes to see how it works? You can reply here or grab a time directly: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 2,
    day: 4,
    subject: "Clearing a record can open the next role",
    body: `Hi [First Name],

Quick follow-up on why this matters operationally.

For a lot of justice-impacted workers, a record limits which roles, certifications, or licenses they can move into, even after they have proven themselves on the job. Helping them clear it is one of the highest-leverage things an employer can offer for retention and advancement.

RCAP gives your people a safe, guided record-clearing path, and gives you visibility into who started, where they are, and what it produced, without your team taking on legal work.

Open to a short walkthrough? You can pick a time that works: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 3,
    day: 9,
    subject: "For your workforce or your reentry partners",
    body: `Hi [First Name],

One more piece. RCAP works two ways for an employer like [Organization].

You can offer the record-clearing pathway directly to your own workforce as a benefit. Or, if you partner with or fund reentry organizations, RCAP can power that program and give everyone a shared view of who moved through the process and what the outcomes were.

Either way, you get a measurable program instead of a one-time gesture, backed by a reporting trail.

Would it be useful to see what a 90-day RCAP launch could look like? You can grab a time here: [CALENDAR_LINK]

Roger`
  },
  {
    step_number: 4,
    day: 16,
    subject: "Should I close the loop?",
    body: `Hi [First Name],

I do not want to clutter your inbox.

If offering a record-clearing pathway, for your workforce or your reentry partners, is something [Organization] wants to explore this year, I would be glad to show you how RCAP works. You can book a quick 15 minutes here: [CALENDAR_LINK]

If timing is not right, no problem. Just say so and I can step back.

Either way, real respect for the work [Organization] is doing in second-chance hiring.

Roger`
  },
  {
    step_number: 5,
    day: 30,
    trigger_based: true,
    subject: "A next step for your second-chance program",
    body: `Hi [First Name],

Reaching back out because [specific reason: hiring cycle, new partnership, workforce initiative, grant cycle, or relevant announcement].

The strongest case for RCAP is not "another tool." It is a way to turn second-chance hiring into a fuller pathway: help people clear the records that block advancement, for your workforce or your reentry partners, and see what the program produces.

If you have a workforce initiative or partnership coming up, it may be worth a look now. Here is my calendar if it is easier: [CALENDAR_LINK]

Roger`
  }
];

// ---------------------------------------------------------------------------
// Sequence registry + routing.
// ---------------------------------------------------------------------------
export const OUTREACH_SEQUENCES = Object.freeze({
  "verified-reporting": Object.freeze({
    id: "verified-reporting",
    cadence: OUTREACH_CADENCE_DAYS,
    touches: VERIFIED_REPORTING_TOUCHES
  }),
  "clinic-extension": Object.freeze({
    id: "clinic-extension",
    cadence: OUTREACH_CADENCE_DAYS,
    touches: CLINIC_EXTENSION_TOUCHES
  }),
  "government-accountability": Object.freeze({
    id: "government-accountability",
    cadence: OUTREACH_CADENCE_DAYS,
    touches: GOVERNMENT_ACCOUNTABILITY_TOUCHES
  }),
  "employer-pathway": Object.freeze({
    id: "employer-pathway",
    cadence: OUTREACH_CADENCE_DAYS,
    touches: EMPLOYER_PATHWAY_TOUCHES
  })
});

export const OUTREACH_SEQUENCE_IDS = Object.freeze(Object.keys(OUTREACH_SEQUENCES));

// Classification -> sequence. The ONLY routing table. No entry => no send (fail-closed).
export const CLASSIFICATION_SEQUENCE_MAP = Object.freeze({
  // verified-reporting — nonprofits and the funders/intermediaries behind them
  nonprofit: "verified-reporting",
  funders_intermediaries: "verified-reporting",
  // government-accountability — public programs (government moved here from verified-reporting)
  government: "government-accountability",
  county_reentry: "government-accountability",
  // clinic-extension — direct legal-service providers running clearing clinics
  legal_aid: "clinic-extension",
  public_defender: "clinic-extension",
  clinic: "clinic-extension",
  // employer-pathway — second-chance / fair-chance employers
  second_chance_employer: "employer-pathway"
});

// Do-not-enroll classifications — recognized, but NEVER auto-enrolled/sent. CSI is handled
// manually through Alex. Recognized here (not via the RCAP-fit vocab) so the reason is the
// honest "do_not_enroll" rather than "unmapped_classification".
export const DO_NOT_ENROLL_CLASSIFICATIONS = new Set(["csi"]);

const lc = (v = "") => String(v ?? "").trim().toLowerCase();

// The routing chokepoint. Returns { ok, sequenceId, reason }.
//   reason "" when ok; "do_not_enroll" for CSI/do-not-enroll; "unmapped_classification" otherwise.
// NEVER falls back to a default sequence.
export function resolveSequenceForClassification(classification = "") {
  const cls = lc(classification);
  if (!cls) return { ok: false, sequenceId: "", reason: "unmapped_classification" };
  if (DO_NOT_ENROLL_CLASSIFICATIONS.has(cls)) return { ok: false, sequenceId: "", reason: "do_not_enroll" };
  const sequenceId = CLASSIFICATION_SEQUENCE_MAP[cls];
  if (!sequenceId) return { ok: false, sequenceId: "", reason: "unmapped_classification" };
  return { ok: true, sequenceId, reason: "" };
}

export function getSequence(sequenceId = "") {
  return OUTREACH_SEQUENCES[lc(sequenceId)] || null;
}

// Touch (1-based step_number) for a sequence; null if out of range / unknown sequence.
export function getSequenceTouch(sequenceId = "", stepNumber = 1) {
  const seq = getSequence(sequenceId);
  if (!seq) return null;
  return seq.touches.find((t) => t.step_number === Number(stepNumber)) || null;
}

// ---------------------------------------------------------------------------
// Rendering: personalization + calendar link (HTML anchor vs plaintext raw URL).
// ---------------------------------------------------------------------------
const CAL_TOKEN = "[CALENDAR_LINK]";
const clean = (v = "") => String(v ?? "").trim();

function fillPersonalization(body = "", { firstName = "", organization = "" } = {}) {
  let out = String(body ?? "");
  if (clean(firstName)) out = out.split("[First Name]").join(clean(firstName));
  if (clean(organization)) out = out.split("[Organization]").join(clean(organization));
  return out;
}

function escapeHtml(s = "") {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Plaintext body: [CALENDAR_LINK] -> raw URL (always present, usable).
export function renderTouchText(body = "", { firstName = "", organization = "", calendarUrl = CALENDAR_URL } = {}) {
  const filled = fillPersonalization(body, { firstName, organization });
  return filled.split(CAL_TOKEN).join(calendarUrl);
}

// HTML body: copy is HTML-escaped, newlines -> <br>, [CALENDAR_LINK] -> a real anchor.
export function renderTouchHtml(body = "", { firstName = "", organization = "", calendarUrl = CALENDAR_URL } = {}) {
  const filled = fillPersonalization(body, { firstName, organization });
  const anchor = `<a href="${escapeHtml(calendarUrl)}">${escapeHtml(calendarUrl)}</a>`;
  const escaped = escapeHtml(filled).split(escapeHtml(CAL_TOKEN)).join(anchor);
  return escaped.replace(/\n/g, "<br>\n");
}
