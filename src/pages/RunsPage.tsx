import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, PageHeader, statusTone } from '@/components/ui'

export function RunsPage() {
  const [contentRuns, setContentRuns] = useState<Array<Record<string, unknown>>>([])
  const [scheduler, setScheduler] = useState<Array<Record<string, unknown>>>([])
  const [attempts, setAttempts] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => {
    void (async () => {
      const [{ data: cr }, { data: sr }, { data: pa }] = await Promise.all([
        supabase.from('content_runs').select('*').order('started_at', { ascending: false }).limit(20),
        supabase.from('scheduler_runs').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('publishing_attempts').select('*').order('started_at', { ascending: false }).limit(40),
      ])
      setContentRuns(cr ?? [])
      setScheduler(sr ?? [])
      setAttempts(pa ?? [])
    })()
  }, [])

  return (
    <div>
      <PageHeader
        title="Runs & logs"
        subtitle="Content runs, cron outcomes, and publishing attempts. Secrets and full tokens are never shown."
      />

      <section className="mb-8">
        <h2 className="font-display mb-3 text-xl font-semibold">Content runs</h2>
        {contentRuns.length === 0 ? (
          <EmptyState title="No content runs" body="Monday weekly-content will appear here." />
        ) : (
          <div className="grid gap-3">
            {contentRuns.map((r) => (
              <Card key={String(r.id)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{String(r.iso_week_key)}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {String(r.model ?? '')} · {String(r.prompt_version)} · {r.latency_ms ? `${r.latency_ms}ms` : ''}
                    </p>
                    {r.error_summary ? <p className="text-sm text-[var(--danger)]">{String(r.error_summary)}</p> : null}
                  </div>
                  <Badge tone={statusTone(String(r.status))}>{String(r.status)}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-3 text-xl font-semibold">Scheduler runs</h2>
        <div className="grid gap-3">
          {scheduler.map((r) => (
            <Card key={String(r.id)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{String(r.job_name)}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {String(r.idempotency_key)} · {r.duration_ms ? `${r.duration_ms}ms` : ''}
                  </p>
                  {r.error_summary ? <p className="text-sm text-[var(--danger)]">{String(r.error_summary)}</p> : null}
                </div>
                <Badge tone={statusTone(String(r.outcome))}>{String(r.outcome)}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-3 text-xl font-semibold">Publishing attempts</h2>
        <div className="grid gap-3">
          {attempts.map((a) => (
            <Card key={String(a.id)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    Attempt {String(a.attempt_number)} · post {String(a.post_id).slice(0, 8)}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {a.failure_class ? String(a.failure_class) : '—'}
                    {a.http_status ? ` · HTTP ${a.http_status}` : ''}
                    {a.dry_run ? ' · dry-run' : ''}
                  </p>
                  {a.error_summary ? <p className="text-sm text-[var(--danger)]">{String(a.error_summary)}</p> : null}
                </div>
                <Badge tone={statusTone(String(a.status))}>{String(a.status)}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
