# CCX-408 Campaign detail

Campaign detail opens one exact CCX-400 stable identity and keeps canonical, partner-outreach, and reactivation records distinct. Tabs are Overview, Messages, Audience, Replies, Results, and Activity. Overview prioritizes current status, next action, progress, schedule, audience, and outcome; raw engine and webhook details remain outside normal mode.

Canonical links remain `#outreach/campaign/<encoded-source-id>`. Adapted sources use `#outreach/campaign/<encoded-stable-identity>` so equal source IDs cannot collapse. Pause and resume appear only when a current server policy explicitly allows the action. Resume approval never executes. Every action requires a durable idempotency claim and the existing domain engine. Scheduled is not sent, approved is not executed, paused is not completed, and authorized activity remains source-filtered.
