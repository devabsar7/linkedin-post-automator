import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
    .join('\n')
}

const TABLES = [
  'brand_profiles',
  'content_pillars',
  'source_feeds',
  'research_items',
  'content_runs',
  'post_ideas',
  'posts',
  'post_versions',
  'content_memory',
  'oauth_connections',
  'publishing_attempts',
  'scheduler_runs',
  'app_settings',
  'bootstrap_state',
]

describe('RLS migration assertions', () => {
  const sql = allSql()

  it('enables RLS on every application table', () => {
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    }
  })

  it('does not grant authenticated SELECT of oauth ciphertext', () => {
    expect(sql).toMatch(/revoke all on public\.oauth_connections from anon, authenticated/i)
    // no positive select policy for authenticated on oauth_connections except forced false
    expect(sql).toMatch(/using \(false\)/i)
    expect(sql).not.toMatch(
      /create policy\s+\w+\s+on public\.oauth_connections\s+for select to authenticated\s+using \(owner_id/i,
    )
  })

  it('avoids broad USING (true) on data tables', () => {
    // bootstrap_state is the only intentional using(true) for completion flag
    const matches = [...sql.matchAll(/create policy[\s\S]*?using \(true\)/gi)]
    expect(matches.length).toBeLessThanOrEqual(1)
  })

  it('defines claim_due_post with skip locked semantics', () => {
    expect(sql).toMatch(/for update skip locked/i)
    expect(sql).toMatch(/claim_due_post/i)
  })
})
