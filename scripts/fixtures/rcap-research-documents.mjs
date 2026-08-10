// Synthetic research documents for the RCAP profile engine.
//
// These stand in for the linked Google Docs until blocker B2 clears. Everything here is
// invented: the organizations are `.test` names that cannot resolve, the people do not exist,
// and no line is copied from a real research document. Rule 25 applies as firmly to a fixture as
// to production data, so nothing below is participant information -- every fact is about an
// organization's public programme.
//
// Five documents, because the packet's pilot is a five-document extraction. Each exercises a
// different shape the engine has to survive:
//
//   1. riverside  — the well-formed case: numbered headings, explicit markers, a corroborated
//                   verified fact, a resolvable open question, a parseable CRM correction.
//   2. buckeye    — headings by label rather than number, no markers at all, so everything
//                   defaults to supported inference.
//   3. prairie    — a clean disqualification: a good research outcome with no outreach sections.
//   4. lakeshore  — the failing case: a name-swap-generic initial email, a follow-up that only
//                   follows up, and a generic attachment. Every blocking gate should fire.
//   5. northgate  — partial coverage plus an unrecognised heading, to prove that unassigned
//                   content is reported rather than filed under the nearest section.

export const RCAP_FIXTURE_DOCUMENTS = Object.freeze([
  Object.freeze({
    key: "riverside",
    accountId: "acct-riverside",
    organizationName: "Synthetic Riverside Justice Center",
    docId: "synthetic-riverside-profile",
    title: "Riverside research profile",
    revisionId: "rev-riverside-1",
    text: `Prepared for the RCAP partnership review.

1. Strategic Verdict
Verified: Synthetic Riverside Justice Center runs monthly record clearing clinics across three counties. Source: https://riverside-justice.test/clinics
Inferred: Clinic volume is limited by attorney review time rather than by participant demand.

2. CRM Corrections
Website: https://old.riverside-justice.test -> https://riverside-justice.test
Region: Unknown -> Riverside metro

3. Best Contact Strategy
Recommendation: Approach the clinic coordinator before the executive director; the coordinator owns scheduling.
Question: Who currently coordinates the monthly clinics? Why it matters: the first message has to reach the person who schedules events. How to resolve: check the clinic page and the most recent event flyer.

4. Strongest Sales Angle
Inferred: Attorney review time is the constraint, so assisted use is a stronger opening than volume.

5. Best Subject Line
Recommendation: Monthly clinics, less attorney review time

6. Send-Ready Initial Email
Hello,

I saw that your monthly record clearing clinics run across three counties, and that attorney review time is what caps how many people each clinic can serve. RCAP's assisted-use path handles the review-heavy paperwork so your attorneys spend their clinic hours on the cases that need judgement.

Would a short call in the next two weeks be useful?

7. Why the Message Works
Inferred: It names the specific constraint the organization has published rather than describing record clearing in general.

8. What to Send
Recommendation: Nothing on the first message. No attachment until they ask what assisted use involves.

9. First Follow-Up Email
Following up with one specific thing: assisted use cut attorney review time per case at a clinic of similar size, which is the constraint your three-county schedule runs into.

11. Likely Objections
Inferred: They may already have a volunteer attorney pipeline and see assisted use as redundant.

12. Discovery-Call Objective
Recommendation: Establish how many cases each monthly clinic turns away and why.

13. Recommended Pilot or Initial Offer
Hypothesis: A single-county pilot at one monthly clinic would show the review-time difference without changing their schedule.

15. Outreach Sequence
Recommendation: One initial email, one follow-up after eight working days, then stop.
`
  }),

  Object.freeze({
    key: "buckeye",
    accountId: "acct-buckeye",
    organizationName: "Synthetic Buckeye Reentry Alliance",
    docId: "synthetic-buckeye-profile",
    title: "Buckeye research notes",
    revisionId: "rev-buckeye-1",
    text: `Strategic Verdict
Buckeye Reentry Alliance coordinates reentry services and refers people to legal aid partners for record clearing.

Best Contact Strategy
The published address is a general programme inbox. There is no named individual on the site.

Strongest Sales Angle
They refer record clearing out, so the value is in what happens after the referral rather than in running clinics.
`
  }),

  Object.freeze({
    key: "prairie",
    accountId: "acct-prairie",
    organizationName: "Synthetic Prairie Legal Services",
    docId: "synthetic-prairie-profile",
    title: "Prairie research profile",
    revisionId: "rev-prairie-1",
    disqualified: true,
    disqualificationReason: "Serves a different population and does not handle record clearing.",
    text: `1. Strategic Verdict
Verified: Synthetic Prairie Legal Services handles housing and benefits matters only, and refers record clearing to other organizations. Source: https://prairie-legal.test/practice-areas
Note: This is a clean disqualification rather than a gap in the research.

3. Best Contact Strategy
Note: The only published address is a client-intake route, which is not a partnership route.
`
  }),

  Object.freeze({
    key: "lakeshore",
    accountId: "acct-lakeshore",
    organizationName: "Synthetic Lakeshore Community Law",
    docId: "synthetic-lakeshore-profile",
    title: "Lakeshore draft profile",
    revisionId: "rev-lakeshore-1",
    text: `1. Strategic Verdict
Inferred: Synthetic Lakeshore Community Law is a mid-sized community legal organization.

3. Best Contact Strategy
Recommendation: The director's address is likely j.tan@lakeshore-law.test based on the usual pattern.

6. Send-Ready Initial Email
Hello,

I am reaching out because record clearing changes lives, and we would love to explore a partnership with Synthetic Lakeshore Community Law. Our platform helps organizations like yours serve more people.

Do you have time for a quick call?

8. What to Send
Recommendation: Attach the standard deck.

9. First Follow-Up Email
Just following up on my last note. Any thoughts?
`
  }),

  Object.freeze({
    key: "northgate",
    accountId: "acct-northgate",
    organizationName: "Synthetic Northgate Defender Office",
    docId: "synthetic-northgate-profile",
    title: "Northgate partial notes",
    revisionId: "rev-northgate-1",
    text: `Some general context that was typed before any heading.

Budget And Staffing Notes
This heading is not one of the fifteen sections and its content must not be filed under a neighbour.

1. Strategic Verdict
Inferred: Northgate Defender Office runs expungement days twice a year alongside its defender caseload.
`
  })
]);

export function rcapFixtureDocument(key = "") {
  return RCAP_FIXTURE_DOCUMENTS.find((document) => document.key === key) || null;
}

// A reader in the shape the Drive adapter expects, backed by the fixtures. Used by tests and by
// the fixture server; it is not a Google client and reaches no network.
export function rcapFixtureDocumentReader(documents = RCAP_FIXTURE_DOCUMENTS) {
  const byId = new Map(documents.map((document) => [document.docId, document]));
  return async (docId) => {
    const document = byId.get(docId);
    if (!document) return null;
    return { title: document.title, revisionId: document.revisionId, text: document.text };
  };
}
