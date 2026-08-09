// Synthetic RCAP prospect fixtures (Wave 1).
//
// Every organization, person, address, and number here is invented. Addresses use example.org
// / example.com per AGENTS.md, and nothing in this file corresponds to a real organization,
// a real clinic, or a real person. The real workbook was not available to this session
// (RCAP_WORKBOOK_PATH empty), so these fixtures encode the A-R schema and the hard cases the
// import has to survive.
//
// No participant record-clearing data appears here and none may be added: this is institutional
// relationship data only.

// Workbook rows keyed by their real column headers, so the header-matching path is exercised
// rather than bypassed.
export const RCAP_WORKBOOK_FIXTURE_ROWS = Object.freeze([
  // A clean, complete row for an organization nothing is known about yet.
  Object.freeze({
    __rowNumber: 2,
    "Tier": "A1", "State": "MI", "Region / Metro": "Detroit",
    "Organization": "Synthetic Riverside Justice Center",
    "Program / Clinic": "Riverside Record Clearing Clinic",
    "Clinic Verification": "Verified; the center operates the clinic and staffs it with its own attorneys",
    "Cadence / Most Recent": "Quarterly; most recent 2026-06-14",
    "Key Contact": "Dana Whitfield", "Contact Role": "Director of Legal Programs",
    "Public Email": "dana.whitfield@riverside-justice.example.org", "Phone": "(313) 555-0142",
    "Why It Matters": "Runs a recurring clinic with volunteer attorneys and tracks outcomes by hand.",
    "Recommended Partnership Angle": "Assisted-use pathway alongside their existing attorneys.",
    "Website": "https://www.riverside-justice.example.org/programs",
    "Evidence Source": "Program page", "Confidence": "High", "Last Verified": "2026-07-02",
    "NOTES": "https://docs.google.com/document/d/synthetic-riverside-profile/edit"
  }),
  // Shared organizational inbox: usable, but not a named person.
  Object.freeze({
    __rowNumber: 3,
    "Tier": "A2", "State": "OH", "Region / Metro": "Columbus",
    "Organization": "Synthetic Buckeye Reentry Alliance",
    "Program / Clinic": "Second Chance Expungement Day",
    "Clinic Verification": "The alliance promotes the event; a partner legal aid provides the attorneys",
    "Cadence / Most Recent": "Annual; most recent 2026-05-03",
    "Key Contact": "", "Contact Role": "",
    "Public Email": "info@buckeye-reentry.example.org", "Phone": "614-555-0175",
    "Why It Matters": "Coordinates a large annual event with several legal partners.",
    "Recommended Partnership Angle": "Volume screening ahead of the event.",
    "Website": "buckeye-reentry.example.org",
    "Evidence Source": "Event page", "Confidence": "Medium", "Last Verified": "2026-06-20",
    "NOTES": ""
  }),
  // Client-intake address AND an intake phone line: neither is a sales route.
  Object.freeze({
    __rowNumber: 4,
    "Tier": "A2", "State": "MN", "Region / Metro": "Southern Minnesota",
    "Organization": "Synthetic Prairie Legal Services",
    "Program / Clinic": "Record Sealing Help Desk",
    "Clinic Verification": "Operates its own help desk",
    "Cadence / Most Recent": "Monthly; most recent 2026-07-01",
    "Key Contact": "", "Contact Role": "",
    "Public Email": "intake@prairie-legal.example.org", "Phone": "507-555-0110",
    "Why It Matters": "Handles sealing petitions in-house for a wide rural service area.",
    "Recommended Partnership Angle": "Reduce manual eligibility screening.",
    "Website": "https://prairie-legal.example.org",
    "Evidence Source": "Services page", "Confidence": "High", "Last Verified": "2026-06-28",
    "NOTES": "Intake line only; hotline staffed for applicants"
  }),
  // Same organization NAME as row 6 but a different state. These must not merge.
  Object.freeze({
    __rowNumber: 5,
    "Tier": "B1", "State": "TX", "Region / Metro": "Houston",
    "Organization": "Community Justice Project",
    "Program / Clinic": "Clean Slate Saturdays",
    "Clinic Verification": "Hosts the clinic at its community center; legal work by a partner firm",
    "Cadence / Most Recent": "Monthly",
    "Key Contact": "Marcus Reed", "Contact Role": "Program Manager",
    "Public Email": "marcus.reed@cjp-houston.example.org", "Phone": "",
    "Why It Matters": "Hosts a monthly clinic with a partner firm doing the legal work.",
    "Recommended Partnership Angle": "Support the host, not the legal provider.",
    "Website": "https://cjp-houston.example.org",
    "Evidence Source": "Clinic page", "Confidence": "Medium", "Last Verified": "2026-05-19",
    "NOTES": ""
  }),
  // Same NAME as row 5, different state and domain. A name-only collision.
  Object.freeze({
    __rowNumber: 6,
    "Tier": "B1", "State": "CA", "Region / Metro": "Oakland",
    "Organization": "Community Justice Project",
    "Program / Clinic": "Records Clinic",
    "Clinic Verification": "Operates the clinic",
    "Cadence / Most Recent": "Quarterly",
    "Key Contact": "Priya Raman", "Contact Role": "Staff Attorney",
    "Public Email": "praman@cjp-oakland.example.org", "Phone": "",
    "Why It Matters": "Small operation running its own quarterly clinic.",
    "Recommended Partnership Angle": "Assisted-use for a small legal team.",
    "Website": "https://cjp-oakland.example.org",
    "Evidence Source": "About page", "Confidence": "Medium", "Last Verified": "2026-04-30",
    "NOTES": ""
  }),
  // A named person with NO address. No address may be constructed for them.
  Object.freeze({
    __rowNumber: 7,
    "Tier": "B2", "State": "GA", "Region / Metro": "Atlanta",
    "Organization": "Synthetic Peachtree Workforce Collective",
    "Program / Clinic": "Fair Chance Hiring Program",
    "Clinic Verification": "Refers participants to a legal aid partner; does no legal work itself",
    "Cadence / Most Recent": "Ongoing",
    "Key Contact": "Alicia Barnes", "Contact Role": "Executive Director",
    "Public Email": "", "Phone": "404-555-0188",
    "Why It Matters": "Refers job seekers who need records cleared before placement.",
    "Recommended Partnership Angle": "Referral pathway for placement candidates.",
    "Website": "https://peachtree-workforce.example.org",
    "Evidence Source": "Staff page", "Confidence": "Low", "Last Verified": "2026-03-11",
    "NOTES": ""
  }),
  // A malformed address and a malformed number.
  Object.freeze({
    __rowNumber: 8,
    "Tier": "C1", "State": "IL", "Region / Metro": "Chicago",
    "Organization": "Synthetic Lakeshore Community Trust",
    "Program / Clinic": "",
    "Clinic Verification": "",
    "Cadence / Most Recent": "",
    "Key Contact": "Sam Ortiz", "Contact Role": "Coordinator",
    "Public Email": "sam ortiz (at) lakeshore", "Phone": "call the office",
    "Why It Matters": "Community trust exploring reentry support.",
    "Recommended Partnership Angle": "Early exploratory conversation.",
    "Website": "https://lakeshore-trust.example.org",
    "Evidence Source": "", "Confidence": "Low", "Last Verified": "",
    "NOTES": ""
  }),
  // No organization name at all: the minimum identity is missing.
  Object.freeze({
    __rowNumber: 9,
    "Tier": "C2", "State": "NV", "Region / Metro": "Las Vegas",
    "Organization": "   ",
    "Program / Clinic": "Unnamed clinic",
    "Public Email": "someone@unknown.example.org",
    "Why It Matters": "Row captured without an organization.",
    "Website": "", "Evidence Source": "", "Confidence": "", "Last Verified": "", "NOTES": ""
  }),
  // An exact duplicate of row 2 by domain, arriving later in the same file.
  Object.freeze({
    __rowNumber: 10,
    "Tier": "A1", "State": "MI", "Region / Metro": "Detroit",
    "Organization": "Riverside Justice Center (Synthetic)",
    "Program / Clinic": "",
    "Key Contact": "", "Contact Role": "",
    "Public Email": "", "Phone": "",
    "Why It Matters": "Duplicate capture of the same organization.",
    "Website": "https://riverside-justice.example.org",
    "Evidence Source": "", "Confidence": "", "Last Verified": "", "NOTES": ""
  })
]);

