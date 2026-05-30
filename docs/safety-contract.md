# Safety Contract

- `liveGatesCount` must remain `0`.
- Owner-token auth must remain enabled in hosted mode.
- Role checks must remain enabled.
- External actions remain off.
- No secrets may be sent to the browser.
- Production app data must not rely on a filesystem database, local JSON file, browser localStorage, or in-memory object as the source of truth.
- Social is manual-only.
- "Publish manually" never calls a provider API.
- "Mark published manually" records internal status only.
- Partner Journey code and APIs remain untouched.
- Emails, live posts, calendar writes, page publishing, dashboard activation, and destructive restore remain disabled unless a future gated build explicitly changes that.
