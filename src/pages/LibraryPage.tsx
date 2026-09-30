import { useEffect, useState, type FormEvent } from 'react'
import { invokeFunction, supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Label, PageHeader, Textarea } from '@/components/ui'

export function LibraryPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [pillar, setPillar] = useState('')
  const [paste, setPaste] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    let q = supabase
      .from('content_memory')
      .select('*')
      .order('published_or_imported_at', { ascending: false })
      .limit(100)
    if (pillar) q = q.eq('pillar', pillar)
    const { data } = await q
    setItems(data ?? [])
  }

  useEffect(() => {
    void load()
  }, [pillar])

  async function onImport(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    try {
      const res = await invokeFunction<{ imported: number; received: number }>('import-history', { paste })
      setMessage(`Imported ${res.imported} of ${res.received}.`)
      setPaste('')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Content library"
        subtitle="Tool-published and imported history for duplicate checks. Optional — the product works with none."
      />
      <Card className="mb-4">
        <form className="space-y-3" onSubmit={onImport}>
          <Label>Paste historical posts (separate with a blank line or ---)</Label>
          <Textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Past post text…" />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">Import</Button>
            <label className="text-sm text-[var(--muted)]">
              Pillar filter{' '}
              <input
                className="ml-2 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1"
                value={pillar}
                onChange={(e) => setPillar(e.target.value)}
                placeholder="slug"
              />
            </label>
          </div>
          {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
        </form>
      </Card>
      {items.length === 0 ? (
        <EmptyState title="Library empty" body="Import CSV/paste text or publish posts to build memory." />
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card key={String(item.id)}>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">{String(item.source)}</Badge>
                {item.pillar ? <Badge tone="ok">{String(item.pillar)}</Badge> : null}
              </div>
              <p className="mt-2 font-semibold">{String(item.topic ?? 'Untitled')}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{String(item.body_sample)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
