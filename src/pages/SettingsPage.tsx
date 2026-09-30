import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { invokeFunction, supabase } from '@/lib/supabase'
import { Badge, Button, Card, Input, Label, PageHeader, statusTone } from '@/components/ui'

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [oauth, setOauth] = useState<Record<string, unknown> | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [params] = useSearchParams()

  useEffect(() => {
    const linkedin = params.get('linkedin')
    if (linkedin === 'connected') setMessage('LinkedIn connected.')
    if (linkedin === 'error') setMessage(`LinkedIn error: ${params.get('reason') ?? 'unknown'}`)
  }, [params])

  async function load() {
    const { data: s } = await supabase.from('app_settings').select('*').limit(1).maybeSingle()
    setSettings(s)
    const { data: status } = await supabase.rpc('get_oauth_connection_status')
    setOauth(Array.isArray(status) ? status[0] ?? null : null)
  }

  useEffect(() => {
    void load()
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!settings?.id) return
    const { error } = await supabase
      .from('app_settings')
      .update({
        publishing_mode: settings.publishing_mode === 'auto' ? 'auto' : 'review',
        groq_model: String(settings.groq_model ?? ''),
        dry_run: Boolean(settings.dry_run),
        char_min: Number(settings.char_min),
        char_max: Number(settings.char_max),
        min_research_items: Number(settings.min_research_items),
        max_research_items: Number(settings.max_research_items),
        retention_days: Number(settings.retention_days),
        weekly_schedule: settings.weekly_schedule as import('@shared/database.types').Json,
        include_citations_in_post: Boolean(settings.include_citations_in_post),
        allow_roman_urdu: Boolean(settings.allow_roman_urdu),
      })
      .eq('id', String(settings.id))
    setMessage(error ? error.message : 'Settings saved. Default safe mode is review; switch to auto only after validating drafts.')
  }

  async function connectLinkedIn() {
    const res = await invokeFunction<{ authorize_url: string }>('linkedin-oauth-start')
    window.location.href = res.authorize_url
  }

  async function disconnectLinkedIn() {
    await invokeFunction('linkedin-disconnect')
    setMessage('LinkedIn disconnected.')
    await load()
  }

  async function healthCheck() {
    const res = await invokeFunction('linkedin-health', {})
    setMessage(`Health: ${JSON.stringify(res)}`)
    await load()
  }

  if (!settings) return <p className="text-[var(--muted)]">Loading settings…</p>

  const schedule = Array.isArray(settings.weekly_schedule) ? (settings.weekly_schedule as Array<Record<string, number>>) : []

  return (
    <div>
      <PageHeader
        title="Integrations & settings"
        subtitle="LLM model, publishing mode, Karachi schedule, LinkedIn OAuth, and dry-run safety switch."
      />
      {message ? <p className="mb-4 text-sm text-[var(--muted)]">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-display text-lg font-semibold">Publishing</h3>
          <form className="mt-3 space-y-3" onSubmit={save}>
            <div>
              <Label>Mode</Label>
              <select
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
                value={String(settings.publishing_mode)}
                onChange={(e) => setSettings({ ...settings, publishing_mode: e.target.value })}
              >
                <option value="review">review (approve in UI)</option>
                <option value="auto">auto (quality gates only)</option>
              </select>
            </div>
            <div>
              <Label>LLM model</Label>
              <Input
                value={String(settings.groq_model ?? '')}
                onChange={(e) => setSettings({ ...settings, groq_model: e.target.value })}
                placeholder="gemini-2.5-flash"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Uses Gemini when GEMINI_API_KEY is set on Edge Functions; Groq is fallback only.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Char min</Label>
                <Input
                  type="number"
                  value={Number(settings.char_min)}
                  onChange={(e) => setSettings({ ...settings, char_min: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Char max</Label>
                <Input
                  type="number"
                  value={Number(settings.char_max)}
                  onChange={(e) => setSettings({ ...settings, char_max: Number(e.target.value) })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(settings.dry_run)}
                onChange={(e) => setSettings({ ...settings, dry_run: e.target.checked })}
              />
              Dry-run (research/draft only — never call LinkedIn)
            </label>
            <Button type="submit">Save settings</Button>
          </form>
        </Card>

        <Card>
          <h3 className="font-display text-lg font-semibold">LinkedIn</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Scopes: openid profile w_member_social. Enable Sign In with LinkedIn using OpenID Connect and Share on
            LinkedIn in the Developer Portal.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(String(oauth?.health ?? 'disconnected'))}>
              {String(oauth?.health ?? 'disconnected')}
            </Badge>
            {oauth?.member_name ? <span className="text-sm">{String(oauth.member_name)}</span> : null}
          </div>
          {oauth?.token_expires_at ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Expires: {new Date(String(oauth.token_expires_at)).toLocaleString()}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void connectLinkedIn()}>
              Connect LinkedIn
            </Button>
            <Button type="button" variant="secondary" onClick={() => void healthCheck()}>
              Connection health
            </Button>
            <Button type="button" variant="danger" onClick={() => void disconnectLinkedIn()}>
              Disconnect
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="font-display text-lg font-semibold">Weekly schedule (Asia/Karachi)</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">Day 0=Sun … 6=Sat. Times stored as UTC after conversion.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {schedule.map((slot, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  min={0}
                  max={6}
                  value={slot.day}
                  onChange={(e) => {
                    const next = [...schedule]
                    next[idx] = { ...slot, day: Number(e.target.value) }
                    setSettings({ ...settings, weekly_schedule: next })
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={slot.hour}
                  onChange={(e) => {
                    const next = [...schedule]
                    next[idx] = { ...slot, hour: Number(e.target.value) }
                    setSettings({ ...settings, weekly_schedule: next })
                  }}
                />
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={slot.minute}
                  onChange={(e) => {
                    const next = [...schedule]
                    next[idx] = { ...slot, minute: Number(e.target.value) }
                    setSettings({ ...settings, weekly_schedule: next })
                  }}
                />
              </div>
            ))}
          </div>
          <Button className="mt-3" type="button" onClick={(e) => void save(e as unknown as FormEvent)}>
            Save schedule
          </Button>
        </Card>
      </div>
    </div>
  )
}
