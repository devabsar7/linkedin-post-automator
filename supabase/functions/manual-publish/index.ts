import { AuthError, env, handleOptions, jsonResponse, requireOwner, serviceClient } from '../_shared/http.ts'
import { decryptSecret } from '../_shared/crypto.ts'
import { publishTextPost, classifyLinkedInFailure } from '../_shared/linkedin.ts'
import { hookFingerprint, extractKeywords, normalizeForHash } from '../_shared/quality.ts'
import { sha256Hex } from '../_shared/rss.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    const { userId } = await requireOwner(req)
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)
    const { post_id, confirm } = await req.json()
    if (!post_id) return jsonResponse({ error: 'post_id_required' }, 400, origin)
    if (confirm !== true) {
      return jsonResponse({ error: 'confirm_required', message: 'Pass confirm:true for live publish.' }, 400, origin)
    }

    const admin = serviceClient()
    const { data: settings } = await admin.from('app_settings').select('*').eq('owner_id', userId).single()
    if (settings?.dry_run) {
      return jsonResponse({ error: 'dry_run_enabled', message: 'Disable dry-run in Settings before live publish.' }, 400, origin)
    }

    const { data: post } = await admin.from('posts').select('*').eq('id', post_id).eq('owner_id', userId).maybeSingle()
    if (!post) return jsonResponse({ error: 'not_found' }, 404, origin)

    await admin.from('posts').update({ status: 'PUBLISHING', claimed_at: new Date().toISOString() }).eq('id', post_id)

    const { data: conn } = await admin
      .from('oauth_connections')
      .select('*')
      .eq('owner_id', userId)
      .eq('provider', 'linkedin')
      .maybeSingle()

    if (!conn?.token_ciphertext || !conn.member_urn) {
      await admin.from('posts').update({ status: 'NEEDS_REAUTH' }).eq('id', post_id)
      return jsonResponse({ error: 'needs_reauth' }, 400, origin)
    }

    const token = await decryptSecret(
      { iv_b64: conn.token_iv!, ciphertext_b64: conn.token_ciphertext },
      env('TOKEN_ENCRYPTION_KEY'),
    )

    const attemptKey = `manual-publish:${post_id}:${Date.now()}`
    await admin.from('publishing_attempts').insert({
      owner_id: userId,
      post_id,
      attempt_number: (post.retry_count ?? 0) + 1,
      idempotency_key: attemptKey,
      status: 'started',
      dry_run: false,
    })

    const result = await publishTextPost({
      accessToken: token,
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
        })
        .eq('id', post_id)
      await admin
        .from('publishing_attempts')
        .update({ status: 'success', linkedin_post_urn: result.urn, http_status: result.status, finished_at: new Date().toISOString() })
        .eq('idempotency_key', attemptKey)

      const hash = await sha256Hex(normalizeForHash(post.full_text))
      await admin.from('content_memory').upsert(
        {
          owner_id: userId,
          post_id,
          topic: post.topic,
          pillar: post.pillar_slug,
          angle: post.angle,
          keywords: extractKeywords(post.full_text),
          hook_fingerprint: hookFingerprint(post.hook || post.full_text),
          word_count: post.full_text.split(/\s+/).length,
          normalized_hash: hash,
          body_sample: post.full_text.slice(0, 500),
          source: 'published',
        },
        { onConflict: 'owner_id,normalized_hash' },
      )

      return jsonResponse({ ok: true, urn: result.urn, url: result.url, message: `Published. Open: ${result.url}` }, 200, origin)
    }

    const failure = classifyLinkedInFailure(result.status, result.unknown)
    const status =
      failure === 'unknown' ? 'UNKNOWN_OUTCOME' : failure === 'auth' ? 'NEEDS_REAUTH' : 'FAILED'
    await admin.from('posts').update({ status, last_error: result.body.slice(0, 300) }).eq('id', post_id)
    await admin
      .from('publishing_attempts')
      .update({
        status: failure === 'unknown' ? 'unknown' : 'failed',
        failure_class: failure,
        http_status: result.status,
        error_summary: result.body.slice(0, 300),
        finished_at: new Date().toISOString(),
      })
      .eq('idempotency_key', attemptKey)

    // Surface LinkedIn errors as 4xx so the dashboard shows the real reason
    const httpStatus = result.status === 426 ? 400 : 502
    return jsonResponse(
      {
        ok: false,
        error: 'linkedin_publish_failed',
        message: result.body.slice(0, 280),
        status,
        detail: result.body.slice(0, 200),
      },
      httpStatus,
      origin,
    )
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})
