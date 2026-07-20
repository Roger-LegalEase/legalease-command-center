# CCX-310 Integration manifest

CCX-310 adds test and documentation files only. It requires no server import, endpoint, route, alias, page renderer, browser controller, stylesheet, feature flag, database migration, stored collection, provider configuration, or production environment change.

## Package registration

Integration may add this focused script to `package.json`:

```json
"test:vnext-social-acceptance": "node scripts/test-vnext-social-acceptance.mjs"
```

The package registration is additive. Lane A did not modify `package.json`.

## Browser registration

Include `tests/browser/social-acceptance.spec.mjs` in the Integration-owned browser runner. The spec is self-contained, uses `page.setContent`, starts no server, contacts no network, reads no credentials, and injects its only publication adapter inside the test. No shared browser fixture or startup change is required.

## Expected budget

- Aggregator: under 10 seconds on the repository's supported Node runtime.
- Focused browser spec: one Chromium test, under 30 seconds.
- External requests: zero.
- Production provider calls: zero.
- Production state reads or writes: zero.

## Rollback

Remove the package/browser registrations and delete the six additive CCX-310 files. No data, audit record, publication claim, credential, route, or runtime behavior requires rollback.
