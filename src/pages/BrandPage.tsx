import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Card, Input, Label, PageHeader, Textarea } from '@/components/ui'

export function BrandPage() {
  const [brand, setBrand] = useState<Record<string, unknown> | null>(null)
  const [pillars, setPillars] = useState<Array<Record<string, unknown>>>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data: b } = await supabase.from('brand_profiles').select('*').limit(1).maybeSingle()
      setBrand(b)
      const { data: p } = await supabase.from('content_pillars').select('*').order('sort_order')
      setPillars(p ?? [])
    })()
  }, [])

  async function saveBrand(e: FormEvent) {
    e.preventDefault()
    if (!brand?.id) return
    const { error } = await supabase
      .from('brand_profiles')
      .update({
        display_name: String(brand.display_name),
        positioning: String(brand.positioning),
        career_context: String(brand.career_context ?? ''),
        audience: String(brand.audience ?? ''),
        writing_style: String(brand.writing_style ?? ''),
        allow_roman_urdu: Boolean(brand.allow_roman_urdu),
        include_citations_in_post: Boolean(brand.include_citations_in_post),
        core_expertise:
          typeof brand.core_expertise === 'string'
            ? String(brand.core_expertise)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : (brand.core_expertise as string[]),
      })
      .eq('id', String(brand.id))
    setMessage(error ? error.message : 'Brand saved.')
  }

  async function savePillar(p: Record<string, unknown>) {
    await supabase
      .from('content_pillars')
      .update({
        name: String(p.name),
        description: String(p.description ?? ''),
        enabled: Boolean(p.enabled),
      })
      .eq('id', String(p.id))
    setMessage('Pillar updated.')
  }

  if (!brand) return <p className="text-[var(--muted)]">Loading brand profile…</p>

  const expertise =
    Array.isArray(brand.core_expertise)
      ? (brand.core_expertise as string[]).join(', ')
      : String(brand.core_expertise ?? '')

  return (
    <div>
      <PageHeader title="Brand & pillars" subtitle="Editable brand seed used by the weekly LLM pipeline." />
      <Card className="mb-4">
        <form className="space-y-3" onSubmit={saveBrand}>
          <div>
            <Label>Display name</Label>
            <Input
              value={String(brand.display_name ?? '')}
              onChange={(e) => setBrand({ ...brand, display_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Positioning</Label>
            <Textarea
              rows={3}
              value={String(brand.positioning ?? '')}
              onChange={(e) => setBrand({ ...brand, positioning: e.target.value })}
            />
          </div>
          <div>
            <Label>Core expertise (comma-separated)</Label>
            <Textarea
              rows={2}
              value={expertise}
              onChange={(e) => setBrand({ ...brand, core_expertise: e.target.value })}
            />
          </div>
          <div>
            <Label>Career context</Label>
            <Textarea
              rows={3}
              value={String(brand.career_context ?? '')}
              onChange={(e) => setBrand({ ...brand, career_context: e.target.value })}
            />
          </div>
          <div>
            <Label>Audience</Label>
            <Textarea
              rows={2}
              value={String(brand.audience ?? '')}
              onChange={(e) => setBrand({ ...brand, audience: e.target.value })}
            />
          </div>
          <div>
            <Label>Writing style</Label>
            <Textarea
              rows={3}
              value={String(brand.writing_style ?? '')}
              onChange={(e) => setBrand({ ...brand, writing_style: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(brand.allow_roman_urdu)}
              onChange={(e) => setBrand({ ...brand, allow_roman_urdu: e.target.checked })}
            />
            Allow occasional Roman Urdu
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(brand.include_citations_in_post)}
              onChange={(e) => setBrand({ ...brand, include_citations_in_post: e.target.checked })}
            />
            Include citation list in LinkedIn post text
          </label>
          <Button type="submit">Save brand</Button>
        </form>
      </Card>

      <div className="grid gap-3">
        {pillars.map((p) => (
          <Card key={String(p.id)}>
            <div className="space-y-2">
              <Input value={String(p.name)} onChange={(e) => setPillars(pillars.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
              <Textarea
                rows={2}
                value={String(p.description ?? '')}
                onChange={(e) =>
                  setPillars(pillars.map((x) => (x.id === p.id ? { ...x, description: e.target.value } : x)))
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(p.enabled)}
                  onChange={(e) =>
                    setPillars(pillars.map((x) => (x.id === p.id ? { ...x, enabled: e.target.checked } : x)))
                  }
                />
                Enabled ({String(p.slug)})
              </label>
              <Button type="button" variant="secondary" onClick={() => void savePillar(p)}>
                Save pillar
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {message ? <p className="mt-3 text-sm text-[var(--muted)]">{message}</p> : null}
    </div>
  )
}
