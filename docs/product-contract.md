# Command Center product contract

The founder workflow is organized around Today, Queue, Campaigns, Review Desk, Reports, and More. Today summarizes priorities and safety posture; Queue contains work requiring action; Campaigns contains lifecycle, outreach, and reactivation operations; Review Desk controls approval; Reports exposes role-scoped operational or aggregate reporting; More contains administration and diagnostics.

The system can prepare and execute email, outreach, reactivation, and social actions, but execution requires all applicable controls at once: an authorized server session, a dedicated capability, an approved record, an atomic action claim, provider readiness, and the environment-specific live gate. Every live gate defaults off. A UI control never grants authority.

Owner can administer security, roles, integrations, approvals, and publishing. Admin can operate sensitive workflows and private draft assets but does not receive the dedicated social-publish capability by default. Operator receives only explicit internal-screen capabilities and cannot fetch the general state graph. Viewer/investor receives authenticated aggregate reports only and cannot access contacts, queue data, diagnostics, exports, audit payloads, drafts, or the general state endpoint.

Outbound work is claim-before-call. Email send claims and social publish claims are durable. Ambiguous provider success enters reconciliation-required state and is never automatically repeated. OAuth callbacks are signed, session-bound, redirect-bound, expiring, and single-use. Draft assets remain private until an explicit approved publishing flow promotes a final asset.
