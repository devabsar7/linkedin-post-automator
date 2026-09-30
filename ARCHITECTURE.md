# Architecture

```text
Cloudflare Pages (static React + Vite + TS + Tailwind)
        │
        ├── Supabase Auth + RLS Postgres
        └── Supabase Edge Functions
              ├── RSS collection / normalization
              ├── LLM content pipeline (Gemini → optional Groq fallback)
              ├── LinkedIn OAuth + token crypto
              ├── LinkedIn publish worker
              └── health / owner actions

Supabase Cron + pg_net + Vault
        ├── Monday weekly-content (03:00 UTC)
        ├── process-due-posts every 5 minutes
        ├── daily token-health
        └── daily retention-heartbeat

LLM APIs  → structured JSON strategy, drafts, validation
LinkedIn  → OAuth + POST /rest/posts (w_member_social)
```

## Weekly pipeline

1. Idempotent per ISO week (`owner_id + iso_week_key`).
2. Fetch allow-listed HTTPS RSS/Atom only (size/timeout/redirect revalidation/no private IPs).
3. Store title, URL, date, source, capped snippet, hash — never full article bodies.
4. LLM call 1: seven opportunities citing `research_item_id`.
5. LLM call 2: seven drafts in one JSON response.
6. LLM call 3: batch validate/fix.
7. Deterministic gates (length, Jaccard/hook fingerprint, evidence map).
8. Status `READY_FOR_REVIEW` (review mode) or `SCHEDULED` (auto mode).
9. Compact `content_memory` fingerprints — no embeddings.

If healthy research is below `min_research_items`, evergreen drafts grounded in the brand profile are marked in the UI.

## Publishing

`claim_due_post` uses `FOR UPDATE SKIP LOCKED`. States include `PUBLISHING`, `PUBLISHED`, `RETRY_WAIT`, `NEEDS_REAUTH`, `FAILED`, `UNKNOWN_OUTCOME`. Transient failures retry with exponential backoff + jitter. Unknown network outcomes never auto-retry (duplicate prevention). Dry-run skips LinkedIn.

## Frontend

Static SPA only. Browser holds Supabase URL + publishable key. Privileged work via Edge Functions with user JWT or cron secret.
