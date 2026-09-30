import { useState } from 'react'
import { invokeFunction } from '@/lib/supabase'
import { Button } from './ui'

export type GenerateWeekResult = {
  ok?: boolean
  skipped?: boolean
  reason?: string
  message?: string
  content_run_id?: string
  iso_week_key?: string
  passedCount?: number
  status?: string
  evergreenNeeded?: boolean
  error?: string
}

type Props = {
  onDone?: (result: GenerateWeekResult) => void
  className?: string
}

export function GenerateWeekButton({ onDone, className }: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run(force = false) {
    setBusy(true)
    setMessage(force ? 'Regenerating this week (replaces review drafts)…' : 'Generating 7 posts — usually 1–3 minutes…')
    try {
      const res = await invokeFunction<GenerateWeekResult>('weekly-content', {
        force,
        source: 'dashboard',
      })
      const text =
        res.message ||
        (res.skipped
          ? 'This week already has posts. Open Calendar, or use Regenerate week.'
          : `Done: ${res.passedCount ?? '?'}/7 posts (${res.status ?? 'ok'}).`)
      setMessage(text)
      onDone?.(res)
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Generation failed'
      setMessage(err)
      onDone?.({ ok: false, error: err })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void run(false)}>
          {busy ? 'Generating…' : 'Generate this week'}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(true)}>
          Regenerate week
        </Button>
      </div>
      {message ? <p className="mt-2 text-sm text-[var(--muted)]">{message}</p> : null}
      <p className="mt-1 text-xs text-[var(--muted)]">
        Monday 08:00 Asia/Karachi still auto-runs. Manual generate uses your login (no cron secret in the browser).
      </p>
    </div>
  )
}
