# Operations

## Reauthorization

LinkedIn member access tokens typically last ~60 days. Daily `token-health` marks `expiring` / `expired`. On 401/403 publish failures the post becomes `NEEDS_REAUTH`, auto-publish pauses, and Settings shows reconnect.

1. Open Settings → Connect LinkedIn.
2. Confirm health is `connected`.
3. Clear dry-run only when ready; resume mode as desired.

## Free-tier limits

- Supabase Free DB size / egress — retention job prunes verbose payloads after 30–90 days (`retention_days`).
- Heartbeat job writes daily activity so the project does not go inactive.
- LLM free-tier rate limits (Gemini / optional Groq) — Edge client respects `429` + `Retry-After`.
- Cloudflare Pages free static hosting is sufficient (no Functions required).

## Source failures

Broken feeds enter `failed` / `cooldown` with exponential cooldown. Circuit opens after consecutive failures. Fix URL or disable the feed in Sources; use **Test feed**.

## Recovery playbook

| Symptom | Action |
|---------|--------|
| Duplicate weekly posts | Check `content_runs` unique week key; inspect Runs for `skipped_idempotent` |
| Stuck `PUBLISHING` | Inspect `publishing_attempts`; if LinkedIn unknown, mark manually — do not blind retry |
| `UNKNOWN_OUTCOME` | Check LinkedIn feed manually; set post to PUBLISHED or FAILED in SQL only with evidence |
| Empty research | Confirm feeds healthy; evergreen path should still draft |
| Bootstrap blocked | `bootstrap_state.completed = true` — sign in normally; do not re-enable unless intentional |

## Deliberate limitations

- No historical LinkedIn post read
- No LinkedIn analytics / reactions / comments API
- No vector DB / embeddings in v1
- Text-only personal posts
