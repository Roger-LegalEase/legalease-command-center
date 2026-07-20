# vNext production-like verification

CCX-803 uses synthetic credentials, temporary JSON state, ephemeral ports, and inert provider
adapters. It never reads `.env.local` and requires no production credential. The fixture enables
flags explicitly for coverage while separately proving that the global and four product flags
default off and cannot bypass the global flag.

The verifier covers authenticated shell rendering, compact API budgets, anonymous rejection,
secret sentinel exclusion, publishing and sending off, private-asset fail-closed behavior,
hosted durable-storage startup rejection, preserved route aliases, exact object links, nonblank
critical browser workflows, and rollback to the flag-off legacy shell.

Rollback checkpoint: `c6089bb571aa2a3e9b31a1c8aed8706e10e05586` on
`release/ux-vnext-v1.1-2026-07-19`. First set product flags false, then the global vNext flag false;
keep every live-action gate false. Code rollback is the last step and must preserve migrations,
claims, audit records, and any ambiguous provider evidence.

Run `npm run verify:vnext-production` and
`npm run test:browser -- production-verification.spec.mjs`.
