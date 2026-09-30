import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { invokeFunction, supabase } from '@/lib/supabase'
import { formatKarachi, karachiDateTimeLocalToIso, toKarachiDateTimeLocal } from '@/lib/scheduleTime'
import { Badge, Button, Card, Input, Label, PageHeader, Textarea, statusTone } from '@/components/ui'

export function PostEditorPage() {
  const { id } = useParams()
  const [post, setPost] = useState<Record<string, unknown> | null>(null)
  const [versions, setVersions] = useState<Array<Record<string, unknown>>>([])
  const [research, setResearch] = useState<Array<Record<string, unknown>>>([])
  const [text, setText] = useState('')
  const [scheduleLocal, setScheduleLocal] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const chars = useMemo(() => [...text].length, [text])
  const canEditSchedule = post
    ? !['PUBLISHED', 'PUBLISHING', 'SKIPPED', 'REJECTED'].includes(String(post.status))
    : false

  async function load() {
    if (!id) return
    const { data } = await supabase.from('posts').select('*').eq('id', id).maybeSingle()
    setPost(data)
    setText(String(data?.full_text ?? ''))
    setScheduleLocal(toKarachiDateTimeLocal(data?.scheduled_at ? String(data.scheduled_at) : null))
    const { data: vers } = await supabase
      .from('post_versions')
      .select('*')
      .eq('post_id', id)
      .order('version_number', { ascending: false })
    setVersions(vers ?? [])

    const cites = (data?.research_cites as { research_item_id: string }[] | null) ?? []
    const ids = cites.map((c) => c.research_item_id).filter(Boolean)
    if (ids.length) {
      const { data: items } = await supabase.from('research_items').select('*').in('id', ids)
      setResearch(items ?? [])
    } else setResearch([])
  }

  useEffect(() => {
    void load()
  }, [id])

  function scheduledAtPayload(): string | undefined {
    if (!scheduleLocal.trim()) return undefined
    return karachiDateTimeLocalToIso(scheduleLocal)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    setBusy(true)
    setMessage(null)
    try {
      const scheduled_at = scheduledAtPayload()
      await invokeFunction('approve-post', {
        post_id: id,
        action: 'approve',
        full_text: text,
        ...(scheduled_at ? { scheduled_at } : {}),
      })
      setMessage(
        scheduled_at
          ? `Saved & scheduled for ${formatKarachi(scheduled_at)}.`
          : 'Saved and scheduled.',
      )
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveScheduleOnly() {
    if (!id) return
    setBusy(true)
    setMessage(null)
    try {
      const scheduled_at = scheduledAtPayload()
      if (!scheduled_at) throw new Error('Pick a schedule date & time (Asia/Karachi).')
      await invokeFunction('approve-post', {
        post_id: id,
        action: 'reschedule',
        scheduled_at,
      })
      setMessage(`Schedule updated: ${formatKarachi(scheduled_at)}.`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Schedule update failed')
    } finally {
      setBusy(false)
    }
  }

  async function act(action: string) {
    if (!id) return
    setBusy(true)
    setMessage(null)
    try {
      if (action === 'regenerate') await invokeFunction('regenerate-post', { post_id: id })
      else if (action === 'publish') {
        const res = await invokeFunction<{ ok?: boolean; url?: string; urn?: string; message?: string }>(
          'manual-publish',
          { post_id: id, confirm: true },
        )
        setMessage(res.message || (res.url ? `Published. Open on LinkedIn: ${res.url}` : 'Published.'))
        await load()
        return
      } else {
        const scheduled_at = scheduledAtPayload()
        await invokeFunction('approve-post', {
          post_id: id,
          action,
          full_text: text,
          ...(scheduled_at ? { scheduled_at } : {}),
        })
      }
      setMessage(`${action} completed.`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (!post) return <p className="text-[var(--muted)]">Loading…</p>

  const report = post.validation_report as {
    passed?: boolean
    deterministic?: { passed?: boolean; issues?: { code: string; message: string }[] }
    llm?: { issues?: string[] }
  } | null

  return (
    <div>
      <PageHeader
        title={String(post.topic ?? 'Post editor')}
        subtitle={`${String(post.pillar_slug ?? '')} · ${String(post.angle ?? '')}`}
        actions={
          <>
            <Badge tone={statusTone(String(post.status))}>{String(post.status)}</Badge>
            {post.evergreen ? <Badge tone="warn">evergreen</Badge> : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Post text</Label>
              <span className="text-xs text-[var(--muted)]">{chars} characters</span>
            </div>
            <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} />

            <div className="rounded-xl border border-[var(--line)] p-3">
              <Label>Schedule (Asia/Karachi)</Label>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Current: {formatKarachi(post.scheduled_at ? String(post.scheduled_at) : null)}
              </p>
              <Input
                id="schedule-at"
                type="datetime-local"
                className="mt-2"
                value={scheduleLocal}
                disabled={!canEditSchedule || busy}
                onChange={(e) => setScheduleLocal(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canEditSchedule || busy || !scheduleLocal}
                  onClick={() => void saveScheduleOnly()}
                >
                  Update schedule only
                </Button>
              </div>
              {!canEditSchedule ? (
                <p className="mt-2 text-xs text-[var(--muted)]">Schedule locked for this status.</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                Save & approve
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void act('regenerate')}>
                Regenerate
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void act('skip')}>
                Skip
              </Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => void act('reject')}>
                Reject
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void act('publish')}>
                Live publish
              </Button>
            </div>
            {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
            {post.status === 'PUBLISHED' && post.linkedin_post_url ? (
              <p className="text-sm">
                <a
                  className="text-[var(--accent)] underline"
                  href={
                    String(post.linkedin_post_url).includes('%3A')
                      ? `https://www.linkedin.com/feed/update/${String(post.linkedin_post_urn ?? '')}`
                      : String(post.linkedin_post_url)
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on LinkedIn
                </a>
                {post.linkedin_post_urn ? (
                  <span className="ml-2 text-xs text-[var(--muted)]">{String(post.linkedin_post_urn)}</span>
                ) : null}
              </p>
            ) : null}
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="font-display text-lg font-semibold">Quality gates</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Passed: {report?.passed || report?.deterministic?.passed ? 'yes' : 'no'}
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {(report?.deterministic?.issues ?? []).map((i) => (
                <li key={i.code + i.message} className="text-[var(--danger)]">
                  {i.message}
                </li>
              ))}
              {(report?.llm?.issues ?? []).map((i) => (
                <li key={i} className="text-[var(--warn)]">
                  {i}
                </li>
              ))}
              {!report?.deterministic?.issues?.length && !report?.llm?.issues?.length ? (
                <li className="text-[var(--muted)]">No issues recorded.</li>
              ) : null}
            </ul>
          </Card>

          <Card>
            <h3 className="font-display text-lg font-semibold">Source evidence</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">For owner verification — not auto-pasted into LinkedIn.</p>
            <div className="mt-3 space-y-2">
              {research.length === 0 ? <p className="text-sm text-[var(--muted)]">No research cites.</p> : null}
              {research.map((r) => (
                <a
                  key={String(r.id)}
                  href={String(r.canonical_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-[var(--line)] p-3 text-sm hover:border-[var(--accent)]"
                >
                  <p className="font-semibold">{String(r.title)}</p>
                  <p className="text-[var(--muted)]">{String(r.source_name)}</p>
                </a>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-display text-lg font-semibold">Version history</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {versions.map((v) => (
                <li key={String(v.id)} className="rounded-xl border border-[var(--line)] p-2">
                  v{String(v.version_number)} · {String(v.source)} · {new Date(String(v.created_at)).toLocaleString()}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
