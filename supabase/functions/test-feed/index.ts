import { AuthError, handleOptions, jsonResponse, requireOwner, serviceClient } from '../_shared/http.ts'
import { assertSafeHttpsUrl, fetchFeedSafe, parseRssOrAtom } from '../_shared/rss.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    const { userId } = await requireOwner(req)
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)
    const body = await req.json()
    const feedId = body.feed_id as string | undefined
    const feedUrl = body.feed_url as string | undefined

    const admin = serviceClient()
    let url = feedUrl
    let rowId: string | null = feedId ?? null

    if (feedId) {
      const { data } = await admin.from('source_feeds').select('*').eq('id', feedId).eq('owner_id', userId).maybeSingle()
      if (!data) return jsonResponse({ error: 'feed_not_found' }, 404, origin)
      url = data.feed_url
      rowId = data.id
    }
    if (!url) return jsonResponse({ error: 'feed_url_required' }, 400, origin)

    const { data: feeds } = await admin.from('source_feeds').select('feed_url').eq('owner_id', userId)
    const allow = new Set(
      (feeds ?? [])
        .map((f) => {
          try {
            return new URL(f.feed_url).hostname.toLowerCase()
          } catch {
            return ''
          }
        })
        .filter(Boolean),
    )
    // Allow testing a new URL only if HTTPS-safe; host must match existing allow-list OR be newly added via authenticated owner
    const safety = assertSafeHttpsUrl(url)
    if (!safety.ok) return jsonResponse({ ok: false, error: safety.reason }, 400, origin)
    allow.add(safety.url.hostname.toLowerCase())

    const fetched = await fetchFeedSafe(url, allow)
    if ('error' in fetched) {
      if (rowId) {
        await admin
          .from('source_feeds')
          .update({ health_status: 'failed', last_error: fetched.error, last_health_at: new Date().toISOString() })
          .eq('id', rowId)
      }
      return jsonResponse({ ok: false, error: fetched.error }, 200, origin)
    }

    const items = parseRssOrAtom(fetched.xml, 5)
    if (rowId) {
      await admin
        .from('source_feeds')
        .update({
          health_status: 'healthy',
          last_error: null,
          consecutive_failures: 0,
          last_health_at: new Date().toISOString(),
        })
        .eq('id', rowId)
    }

    return jsonResponse(
      {
        ok: true,
        item_count_sample: items.length,
        sample: items.slice(0, 3).map((i) => ({ title: i.title, url: i.canonicalUrl, publishedAt: i.publishedAt })),
      },
      200,
      origin,
    )
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})