// Existing canonical state the import resolves against. Deliberately small and explicit.
export function rcapImportFixtureState() {
  return {
    rcapRevenueAccounts: [
      {
        account_id: "rcap-account-existing-lakefront",
        source_prospect_id: "PROSPECT-4411",
        organization_name: "Synthetic Lakefront Legal Aid",
        website: "https://lakefront-legal.example.org",
        service_area: "WI",
        aliases: ["Lakefront Legal"]
      }
    ],
    companyOrganizations: [
      {
        companyOrganizationId: "co-existing-houston",
        name: "Community Justice Project",
        domain: "cjp-houston.example.org",
        geography: "TX"
      },
      {
        companyOrganizationId: "co-existing-oakland",
        name: "Community Justice Project",
        domain: "cjp-oakland.example.org",
        geography: "CA"
      }
    ],
    companyContacts: [
      {
        companyContactId: "cc-existing-marcus",
        name: "Marcus Reed",
        email: "marcus.reed@cjp-houston.example.org",
        companyOrganizationId: "co-existing-houston"
      }
    ],
    outreachOrganizations: [],
    outreachContacts: [],
    rcapRevenueContacts: [],
    clinicNamedContacts: [],
    partners: []
  };
}

// A row that re-imports an account already known by its stable source ID and changes nothing.
export const RCAP_UNCHANGED_REIMPORT_ROW = Object.freeze({
  __rowNumber: 2,
  "Organization": "Synthetic Lakefront Legal Aid",
  "State": "WI",
  "Website": "https://lakefront-legal.example.org",
  "Public Email": "",
  "Program / Clinic": "",
  "NOTES": ""
});
