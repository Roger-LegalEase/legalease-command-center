# CCX-407 Campaign Review and launch contract

Review recomputes Goal, Audience, Message, Schedule, suppression, compliance, connection, and exact counts from current authorized server truth. It states who receives what and when. The displayed included count equals the immutable recipient reference list and fingerprint supplied to the existing execution adapter.

The primary policy action is Request approval or Launch campaign. Approval remains non-executable. Launch requires a fresh matching audience fingerprint, a durable idempotency claim, and server-side rechecks for suppression, sending windows, approval, connection, environment gates, and all existing safety thresholds. The browser cannot provide recipients or override any preflight. Outcomes distinguish zero, some, or all messages sent so retries remain deliberate and duplicate-safe.
