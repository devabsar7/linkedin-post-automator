# LinkedIn Post Automator

Public portfolio showcase of a **single-user LinkedIn Content OS**: Vite/React/TypeScript dashboard + Supabase (Auth, Postgres, RLS, Vault, Edge Functions, Cron).

Weekly pipeline concept: **RSS → LLM → quality gates → schedule → LinkedIn** (official OAuth + Posts API only).

> This repository is a **sanitized, portfolio-safe** architecture + code sample. It does **not** ship live credentials, production project refs, or personal secrets. Clone and configure your own keys — see [SETUP.md](SETUP.md) and [SECURITY.md](SECURITY.md).

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vite, React 19, TypeScript, Tailwind |
| Backend | Supabase Edge Functions (Deno) |
| Data | Postgres + RLS; Vault for cron secrets |
| LLM | Gemini (primary) with optional Groq fallback |
| Publish | LinkedIn OAuth (PKCE) + `/rest/posts` |
| Hosting (typical) | Cloudflare Pages (static) + hosted Supabase |

## What this is not

- No Docker / VPS / local Supabase requirement for the demo architecture
- No LinkedIn scraping, cookies, or password automation
- No historical social analytics scopes (`r_member_social` not used)

## Quick start (local UI only)

```bash
npm install
cp .env.example .env.local
# Set only:
#   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
#   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
npm run dev
```

Hosted Edge secrets are set in the Supabase dashboard / CLI — a local `.env` does **not** configure them by itself. Full walkthrough: [SETUP.md](SETUP.md).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production static build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (mocked; no live APIs) |
| `npm run scan:secrets` | Fail if secret-like patterns appear in frontend/shared/dist |

## Docs

- [SETUP.md](SETUP.md) — one-time platform setup (placeholders only)
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design
- [SECURITY.md](SECURITY.md) — what must stay private; scopes; RLS
- [OPERATIONS.md](OPERATIONS.md) — reauth, free-tier, recovery notes

## Default publishing mode

`PUBLISHING_MODE=review` (safe default). After validating drafts in the UI, switch Settings to `auto` so quality gates can schedule without per-post clicks.

## License / intent

Provided as an architecture reference for hiring managers and peers. You are responsible for LinkedIn, Google/Groq, and Supabase ToS compliance when deploying your own instance.
