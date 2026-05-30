# AI Change Rules

Before editing:

- Read `docs/product-contract.md`.
- Read `docs/safety-contract.md`.
- Preserve Today / Work / Social / Proof / Search.
- Do not remove Social.

While editing:

- Prefer small focused changes.
- Do not rewrite unrelated systems.
- Do not rename routes casually.
- Do not add technical UI language to normal founder pages.
- Do not enable external actions.
- Do not touch Partner Journey code.
- Do not bypass tests.
- Do not patch only tests when app behavior is broken.

Before finishing:

- Run the relevant product-shape tests.
- Run hardening tests when storage, secrets, health, privacy, rendering, or environment behavior changes.
- Confirm `liveGatesCount` remains `0`.
