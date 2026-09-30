import { AuthError, env, handleOptions, jsonResponse, requireCron, serviceClient } from '../_shared/http.ts'
import { decryptSecret } from '../_shared/crypto.ts'
import {
  classifyLinkedInFailure,
  nextRetryAt,
  publishTextPost,
} from '../_shared/linkedin.ts'
import { hookFingerprint, extractKeywords, normalizeForHash } from '../_shared/quality.ts'
import { sha256Hex } from '../_shared/rss.ts'
import { logJson } from '../_shared/redact.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const started = Date.now()
  try {
    requireCron(req)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const idem = String(body.idempotency_key ?? `process-due-posts:${new Date().toISOString().slice(0, 16)}`)
    const admin = serviceClient()

    const { data: settings } = await admin.from('app_settings').select('*').limit(1).maybeSingle()
    if (!settings) return jsonResponse({ ok: true, skipped: true, reason: 'no_settings' })

    if (settings.auto_publish_paused) {
      await admin.from('scheduler_runs').upsert(
        {
          owner_id: settings.owner_id,
          job_name: 'process-due-posts',
          idempotency_key: idem,
          outcome: 'skipped_idempotent',
          duration_ms: Date.now() - started,
          detail: { reason: 'auto_publish_paused' },
        },
        { onConflict: 'idempotency_key' },
      )
      return jsonResponse({ ok: true, skipped: true, reason: 'auto_publish_paused' })
    }

    const { data: claimed, error: claimErr } = await admin.rpc('claim_due_post', {
      p_owner_id: settings.owner_id,
    })

    if (claimErr) throw new Error(claimErr.message)
    if (!claimed || !claimed.id) {
      await admin.from('scheduler_runs').upsert(
        {
          owner_id: settings.owner_id,
          job_name: 'process-due-posts',
          idempotency_key: idem,
          outcome: 'success',
          duration_ms: Date.now() - started,
          detail: { claimed: false },
        },
        { onConflict: 'idempotency_key' },
      )
      return jsonResponse({ ok: true, claimed: false })
    }

    const post = claimed
    const attemptNumber = (post.retry_count ?? 0) + 1
    const attemptKey = `publish:${post.id}:${attemptNumber}`

    await admin.from('publishing_attempts').insert({
      owner_id: post.owner_id,
      post_id: post.id,
      attempt_number: attemptNumber,
      idempotency_key: attemptKey,
      status: 'started',
      dry_run: settings.dry_run,
    })

    if (settings.dry_run) {
      await admin
        .from('posts')
        .update({
          status: 'SCHEDULED',
          last_error: 'dry_run_skipped_linkedin',
          claim_token: null,
          claimed_at: null,
        })
        .eq('id', post.id)
      await admin
        .from('publishing_attempts')
        .update({ status: 'success', finished_at: new Date().toISOString(), error_summary: 'dry_run' })
        .eq('idempotency_key', attemptKey)

      return jsonResponse({ ok: true, dry_run: true, post_id: post.id })
    }

    const { data: conn } = await admin
      .from('oauth_connections')
      .select('*')
      .eq('owner_id', post.owner_id)
      .eq('provider', 'linkedin')
      .maybeSingle()

    if (!conn?.token_ciphertext || !conn.token_iv || !conn.member_urn) {
      await failAuth(admin, post, attemptKey, 'missing_oauth')
      return jsonResponse({ ok: false, status: 'NEEDS_REAUTH', post_id: post.id })
    }

    if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now()) {
      await failAuth(admin, post, attemptKey, 'token_expired')
      return jsonResponse({ ok: false, status: 'NEEDS_REAUTH', post_id: post.id })
    }

    let accessToken: string
    try {
      accessToken = await decryptSecret(
        { iv_b64: conn.token_iv, ciphertext_b64: conn.token_ciphertext },
        env('TOKEN_ENCRYPTION_KEY'),
      )
    } catch {
      await failAuth(admin, post, attemptKey, 'decrypt_failed')
      return jsonResponse({ ok: false, status: 'NEEDS_REAUTH', post_id: post.id })
    }

    const result = await publishTextPost({
      accessToken,
      authorUrn: conn.member_urn,
      text: post.full_text,
      linkedinVersion: env('LINKEDIN_VERSION'),
    })

    if (result.ok) {
      await admin
        .from('posts')
        .update({
          status: 'PUBLISHED',
          published_at: new Date().toISOString(),
          linkedin_post_urn: result.urn,
          linkedin_post_url: result.url ?? null,
          last_error: null,
          claim_token: null,
          claimed_at: null,
        })
        .eq('id', post.id)

      await admin
        .from('publishing_attempts')
        .update({
          status: 'success',
          http_status: result.status,
          linkedin_post_urn: result.urn,
          finished_at: new Date().toISOString(),
        })
        .eq('idempotency_key', attemptKey)

      const hash = await sha256Hex(normalizeForHash(post.full_text))
      await admin.from('content_memory').upsert(
        {
          owner_id: post.owner_id,
          post_id: post.id,
          topic: post.topic,
          pillar: post.pillar_slug,
          angle: post.angle,
          keywords: extractKeywords(post.full_text),
          hook_fingerprint: hookFingerprint(post.hook || post.full_text),
          word_count: post.full_text.split(/\s+/).length,
          normalized_hash: hash,
          body_sample: post.full_text.slice(0, 500),
          source: 'published',
          published_or_imported_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id,normalized_hash' },
      )

      logJson('info', 'published', { post_id: post.id })
      return jsonResponse({ ok: true, post_id: post.id, urn: result.urn })
    }

    const failure = classifyLinkedInFailure(result.status, result.unknown)
    if (failure === 'unknown') {
      await admin
        .from('posts')
        .update({
          status: 'UNKNOWN_OUTCOME',
          last_error: 'Unknown LinkedIn outcome — do not retry blindly',
          claim_token: null,
          claimed_at: null,
        })
        .eq('id', post.id)
      await admin
        .from('publishing_attempts')
        .update({
          status: 'unknown',
          failure_class: 'unknown',
          http_status: result.status,
          error_summary: result.body.slice(0, 300),
          finished_at: new Date().toISOString(),
        })
        .eq('idempotency_key', attemptKey)
      return jsonResponse({ ok: false, status: 'UNKNOWN_OUTCOME', post_id: post.id })
    }

    if (failure === 'auth') {
      await failAuth(admin, post, attemptKey, result.body.slice(0, 200), result.status)
      return jsonResponse({ ok: false, status: 'NEEDS_REAUTH', post_id: post.id })
    }

    if (failure === 'transient' && attemptNumber < 5) {
      const retryAt = nextRetryAt(attemptNumber)
      await admin
        .from('posts')
        .update({
          status: 'RETRY_WAIT',
          retry_count: attemptNumber,
          next_retry_at: retryAt.toISOString(),
          last_error: result.body.slice(0, 300),
          claim_token: null,
          claimed_at: null,
        })
        .eq('id', post.id)
      await admin
        .from('publishing_attempts')
        .update({
          status: 'failed',
          failure_class: 'transient',
          http_status: result.status,
          error_summary: result.body.slice(0, 300),
          finished_at: new Date().toISOString(),
        })
        .eq('idempotency_key', attemptKey)
      return jsonResponse({ ok: false, status: 'RETRY_WAIT', next_retry_at: retryAt.toISOString() })
    }

    await admin
      .from('posts')
      .update({
        status: 'FAILED',
        retry_count: attemptNumber,
        last_error: result.body.slice(0, 300),
        claim_token: null,
        claimed_at: null,
      })
      .eq('id', post.id)
    await admin
      .from('publishing_attempts')
      .update({
        status: 'failed',
        failure_class: failure,
        http_status: result.status,
        error_summary: result.body.slice(0, 300),
        finished_at: new Date().toISOString(),
      })
      .eq('idempotency_key', attemptKey)

    return jsonResponse({ ok: false, status: 'FAILED', post_id: post.id })
  } catch (e) {
    logJson('error', 'process_due_posts_failed', { message: e instanceof Error ? e.message : String(e) })
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status)
  }
})

async function failAuth(
  admin: ReturnType<typeof serviceClient>,
  post: { id: string; owner_id: string },
  attemptKey: string,
  summary: string,
  httpStatus?: number | null,
) {
  await admin
    .from('posts')
    .update({
      status: 'NEEDS_REAUTH',
      last_error: summary,
      claim_token: null,
      claimed_at: null,
    })
    .eq('id', post.id)
  await admin.from('app_settings').update({ auto_publish_paused: true }).eq('owner_id', post.owner_id)
  await admin
    .from('oauth_connections')
    .update({ health: 'needs_reauth', last_health_check_at: new Date().toISOString() })
    .eq('owner_id', post.owner_id)
  await admin
    .from('publishing_attempts')
    .update({
      status: 'failed',
      failure_class: 'auth',
      http_status: httpStatus ?? null,
      error_summary: summary,
      finished_at: new Date().toISOString(),
    })
    .eq('idempotency_key', attemptKey)
}
