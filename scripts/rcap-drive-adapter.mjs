// RCAP Prospect CRM — Wave 2, Packet 6: the Google Drive/Docs read adapter.
//
// This module knows how to turn a Google Doc link into a source record. What it deliberately
// does NOT do is acquire the authority to read one.
//
// Wave 0 recorded blocker B2: the application's OAuth grant is Gmail-read plus Calendar-read.
// `drive.readonly` and `documents.readonly` are not in it, and adding them is an OAuth consent
// change plus a security review -- owner work, gated behind
// SECRETS_OR_PROVIDER_CONFIG_CHANGES_AUTHORIZED. So this adapter checks the grant first and,
// when the scopes are absent, records every document as `not_authorized` with the reason
// attached and never calls the reader at all.
//
// That behaviour is the point of the packet, not a limitation of it. The failure mode worth
// preventing is a profile surface that shows an organization with no research because a scope
// was never granted -- indistinguishable, to the reader, from an organization nobody has
// researched. One of those is a to-do for Roger and the other is a to-do for the founder, and
// they must never render the same way.
//
// The reader is injected. This module performs no network call of its own, holds no credential,
// and reads no secret: a caller that has a legitimately authorized client passes it in, and a
// caller that does not gets honest `not_authorized` sources back.

import { buildRcapSource } from "./rcap-profile-contracts.mjs";

const clean = (value = "") => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);

// ---------------------------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------------------------

// Read-only, and only these two. Drive metadata plus document content is the whole requirement;
// nothing here needs write, and asking for more scope than the job needs is how a consent screen
// becomes unreviewable.
export const RCAP_DRIVE_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly"
]);

export const RCAP_DRIVE_BLOCKER_KEY = "drive_scope_missing";

// The sentence a human reads when the scope is absent. It names the blocker, who owns it, and
// what is still possible -- the same anatomy the Overview's blocked state uses, because a
// blocker that does not say what to do about it is just a shrug.
export const RCAP_DRIVE_BLOCKER = Object.freeze({
  key: RCAP_DRIVE_BLOCKER_KEY,
  whatIsBlocked: "Reading the linked research documents",
  whyBlocked: "The application's Google grant covers Gmail and Calendar. Drive and Docs read access has not been granted.",
  whatCanContinue: "Every document link is recorded, and profile sections built from other sources still run.",
  owner: "Roger, with security review",
  requiredDecision: "Approve the drive.readonly and documents.readonly scopes and re-consent."
});

// ---------------------------------------------------------------------------------------------
// Grant state
// ---------------------------------------------------------------------------------------------

// Truthful about three different situations that a boolean would flatten into one:
//   - the scopes were granted            -> reading is possible
//   - the scopes were never granted      -> blocked on B2, a person must act
//   - OAuth itself is not configured     -> blocked earlier, a different person acts
export function rcapDriveGrantState({ account = {}, env = {} } = {}) {
  const granted = list(account.scopes).map(clean).filter(Boolean);
  const missingScopes = RCAP_DRIVE_SCOPES.filter((scope) => !granted.includes(scope));
  const oauthConfigured = Boolean(clean(env.GOOGLE_CLIENT_ID) && clean(env.GOOGLE_CLIENT_SECRET));

  if (!oauthConfigured) {
    return Object.freeze({
      state: "not_configured",
      canRead: false,
      missingScopes: Object.freeze(RCAP_DRIVE_SCOPES.slice()),
      reason: "Google Workspace OAuth is not configured in this environment, so no document can be read."
    });
  }

  if (missingScopes.length) {
    return Object.freeze({
      state: "not_authorized",
      canRead: false,
      missingScopes: Object.freeze(missingScopes),
      reason: RCAP_DRIVE_BLOCKER.whyBlocked
    });
  }

  return Object.freeze({ state: "granted", canRead: true, missingScopes: Object.freeze([]), reason: "" });
}

// ---------------------------------------------------------------------------------------------
// Document references
// ---------------------------------------------------------------------------------------------

// Recognises the shapes a research link actually arrives in -- the workbook's column R carries
// pasted browser URLs, which vary. Anything unrecognised is returned as unparsed rather than
// guessed at: a wrong document id would attach one organization's research to another, which is
// exactly the cross-account failure rule 9 exists to prevent.
const DOC_PATTERNS = [
  /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{8,})/,
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{8,})/,
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{8,})/,
  /docs\.google\.com\/open\?id=([a-zA-Z0-9_-]{8,})/
];

