# Secrets And Environment

Server-only secrets:

- `DATABASE_URL`
- `COMMAND_CENTER_OWNER_TOKEN`
- `OPENAI_API_KEY` if OpenAI is enabled later
- provider client secrets
- service-role keys
- refresh/access tokens

Public variables:

- `PUBLIC_APP_BASE_URL` may be visible because it is only the app URL.

Rules:

- `.env` and `.env.local` must not be committed.
- `.env.example` must contain placeholders only.
- Production secrets come from Render environment variables.
- No OpenAI key may appear in browser HTML, generated client JS, or frontend-visible config.
- No `DATABASE_URL` may appear in browser HTML, generated client JS, or frontend-visible config.
- Server secrets must not use public prefixes such as `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, or `REACT_APP_`.
- Provider tokens and refresh tokens must never be logged.

OpenAI:

- If used, calls must go through server-side owner-protected routes.
- Browser code must never call OpenAI directly with an API key.
- This hardening pass does not add a new OpenAI integration.
