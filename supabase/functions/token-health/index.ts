import { AuthError, handleOptions, jsonResponse, requireCron, serviceClient } from '../_shared/http.ts'
import { logJson } from '../_shared/redact.ts'

function deriveHealth(expiresAt: string | null): string {
  if (!expiresAt) return 'disconnected'
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  if (ms < 3 * 24 * 60 * 60 * 1000) return 'expiring'
  return 'connected'
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const started = Date.now()
  try {
    requireCron(req)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const idem = String(body.idempotency_key ?? `token-health:${new Date().toISOString().slice(0, 10)}`)
    const admin = serviceClient()

    const { data: connections } = await admin.from('oauth_connections').select('*').eq('provider', 'linkedin')
    const updates: unknown[] = []

    for (const conn of connections ?? []) {
      if (!conn.token_ciphertext) {
        await admin.from('oauth_connections').update({ health: 'disconnected', last_health_check_at: new Date().toISOString() }).eq('id', conn.id)
        continue
      }
      const health = deriveHealth(conn.token_expires_at)
      await admin
        .from('oauth_connections')
        .update({ health, last_health_check_at: new Date().toISOString() })
        .eq('id', conn.id)
      if (health === 'expired' || health === 'needs_reauth') {
        await admin.from('app_settings').update({ auto_publish_paused: true }).eq('owner_id', conn.owner_id)
      }
      updates.push({ owner_id: conn.owner_id, health })
    }

    await admin.from('scheduler_runs').upsert(
      {
        job_name: 'token-health',
        idempotency_key: idem,
        outcome: 'success',
        duration_ms: Date.now() - started,
        detail: { updates },
      },
      { onConflict: 'idempotency_key' },
    )

    logJson('info', 'token_health_done', { count: updates.length })
    return jsonResponse({ ok: true, updates })
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status)
  }
})
