import { readFileSync, writeFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i < 0) continue
  env[t.slice(0, i)] = t.slice(i + 1)
}

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY
const cron = env.CRON_INTERNAL_SECRET

function esc(s) {
  return String(s).replace(/'/g, "''")
}

const sql = `-- Auto-generated local vault update (do not commit)
do $$
declare
  id_url uuid;
  id_anon uuid;
  id_cron uuid;
begin
  select id into id_url from vault.secrets where name = 'cron_project_url' limit 1;
  select id into id_anon from vault.secrets where name = 'cron_anon_key' limit 1;
  select id into id_cron from vault.secrets where name = 'cron_internal_secret' limit 1;

  if id_url is not null then
    perform vault.update_secret(id_url, '${esc(url)}');
  else
    perform vault.create_secret('${esc(url)}', 'cron_project_url', 'project url');
  end if;

  if id_anon is not null then
    perform vault.update_secret(id_anon, '${esc(anon)}');
  else
    perform vault.create_secret('${esc(anon)}', 'cron_anon_key', 'publishable key');
  end if;

  if id_cron is not null then
    perform vault.update_secret(id_cron, '${esc(cron)}');
  else
    perform vault.create_secret('${esc(cron)}', 'cron_internal_secret', 'cron secret');
  end if;
end $$;

select jobid, jobname, schedule from cron.job order by jobname;
`

writeFileSync('scripts/vault-update.local.sql', sql)
console.log('Wrote scripts/vault-update.local.sql')
