import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GenerateWeekButton, type GenerateWeekResult } from '@/components/GenerateWeekButton'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, PageHeader, statusTone } from '@/components/ui'

export function CalendarPage() {
  const [posts, setPosts] = useState<Array<Record<string, unknown>>>([])
  const [week, setWeek] = useState<string>('')
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: runs } = await supabase
      .from('content_runs')
      .select('iso_week_key, status, started_at, evergreen_used')
      .order('started_at', { ascending: false })
      .limit(1)
    const key = runs?.[0]?.iso_week_key ?? ''
    setWeek(key)
    let q = supabase
      .from('posts')
      .select(
        'id, status, topic, angle, scheduled_at, pillar_slug, evergreen, validation_report, slot_index, full_text',
      )
      .order('slot_index', { ascending: true })
    if (key) q = q.eq('iso_week_key', key)
    const { data } = await q.limit(14)
    setPosts(data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function onGenerated(res: GenerateWeekResult) {
    setNote(res.message ?? (res.skipped ? 'Week already exists.' : 'Generation finished.'))
    void load()
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={
          week
            ? `Week ${week} — seven posts with status, schedule, and validation.`
            : 'Generate this week’s posts to fill the calendar.'
        }
        actions={
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      <Card className="mb-6">
        <h2 className="font-display text-lg font-semibold">Generate this week</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Manual run for testing. Monday cron still generates automatically every week.
        </p>
        <div className="mt-3">
          <GenerateWeekButton onDone={onGenerated} />
        </div>
        {note ? <p className="mt-2 text-sm text-[var(--accent)]">{note}</p> : null}
      </Card>

      {posts.length === 0 ? (
        <EmptyState
          title="No posts yet"
          body="Use Generate this week above. When finished, all seven drafts appear here with status and schedule."
        />
      ) : (
        <div className="grid gap-3">
          {posts.map((p) => {
            const report = p.validation_report as { passed?: boolean } | null
            const preview = String(p.full_text ?? '').slice(0, 160)
            return (
              <Link key={String(p.id)} to={`/posts/${p.id}`}>
                <Card className="hover:border-[var(--accent)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--muted)]">Slot {Number(p.slot_index ?? 0) + 1}</p>
                      <h3 className="font-display text-xl font-semibold">{String(p.topic ?? 'Untitled')}</h3>
                      <p className="mt-1 text-sm text-[var(--muted)]">{String(p.angle ?? '')}</p>
                      {preview ? (
                        <p className="mt-2 line-clamp-2 text-sm text-[var(--ink)] opacity-80">{preview}…</p>
                      ) : null}
                      <p className="mt-2 text-sm">
                        {p.scheduled_at
                          ? new Date(String(p.scheduled_at)).toLocaleString(undefined, { timeZone: 'Asia/Karachi' }) +
                            ' Asia/Karachi'
                          : 'Unscheduled'}
                        {p.evergreen ? ' · evergreen' : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={statusTone(String(p.status))}>{String(p.status)}</Badge>
                      <Badge tone={report?.passed ? 'ok' : 'warn'}>
                        {report?.passed ? 'gates ok' : 'needs review'}
                      </Badge>
                      <Badge tone="neutral">{String(p.pillar_slug ?? '')}</Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
