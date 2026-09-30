/**
 * Write a secrets-only env file for `supabase secrets set --env-file`
 * so special characters (quotes, !) are not mangled by the shell.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const wanted = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'LINKEDIN_REDIRECT_URI',
  'LINKEDIN_VERSION',
  'TOKEN_ENCRYPTION_KEY',
  'CRON_INTERNAL_SECRET',
  'APP_BASE_URL',
  'OWNER_EMAIL',
  'BOOTSTRAP_SECRET',
  'PUBLISHING_MODE',
]

const env = {}
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i < 0) continue
  env[t.slice(0, i).trim()] = t.slice(i + 1)
}

const lines = wanted
  .filter((k) => env[k] != null && String(env[k]).length > 0)
  .map((k) => `${k}=${env[k]}`)

writeFileSync('scripts/edge-secrets.local.env', lines.join('\n') + '\n')
console.log(`Wrote scripts/edge-secrets.local.env (${lines.length} keys)`)
