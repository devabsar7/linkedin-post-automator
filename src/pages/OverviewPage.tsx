import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GenerateWeekButton, type GenerateWeekResult } from '@/components/GenerateWeekButton'
import { invokeFunction, supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, PageHeader, statusTone } from '@/components/ui'

type Health = {
  publishing_mode?: string
  dry_run?: boolean
  auto_publish_paused?: boolean
  upcoming_posts?: number
  last_content_run?: { iso_week_key: string; status: string; started_at: string; evergreen_used?: boolean } | null
  source_health?: { total: number; healthy: number; failed: number }
  linkedin?: { health: string; token_expires_at?: string; member_name?: string }
}

export function OverviewPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [posts, setPosts] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState<string | null>(null)
  const [genNote, setGenNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const h = await invokeFunction<Health>('health')
      setHealth(h)
      const weekKey = h.last_content_run?.iso_week_key
      let q = supabase
        .from('posts')
        .select('id, status, topic, scheduled_at, pillar_slug, evergreen, iso_week_key, slot_index')
        .order('slot_index', { ascending: true })
        .limit(14)
      if (weekKey) q = q.eq('iso_week_key', weekKey)
      const { data } = await q
      setPosts(data ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function onGenerated(res: GenerateWeekResult) {
    if (res.skipped) {
      setGenNote(res.message ?? 'Week already generated — see Calendar.')
    } else if (res.ok !== false && !res.error) {
      setGenNote(res.message ?? 'Generation finished.')
    }
    void load()
  }

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="This week’s pipeline status, LinkedIn connection health, and upcoming posts."
        actions={
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      <Card className="mb-6">
        <h2 className="font-display text-lg font-semibold">Generate posts</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create this week’s seven drafts now, or wait for Monday 08:00 Asia/Karachi auto-run.
        </p>
        <div className="mt-3">
          <GenerateWeekButton onDone={onGenerated} />
        </div>
        {genNote ? <p className="mt-2 text-sm text-[var(--accent)]">{genNote}</p> : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Mode</p>
          <p className="mt-2 font-display text-2xl font-bold">{health?.publishing_mode ?? '—'}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Dry-run: {health?.dry_run ? 'on' : 'off'}
            {health?.auto_publish_paused ? ' · auto paused' : ''}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">LinkedIn</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={statusTone(health?.linkedin?.health ?? 'disconnected')}>
              {health?.linkedin?.health ?? 'disconnected'}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">{health?.linkedin?.member_name ?? 'Not connected'}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Last weekly run</p>
          <p className="mt-2 font-display text-2xl font-bold">{health?.last_content_run?.iso_week_key ?? '—'}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {health?.last_content_run ? (
              <>
                <Badge tone={statusTone(health.last_content_run.status)}>{health.last_content_run.status}</Badge>
                {health.last_content_run.evergreen_used ? ' · evergreen used' : ''}
              </>
            ) : (
              'No runs yet — use Generate this week'
            )}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Source health</p>
          <p className="mt-2 font-display text-2xl font-bold">
            {health?.source_health ? `${health.source_health.healthy}/${health.source_health.total}` : '—'}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{health?.source_health?.failed ?? 0} failed/cooldown</p>
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">This week’s posts</h2>
          <Link className="text-sm font-semibold text-[var(--accent)]" to="/calendar">
            Open calendar
          </Link>
        </div>
        {posts.length === 0 ? (
          <EmptyState
            title="No posts yet"
            body="Click Generate this week above. After it finishes, all seven drafts show here and on Calendar."
          />
        ) : (
          <div className="grid gap-3">
            {posts.map((p) => (
              <Link key={String(p.id)} to={`/posts/${p.id}`} className="block">
                <Card className="transition hover:border-[var(--accent)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-[var(--muted)]">
                        Slot {Number(p.slot_index ?? 0) + 1}
                        {p.iso_week_key ? ` · ${String(p.iso_week_key)}` : ''}
                      </p>
                      <p className="font-semibold">{String(p.topic ?? 'Untitled')}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {String(p.pillar_slug ?? '')}
                        {p.evergreen ? ' · evergreen' : ''}
                        {p.scheduled_at
                          ? ` · ${new Date(String(p.scheduled_at)).toLocaleString(undefined, { timeZone: 'Asia/Karachi' })}`
                          : ''}
                      </p>
                    </div>
                    <Badge tone={statusTone(String(p.status))}>{String(p.status)}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
