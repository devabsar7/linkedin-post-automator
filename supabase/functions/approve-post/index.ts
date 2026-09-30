import { AuthError, handleOptions, jsonResponse, requireOwner, serviceClient } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    const { userId } = await requireOwner(req)
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)
    const body = await req.json()
    const postId = body.post_id as string
    const action = String(body.action ?? 'approve') as
      | 'approve'
      | 'skip'
      | 'reject'
      | 'schedule'
      | 'reschedule'
    const scheduledAt = body.scheduled_at as string | undefined
    const fullText = body.full_text as string | undefined

    if (!postId) return jsonResponse({ error: 'post_id_required' }, 400, origin)

    const admin = serviceClient()
    const { data: post } = await admin.from('posts').select('*').eq('id', postId).eq('owner_id', userId).maybeSingle()
    if (!post) return jsonResponse({ error: 'not_found' }, 404, origin)

    if (post.status === 'PUBLISHED' && (action === 'approve' || action === 'schedule' || action === 'reschedule')) {
      return jsonResponse({ error: 'already_published', message: 'Published posts cannot be rescheduled.' }, 400, origin)
    }

    const patch: Record<string, unknown> = {}
    if (typeof fullText === 'string' && action !== 'reschedule') {
      patch.full_text = fullText
      const { data: versions } = await admin
        .from('post_versions')
        .select('version_number')
        .eq('post_id', postId)
        .order('version_number', { ascending: false })
        .limit(1)
      await admin.from('post_versions').insert({
        owner_id: userId,
        post_id: postId,
        version_number: (versions?.[0]?.version_number ?? 0) + 1,
        full_text: fullText,
        source: 'edit',
      })
    }

    if (action === 'reschedule') {
      if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
        return jsonResponse({ error: 'scheduled_at_required' }, 400, origin)
      }
      patch.scheduled_at = new Date(scheduledAt).toISOString()
      // Keep SCHEDULED if already queued; otherwise only store the time for later approve.
      if (post.status === 'SCHEDULED' || post.status === 'READY_FOR_REVIEW' || post.status === 'DRAFT') {
        // leave status as-is for DRAFT/READY; bump READY/DRAFT times without forcing publish queue unless already SCHEDULED
      }
    } else if (action === 'approve' || action === 'schedule') {
      patch.status = 'SCHEDULED'
      if (scheduledAt && !Number.isNaN(Date.parse(scheduledAt))) {
        patch.scheduled_at = new Date(scheduledAt).toISOString()
      } else if (!post.scheduled_at) {
        patch.scheduled_at = new Date(Date.now() + 3600_000).toISOString()
      }
    } else if (action === 'skip') {
      patch.status = 'SKIPPED'
    } else if (action === 'reject') {
      patch.status = 'REJECTED'
    }

    await admin.from('posts').update(patch).eq('id', postId)
    return jsonResponse({ ok: true, ...patch }, 200, origin)
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})
