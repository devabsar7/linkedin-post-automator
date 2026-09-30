import { useEffect, useState, type FormEvent } from 'react'
import { invokeFunction, supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input, Label, PageHeader, statusTone } from '@/components/ui'

export function SourcesPage() {
  const [feeds, setFeeds] = useState<Array<Record<string, unknown>>>([])
  const [form, setForm] = useState({ name: '', feed_url: '', category: 'ai', quality_score: 70 })
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('source_feeds').select('*').order('name')
    setFeeds(data ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function addFeed(e: FormEvent) {
    e.preventDefault()
    const { data: userData } = await supabase.auth.getUser()
    const owner_id = userData.user?.id
    if (!owner_id) return
    const { error } = await supabase.from('source_feeds').insert({
      owner_id,
      name: form.name,
      feed_url: form.feed_url,
      category: form.category,
      quality_score: form.quality_score,
      enabled: true,
    })
    setMessage(error ? error.message : 'Feed added.')
    setForm({ name: '', feed_url: '', category: 'ai', quality_score: 70 })
    await load()
  }

  async function toggle(id: string, enabled: boolean) {
    await supabase.from('source_feeds').update({ enabled }).eq('id', id)
    await load()
  }

  async function testFeed(id: string) {
    setMessage(null)
    try {
      const res = await invokeFunction<{ ok: boolean; error?: string; item_count_sample?: number }>('test-feed', {
        feed_id: id,
      })
      setMessage(res.ok ? `Healthy — sample items: ${res.item_count_sample}` : `Failed: ${res.error}`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Test failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Source feeds"
        subtitle="Editable HTTPS RSS/Atom allow-list. No article scraping — titles and short snippets only."
      />
      <Card className="mb-4">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={addFeed}>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label>Feed URL (https)</Label>
            <Input
              value={form.feed_url}
              onChange={(e) => setForm({ ...form, feed_url: e.target.value })}
              required
              pattern="https://.*"
            />
          </div>
          <div>
            <Label>Category</Label>
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div>
            <Label>Quality score</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.quality_score}
              onChange={(e) => setForm({ ...form, quality_score: Number(e.target.value) })}
            />
          </div>
          <Button type="submit" className="md:col-span-2 md:w-fit">
            Add feed
          </Button>
        </form>
      </Card>
      {message ? <p className="mb-3 text-sm text-[var(--muted)]">{message}</p> : null}
      {feeds.length === 0 ? (
        <EmptyState title="No feeds" body="Bootstrap seeds default feeds; add more reputable HTTPS RSS sources here." />
      ) : (
        <div className="grid gap-3">
          {feeds.map((f) => (
            <Card key={String(f.id)}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{String(f.name)}</p>
                  <p className="break-all text-sm text-[var(--muted)]">{String(f.feed_url)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={statusTone(String(f.health_status))}>{String(f.health_status)}</Badge>
                    <Badge tone="neutral">{String(f.category)}</Badge>
                    <Badge tone="neutral">q{String(f.quality_score)}</Badge>
                    {!f.enabled ? <Badge tone="warn">disabled</Badge> : null}
                  </div>
                  {f.last_error ? <p className="mt-1 text-xs text-[var(--danger)]">{String(f.last_error)}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => void testFeed(String(f.id))}>
                    Test feed
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void toggle(String(f.id), !f.enabled)}>
                    {f.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
