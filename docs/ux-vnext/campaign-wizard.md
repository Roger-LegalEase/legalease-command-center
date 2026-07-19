# CCX-402 Campaign wizard shell

The shared Campaign wizard uses the existing canonical Campaign identity and five steps: Goal, Audience, Message, Schedule, and Review. It restores the authoritative nested `campaignWizardDraft` stored on the canonical Campaign record, uses an expected version for conflict detection, and emits a scoped persistence plan for one `campaigns` record.

Opening, reloading, moving Back or Next, and using browser Back or Forward do not send, schedule, approve, or launch anything. Save draft is explicit. The browser registers a dirty-exit confirmation only when the candidate differs from the authoritative saved draft. Integration must provide the scoped write and audit adapters described in the manifest; no generic patch or full-state write is allowed.
