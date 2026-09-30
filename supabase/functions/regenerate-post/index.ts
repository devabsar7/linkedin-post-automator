import { AuthError, handleOptions, jsonResponse, requireOwner, serviceClient } from '../_shared/http.ts'
import { env } from '../_shared/http.ts'
import { chatJson, parseJsonObject } from '../_shared/llm.ts'
import { runDeterministicQualityGate, hookFingerprint, extractKeywords, normalizeForHash, sanitizeResearchCites } from '../_shared/quality.ts'
import { sha256Hex } from '../_shared/rss.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    const { userId } = await requireOwner(req)
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)
    const { post_id } = await req.json()
    if (!post_id) return jsonResponse({ error: 'post_id_required' }, 400, origin)

    const admin = serviceClient()
    const { data: post } = await admin.from('posts').select('*').eq('id', post_id).eq('owner_id', userId).maybeSingle()
    if (!post) return jsonResponse({ error: 'not_found' }, 404, origin)

    const { data: settings } = await admin.from('app_settings').select('*').eq('owner_id', userId).single()
    const { data: brand } = await admin.from('brand_profiles').select('*').eq('owner_id', userId).single()
    const { data: memory } = await admin
      .from('content_memory')
      .select('topic, pillar, angle, hook_fingerprint, body_sample')
      .eq('owner_id', userId)
      .order('published_or_imported_at', { ascending: false })
      .limit(20)
    const { data: research } = await admin
      .from('research_items')
      .select('id, title, snippet, source_name')
      .eq('owner_id', userId)
      .order('retrieved_at', { ascending: false })
      .limit(12)

    const model =
      settings?.groq_model ||
      env('GEMINI_MODEL', false) ||
      env('GROQ_MODEL', false) ||
      'gemini-3.5-flash-lite'

    const brandCompact = brand
      ? {
          display_name: brand.display_name,
          headline: brand.headline,
          voice: brand.voice,
          about: typeof brand.about === 'string' ? brand.about.slice(0, 400) : brand.about,
          do_not_claim: brand.do_not_claim,
        }
      : null

    const result = await chatJson({
      model,
      system: `Regenerate one LinkedIn post as JSON with keys: pillar_slug, topic, angle, hook, body, cta, hashtags, full_text, evergreen, research_cites, keywords. Length ${settings?.char_min}-${settings?.char_max}.
Scope (STRICT): AI domains only (LLMs, GenAI, ML/DL, agents, research). No web/UI/app design topics.
research_cites must use real research ids from input only, else []. Voice of Absar Alam — humble, practical, no fabrication.`,
      user: JSON.stringify({
        previous: { topic: post.topic, angle: post.angle, pillar_slug: post.pillar_slug },
        brand: brandCompact,
        research: (research ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          snippet: typeof r.snippet === 'string' ? r.snippet.slice(0, 160) : r.snippet,
        })),
        avoid_memory: (memory ?? []).slice(0, 8).map((m) => ({
          topic: m.topic,
          pillar: m.pillar,
          angle: m.angle,
          hook_fingerprint: m.hook_fingerprint,
        })),
      }),
      maxOutputTokens: 2000,
    })

    const draft = parseJsonObject(result.content) as Record<string, unknown>
    const researchIdSet = new Set((research ?? []).map((r) => r.id as string))
    const cites = sanitizeResearchCites(draft.research_cites, researchIdSet)
    const shaped = {
      pillar_slug: String(draft.pillar_slug ?? post.pillar_slug ?? ''),
      topic: String(draft.topic ?? post.topic ?? ''),
      angle: String(draft.angle ?? post.angle ?? ''),
      hook: String(draft.hook ?? ''),
      body: String(draft.body ?? ''),
      cta: String(draft.cta ?? ''),
      hashtags: Array.isArray(draft.hashtags) ? (draft.hashtags as string[]) : [],
      full_text: String(draft.full_text ?? ''),
      evergreen: Boolean(draft.evergreen) || cites.length === 0,
      research_cites: cites,
    }

    const gate = runDeterministicQualityGate(shaped, memory ?? [], researchIdSet, {
      charMin: settings?.char_min ?? 700,
      charMax: settings?.char_max ?? 1300,
    })

    const { data: versions } = await admin
      .from('post_versions')
      .select('version_number')
      .eq('post_id', post_id)
      .order('version_number', { ascending: false })
      .limit(1)
    const nextVer = (versions?.[0]?.version_number ?? 0) + 1

    const status = gate.passed
      ? settings?.publishing_mode === 'auto'
        ? 'SCHEDULED'
        : 'READY_FOR_REVIEW'
      : 'DRAFT'

    await admin
      .from('posts')
      .update({
        full_text: shaped.full_text,
        hook: shaped.hook,
        topic: shaped.topic,
        angle: shaped.angle,
        pillar_slug: shaped.pillar_slug,
        evergreen: shaped.evergreen,
        research_cites: shaped.research_cites,
        validation_report: { deterministic: gate, passed: gate.passed, provider: result.provider },
        status,
      })
      .eq('id', post_id)

    await admin.from('post_versions').insert({
      owner_id: userId,
      post_id,
      version_number: nextVer,
      full_text: shaped.full_text,
      source: 'regenerate',
    })

    const hash = await sha256Hex(normalizeForHash(shaped.full_text))
    await admin.from('content_memory').upsert(
      {
        owner_id: userId,
        post_id,
        topic: shaped.topic,
        pillar: shaped.pillar_slug,
        angle: shaped.angle,
        keywords: extractKeywords(shaped.full_text),
        hook_fingerprint: hookFingerprint(shaped.hook),
        word_count: shaped.full_text.split(/\s+/).length,
        normalized_hash: hash,
        body_sample: shaped.full_text.slice(0, 500),
        source: 'generated',
      },
      { onConflict: 'owner_id,normalized_hash', ignoreDuplicates: true },
    )

    return jsonResponse({ ok: true, status, passed: gate.passed, issues: gate.issues }, 200, origin)
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})
