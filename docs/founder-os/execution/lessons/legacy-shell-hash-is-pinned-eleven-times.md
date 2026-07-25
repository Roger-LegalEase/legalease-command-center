# The legacy shell hash is pinned in eleven test files, not one

**Why it mattered:** PR #120 updated two of them and the extended check failed on the other
nine. Every touch of `htmlShell()` in `scripts/preview-server.mjs` repeats this.

The pinned slice is `serverSource.slice(indexOf("function htmlShell()"),
indexOf("\nfunction renderLegacyApp()"))`. These files assert its sha256:

`test-vnext-desktop-shell`, `test-vnext-inbox-actions`, `test-vnext-inbox-page`,
`test-vnext-inbox-projection`, `test-vnext-phase2-acceptance`, `test-vnext-quick-capture`,
`test-vnext-responsive-shell`, `test-vnext-route-compatibility`, `test-vnext-today-page`,
`test-vnext-today-view-model`, `test-vnext-ui-primitives`.

All eleven are **extended-only**, so `npm test` never runs them.

**How to apply:** after any change inside `htmlShell()`, recompute once and rewrite all
eleven together:

```
grep -rl "<old-hash>" scripts/test-*.mjs
```

Two related traps found the hard way:

- Anything placed **above** `function htmlShell()` is outside the slice and does not move
  the hash. That is the cheap place to put explanatory comments.
- `test-operator-consolidation-pass.mjs` matches user-facing phrases **literally against
  the server source**, including text that only existed inside a comment. Paraphrasing a
  comment inside the client script broke it. It needs the exact string
  `suppressed/unsubscribed/bounced/do-not-contact`.
