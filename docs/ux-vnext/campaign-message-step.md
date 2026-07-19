# CCX-405 Campaign message step

Message supports a verified sender identity, subject, preview text, body, one-time messages, and follow-up sequences with bounded delays. Existing sequence-step IDs are preserved; new unsaved steps receive deterministic server IDs before persistence. The browser never receives credentials or raw provider payloads.

Only supported personalization tokens are accepted. Unsupported or missing tokens block completion. Safe previews use synthetic placeholders. Test send requires one explicit server-authorized test recipient, has a hard maximum of one, requires an idempotency key in integration, and cannot expand to the Campaign audience. Le-E receives bounded draft copy only after an explicit request and never auto-applies or sends output.
