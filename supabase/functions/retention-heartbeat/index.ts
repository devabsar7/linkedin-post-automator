import { AuthError, handleOptions, jsonResponse, requireCron, serviceClient } from '../_shared/http.ts'
import { logJson } from '../_shared/redact.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const started = Date.now()
  try {
    requireCron(req)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const idem = String(body.idempotency_key ?? `retention-heartbeat:${new Date().toISOString().slice(0, 10)}`)
    const admin = serviceClient()

    const { data: settings } = await admin.from('app_settings').select('owner_id, retention_days').limit(1).maybeSingle()
    const days = settings?.retention_days ?? 60
    const cutoff = new Date(Date.now() - days * 86400000).toISOString()

    // Prune verbose payloads; keep functional history
    await admin
      .from('scheduler_runs')
      .update({ detail: {}, error_summary: null })
      .lt('created_at', cutoff)

    await admin
      .from('publishing_attempts')
      .update({ error_summary: null })
      .lt('created_at', cutoff)
      .neq('status', 'success')

    await admin
      .from('content_runs')
      .update({ metadata: {}, error_summary: null, token_usage: null })
      .lt('created_at', cutoff)

    // Heartbeat write to prevent free-tier inactivity
    await admin.from('scheduler_runs').upsert(
      {
        owner_id: settings?.owner_id ?? null,
        job_name: 'retention-heartbeat',
        idempotency_key: idem,
        outcome: 'success',
        duration_ms: Date.now() - started,
        detail: { heartbeat: true, pruned_before: cutoff, retention_days: days },
      },
      { onConflict: 'idempotency_key' },
    )

    logJson('info', 'retention_heartbeat_done', { cutoff, days })
    return jsonResponse({ ok: true, cutoff, days })
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status)
  }
})
