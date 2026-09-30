# Security

This public repo is intentionally **credential-free**. Treat any real deployment as a separate private configuration surface.

## What must stay private (never commit)

| Item | Why |
|------|-----|
| `.env`, `.env.local`, `*.local.env`, `*.local.sql` | Live keys and vault dumps |
| `GROQ_API_KEY`, `GEMINI_API_KEY` | Paid LLM access / abuse |
| `LINKEDIN_CLIENT_SECRET` | OAuth client abuse |
| `TOKEN_ENCRYPTION_KEY` | Decrypts stored LinkedIn tokens |
| `CRON_INTERNAL_SECRET`, `BOOTSTRAP_SECRET` | Privileged Edge entry |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` | Full DB / management access |
| Production project refs + personal emails in docs | Fingerprinting / phishing surface |

## Secret placement (when you deploy your own instance)

| Secret | Location | Never in |
|--------|----------|----------|
| `VITE_SUPABASE_URL`, publishable key | Cloudflare Pages / `.env.local` | Server secrets live here |
| Gemini / Groq / LinkedIn secret / encryption / cron / bootstrap / service role | Supabase Edge secrets | Pages, Git, frontend bundle, logs, localStorage |
| Cron URL + anon + cron secret | Supabase Vault | Frontend |

## Products & scopes (high level)

- **LinkedIn Developer app** — Authorization Code + PKCE; scopes: `openid`, `profile`, `w_member_social` only
- **Supabase** — Auth (email), Postgres RLS, Edge Functions, Vault, `pg_cron` / `pg_net`
- **Gemini and/or Groq** — server-side only via Edge secrets
- **Cloudflare Pages** — static SPA build vars only (no server secrets)

## OAuth & tokens

- Tokens encrypted at rest (AES-GCM, server-only `TOKEN_ENCRYPTION_KEY`)
- `oauth_connections` has RLS enabled and **no authenticated SELECT** of ciphertext; UI uses `get_oauth_connection_status()`
- 401/403 → `NEEDS_REAUTH`, pause auto-publish, preserve draft

## RLS

Every application table has RLS enabled. Owner policies use `owner_id = auth.uid()`. Anonymous has no data access. The only `USING (true)` policy is read of the singleton `bootstrap_state.completed` flag (no secrets).

## Logging

Structured JSON logs should redact tokens, Authorization headers, ciphertext, and passwords.

## Frontend scan

`npm run scan:secrets` fails if common secret assignments or long JWTs appear under `src/`, `shared/`, or `dist/`. Run it before every commit when you fork this project.