export function parseGoogleDocRef(value = "") {
  const raw = clean(value);
  if (!raw) return Object.freeze({ ok: false, docId: "", url: "", reason: "empty" });
  for (const pattern of DOC_PATTERNS) {
    const match = pattern.exec(raw);
    if (match) return Object.freeze({ ok: true, docId: match[1], url: raw, reason: "" });
  }
  // A bare id is accepted only when it looks like one and nothing else is present, so a stray
  // sentence in a notes column does not become a document reference.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return Object.freeze({ ok: true, docId: raw, url: "", reason: "" });
  return Object.freeze({ ok: false, docId: "", url: raw, reason: "unrecognized_reference" });
}

export function rcapDocumentUrl(docId = "") {
  const id = clean(docId);
  return id ? `https://docs.google.com/document/d/${id}` : "";
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

// Turns document references into source records. Returns records for EVERY reference, including
// the ones that could not be read -- a document that is missing from the result set is a
// document the reader cannot explain.
//
// `reader` is an async (docId) => { title, revisionId, text } | null. It is only ever called when
// the grant permits it. `now` is required: this module does not read the clock, so the caller's
// timestamp is the one that lands in the record and two runs over the same inputs stay
// comparable.
export async function readRcapDocuments(references = [], options = {}) {
  const accountId = clean(options.accountId);
  const now = clean(options.now);
  const grant = options.grant || rcapDriveGrantState(options);
  const reader = typeof options.reader === "function" ? options.reader : null;

  const sources = [];
  const seen = new Set();

  for (const reference of list(references)) {
    const raw = typeof reference === "string" ? reference : clean(reference?.ref || reference?.url);
    const title = typeof reference === "string" ? "" : clean(reference?.title);
    const parsed = parseGoogleDocRef(raw);

    if (!parsed.ok) {
      sources.push(buildRcapSource({
        accountId,
        kind: "google_doc",
        ref: raw || "(blank)",
        title,
        accessState: "missing",
        unreadableReason: raw
          ? "This link is not a Google Doc reference that can be resolved."
          : "No document link was recorded."
      }));
      continue;
    }

    // The same document linked twice from two workbook rows is one source, not two.
    if (seen.has(parsed.docId)) continue;
    seen.add(parsed.docId);

    const ref = rcapDocumentUrl(parsed.docId);

    if (!grant.canRead) {
      sources.push(buildRcapSource({
        accountId, kind: "google_doc", ref, title,
        accessState: "not_authorized",
        unreadableReason: grant.reason
      }));
      continue;
    }

    if (!reader) {
      sources.push(buildRcapSource({ accountId, kind: "google_doc", ref, title, accessState: "not_fetched" }));
      continue;
    }

    let document = null;
    let failure = "";
    try {
      document = await reader(parsed.docId);
    } catch (error) {
      // The reader's message is recorded, not swallowed and not retried here. Rule 21: an
      // ambiguous provider outcome must not be blindly retried, and the retry decision belongs
      // to the run scheduler that can count attempts, not to the fetch loop.
      failure = clean(error?.message) || "The document could not be read.";
    }

    if (failure) {
      sources.push(buildRcapSource({ accountId, kind: "google_doc", ref, title, accessState: "error", unreadableReason: failure }));
      continue;
    }

    if (!document) {
      sources.push(buildRcapSource({
        accountId, kind: "google_doc", ref, title,
        accessState: "missing",
        unreadableReason: "The document does not exist, or this account cannot see it."
      }));
      continue;
    }

    sources.push(buildRcapSource({
      accountId,
      kind: "google_doc",
      ref,
      title: clean(document.title) || title,
      accessState: "available",
      retrievedAt: now,
      revisionId: clean(document.revisionId),
      contentChecksum: clean(document.contentChecksum),
      addedBy: clean(options.addedBy),
      addedAt: now
    }));
  }

  return Object.freeze({
    grant,
    sources: Object.freeze(sources),
    readCount: sources.filter((source) => source.accessState === "available").length,
    blockedCount: sources.filter((source) => source.accessState === "not_authorized").length,
    // The blocker travels with the result so a caller never has to reconstruct why a profile is
    // thin. Present only when something was actually blocked by it.
    blocker: sources.some((source) => source.accessState === "not_authorized") ? RCAP_DRIVE_BLOCKER : null
  });
}
