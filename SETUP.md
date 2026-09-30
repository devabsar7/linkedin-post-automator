# Setup (one-time)

A local `.env` file configures the **Vite frontend only**. It cannot inject secrets into hosted Supabase Edge Functions or Vault. Follow each section.

Do not paste real secrets into chat, Git, or screenshots.

## 1. Create projects

1. Create a free Supabase project.
2. Create a Cloudflare Pages project connected to this Git repository (build below).
3. Create a LinkedIn Developer application.

## 2. LinkedIn Developer Portal

Enable products:

1. **Sign In with LinkedIn using OpenID Connect**
2. **Share on LinkedIn**

Authorized redirect URL:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-oauth-callback
```

Scopes requested by the app (fewest possible):

```text
openid profile w_member_social
```

Do **not** request `r_member_social`.

Copy Client ID and Client Secret for Edge Function secrets.

## 3. Apply database migrations

Install Supabase CLI, login, and link the project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

After push, update Vault secrets in SQL Editor (replace placeholders from migration):

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_project_url'),
  'https://YOUR_PROJECT_REF.supabase.co'
);
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_anon_key'),
  'YOUR_PUBLISHABLE_ANON_KEY'
);
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_internal_secret'),
  'SAME_VALUE_AS_CRON_INTERNAL_SECRET'
);
```

If `vault.update_secret` signature differs on your project, use the Dashboard Vault UI or `vault.create_secret` / documented update helpers for your Supabase version.

Confirm cron jobs exist:

```sql
select jobid, jobname, schedule from cron.job;
```

## 4. Deploy Edge Functions

```bash
npx supabase functions deploy bootstrap-owner
npx supabase functions deploy linkedin-oauth-start
npx supabase functions deploy linkedin-oauth-callback
npx supabase functions deploy linkedin-disconnect
npx supabase functions deploy linkedin-health
npx supabase functions deploy test-feed
npx supabase functions deploy weekly-content
npx supabase functions deploy process-due-posts
npx supabase functions deploy token-health
npx supabase functions deploy retention-heartbeat
npx supabase functions deploy regenerate-post
npx supabase functions deploy approve-post
npx supabase functions deploy manual-publish
npx supabase functions deploy import-history
npx supabase functions deploy health
```

JWT verification: cron-invoked functions authenticate via `X-Cron-Secret`. Owner functions validate the user JWT inside the function. Deploy with gateway settings that still allow the callback and cron paths (see `supabase/config.toml`).

## 5. Set Edge Function secrets

Dashboard â†’ Project Settings â†’ Edge Functions â†’ Secrets, or:

```bash
npx supabase secrets set GEMINI_API_KEY=...
npx supabase secrets set GEMINI_MODEL=gemini-2.5-flash
# Optional Groq fallback (if Gemini key missing):
# npx supabase secrets set GROQ_API_KEY=...
# npx supabase secrets set GROQ_MODEL=openai/gpt-oss-20b
npx supabase secrets set LINKEDIN_CLIENT_ID=...
npx supabase secrets set LINKEDIN_CLIENT_SECRET=...
npx supabase secrets set LINKEDIN_REDIRECT_URI=https://YOUR_PROJECT_REF.supabase.co/functions/v1/linkedin-oauth-callback
npx supabase secrets set LINKEDIN_VERSION=202609
npx supabase secrets set TOKEN_ENCRYPTION_KEY=...   # 32 bytes as 64-hex or base64
npx supabase secrets set CRON_INTERNAL_SECRET=...
npx supabase secrets set APP_BASE_URL=https://YOUR_PAGES_DOMAIN.pages.dev
npx supabase secrets set OWNER_EMAIL=you@example.com
npx supabase secrets set BOOTSTRAP_SECRET=...       # min 16 chars, one-time
npx supabase secrets set PUBLISHING_MODE=review
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are usually auto-injected for Edge Functions on hosted Supabase. Confirm in the dashboard if a function reports missing env.

Generate `TOKEN_ENCRYPTION_KEY` (example â€” run locally, do not commit output):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 6. Cloudflare Pages

Build settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

Environment variables (public only):

- `VITE_SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = anon/publishable key

Never add Groq, LinkedIn secret, service role, encryption key, or cron secret to Pages.

## 7. Bootstrap the owner

1. Open the Pages URL.
2. Use **First-time bootstrap** with `OWNER_EMAIL`, a strong password (â‰¥10), and `BOOTSTRAP_SECRET`.
3. Bootstrap seeds brand, pillars, feeds, and settings, then disables itself.
4. Sign in â†’ Settings â†’ Connect LinkedIn.
5. Keep **dry-run** enabled until a weekly run looks good; leave mode on **review** initially.

## 8. Verify cron

After Monday 03:00 UTC (08:00 Asia/Karachi), check Runs page for `weekly-content`. Every 5 minutes `process-due-posts` should appear (no-op until posts are scheduled and dry-run is off).
