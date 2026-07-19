# Outreach end-to-end acceptance (CCX-411)

CCX-411 closes the additive Outreach train with deterministic domain and browser acceptance evidence. The suite uses only synthetic records, in-memory scoped persistence, durable-claim fixtures, and injected existing-engine adapters. It never calls a provider or enables live sending.

## Covered workflow

The domain acceptance test creates one canonical Campaign through Global Create, saves Goal, Audience, Message, and Schedule through the scoped Campaign wizard contracts, rebuilds Review from current state, requests approval without execution, applies approval separately, and launches through a controlled existing-engine adapter. It then verifies pause/resume policy, suppression enforcement, and duplicate-claim protection.

The browser acceptance test renders the production page functions for every wizard step, Campaign detail, Replies, and Advanced delivery. It verifies exact Campaign links, Back/Forward history, loading and failure states, dialog focus, keyboard operation, visible focus, serious/critical accessibility findings, credential-safe output, zero mutation requests, and horizontal overflow at 1440, 1280, 1024, 768, and 390 pixels.

## Safety evidence

- Review execution input equals the current eligible Audience projection.
- The suppressed fixture recipient is excluded and never reaches the controlled engine.
- Test-send planning is capped at one explicit authorized synthetic recipient.
- Approval returns `executed:false`; launch is a distinct call.
- Reusing a launch idempotency key does not call the engine twice.
- The only send-like adapter is an injected controlled fixture; the Campaign remains `liveMode:false`.
- Browser rendering issues no mutations and has no post-boot full-state dependency.

Shared server, shell, navigation, package, and browser-runner wiring remains Integration-lane work described in the manifest.
