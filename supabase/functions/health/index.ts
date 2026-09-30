import { AuthError, env, handleOptions, jsonResponse, requireCron, requireOwner, serviceClient } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    // Allow cron secret OR owner JWT
    const cronHeader = req.headers.get('X-Cron-Secret')
    if (cronHeader) requireCron(req)
    else await requireOwner(req)

    const admin = serviceClient()
    const { data: settings } = await admin.from('app_settings').select('owner_id, publishing_mode, dry_run, auto_publish_paused').limit(1).maybeSingle()
    const ownerId = settings?.owner_id

    const [{ count: upcoming }, { data: lastRun }, { data: feeds }, oauth] = await Promise.all([
      admin
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .in('status', ['SCHEDULED', 'READY_FOR_REVIEW', 'RETRY_WAIT'])
        .eq('owner_id', ownerId ?? ''),
      admin
        .from('content_runs')
        .select('id, status, iso_week_key, started_at, finished_at, evergreen_used')
        .eq('owner_id', ownerId ?? '')
        .order('started_at', { ascending: false })
        .limit(1),
      admin.from('source_feeds').select('id, health_status, enabled').eq('owner_id', ownerId ?? ''),
      ownerId
        ? admin.from('oauth_connections').select('health, token_expires_at, member_name').eq('owner_id', ownerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const feedSummary = {
      total: feeds?.length ?? 0,
      healthy: feeds?.filter((f) => f.health_status === 'healthy').length ?? 0,
      failed: feeds?.filter((f) => f.health_status === 'failed' || f.health_status === 'cooldown').length ?? 0,
    }

    return jsonResponse(
      {
        ok: true,
        publishing_mode: settings?.publishing_mode ?? (env('PUBLISHING_MODE', false) || 'review'),
        dry_run: settings?.dry_run ?? true,
        auto_publish_paused: settings?.auto_publish_paused ?? false,
        upcoming_posts: upcoming ?? 0,
        last_content_run: lastRun?.[0] ?? null,
        source_health: feedSummary,
        linkedin: oauth.data
          ? { health: oauth.data.health, token_expires_at: oauth.data.token_expires_at, member_name: oauth.data.member_name }
          : { health: 'disconnected' },
      },
      200,
      origin,
    )
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})
