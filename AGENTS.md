# Command Center contributor guide

## Setup and verification

- Install exactly from the lockfile: `npm ci`.
- Syntax gate: `npm run check`.
- Canonical tests: `npm test`.
- Extended tests: `npm run test:extended`.
- Security scans: `npm run secret:scan` and `npm run pii:scan`.
- Migration/restore checks: `npm run migrations:validate` and `npm run restore:drill`.
- Optional pre-push enforcement: `git config core.hooksPath .githooks`.
- Full local gate: `npm run check && npm test && npm run test:extended && npm run test:security-hardening`.

Tests must set `SKIP_ENV_LOCAL_FILE=1`, use temporary data paths and ephemeral ports, and
mock every external provider. Never let tests inherit developer or production credentials.

## Production safety invariants

- Every outbound email, campaign, social-publishing, page-publishing, and other live-action
  gate remains off unless a separately reviewed production change explicitly authorizes it.
- Hosted production must fail closed when durable storage, authentication, encryption,
  webhook verification, or other required security configuration is absent.
- Never call provider mutation APIs, alter production consoles, or use production data in tests.
- Database changes require a migration plus rollback or forward-recovery instructions.

## Secrets and personal data

- Never print, commit, snapshot, or paste `.env.local`, tokens, OAuth credentials, recipient
  addresses, suppression data, provider activity exports, or other personal data.
- Use `example.com`, synthetic identifiers, and mocked provider payloads in fixtures.
- Raw operational evidence belongs in an ignored local quarantine or restricted external store,
  never in Git.

## Definition of done

A change is done only when the relevant behavioral tests pass, the full verification gate is
green, `git diff --check` is clean, documentation matches behavior, the diff contains no PII or
secrets, and no unrelated user files were modified.
