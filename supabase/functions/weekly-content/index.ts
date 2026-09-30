import {
  AuthError,
  env,
  handleOptions,
  jsonResponse,
  requireCron,
  requireOwner,
  serviceClient,
} from '../_shared/http.ts'
import { fetchFeedSafe, isStale, parseRssOrAtom, sha256Hex } from '../_shared/rss.ts'
import { chatJson, parseJsonObject } from '../_shared/llm.ts'
import { runDeterministicQualityGate, hookFingerprint, extractKeywords, normalizeForHash, sanitizeResearchCites } from '../_shared/quality.ts'
import { isoWeekKeyUtcMonday, scheduleWeekUtc, type ScheduleSlot } from '../_shared/schedule.ts'
import { logJson } from '../_shared/redact.ts'

const PROMPT_VERSION = 'v1.1.0-ai-focus'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  const started = Date.now()
  let contentRunId: string | null = null
  let adminClient: ReturnType<typeof serviceClient> | null = null
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const admin = serviceClient()
    adminClient = admin

    // Auth: cron secret (Monday job) OR logged-in owner (dashboard button)
    const cronHeader = req.headers.get('X-Cron-Secret')
    let ownerId: string
    let triggeredBy: 'cron' | 'owner' = 'cron'

    if (cronHeader) {
      requireCron(req)
      const { data: settingsRows } = await admin.from('app_settings').select('*').limit(1)
      const settingsRow = settingsRows?.[0]
      if (!settingsRow) {
        return jsonResponse({ error: 'no_owner_settings' }, 400, origin)
      }
      ownerId = settingsRow.owner_id as string
    } else {
      const owner = await requireOwner(req)
      ownerId = owner.userId
      triggeredBy = 'owner'
    }

    const { data: settings, error: settingsErr } = await admin
      .from('app_settings')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle()

    if (settingsErr || !settings) {
      return jsonResponse({ error: 'no_owner_settings' }, 400, origin)
    }

    const weekKey = isoWeekKeyUtcMonday()
    const force = body.force === true && triggeredBy === 'owner'
    const idem = String(
      body.idempotency_key ??
        (force ? `weekly-content:${weekKey}:manual:${Date.now()}` : `weekly-content:${weekKey}`),
    )

    const { data: existing } = await admin
      .from('content_runs')
      .select('id, status')
      .eq('owner_id', ownerId)
      .eq('iso_week_key', weekKey)
      .maybeSingle()

    const existingDone = existing && (existing.status === 'success' || existing.status === 'partial')
    const existingRetryable =
      existing && (existing.status === 'failed' || existing.status === 'running')

    // Only block Generate when a completed week already exists.
    if (existingDone && !force) {
      await admin.from('scheduler_runs').upsert(
        {
          owner_id: ownerId,
          job_name: 'weekly-content',
          idempotency_key: idem,
          outcome: 'skipped_idempotent',
          duration_ms: Date.now() - started,
          detail: { content_run_id: existing.id, status: existing.status, triggeredBy },
        },
        { onConflict: 'idempotency_key' },
      )
      return jsonResponse(
        {
          ok: true,
          skipped: true,
          reason: 'week_exists',
          content_run_id: existing.id,
          iso_week_key: weekKey,
          status: existing.status,
          message:
            'This ISO week already has posts. Open Calendar to review, or use Regenerate week.',
        },
        200,
        origin,
      )
    }

    // Force OR retry after failed/stuck running: clear prior drafts + run row.
    if (existing && (force || existingRetryable)) {
      await admin
        .from('posts')
        .delete()
        .eq('owner_id', ownerId)
        .eq('iso_week_key', weekKey)
        .in('status', ['DRAFT', 'READY_FOR_REVIEW', 'SCHEDULED', 'REJECTED', 'SKIPPED'])
      await admin.from('content_runs').delete().eq('id', existing.id)
    }

    const { data: run, error: runErr } = await admin
      .from('content_runs')
      .insert({
        owner_id: ownerId,
        iso_week_key: weekKey,
        idempotency_key: force || existingRetryable ? `weekly-content:${weekKey}:manual:${Date.now()}` : idem,
        status: 'running',
        prompt_version: PROMPT_VERSION,
        model: settings.groq_model || env('GEMINI_MODEL', false) || 'gemini-3.5-flash-lite',
      })
      .select('*')
      .single()

    if (runErr || !run) {
      throw new Error(runErr?.message ?? 'run_insert_failed')
    }
    contentRunId = run.id as string

    // Collect RSS
    const { data: feeds } = await admin
      .from('source_feeds')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('enabled', true)

    const allowHosts = new Set(
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

    const researchIds: string[] = []
    let evergreenNeeded = false

    for (const feed of feeds ?? []) {
      if (feed.cooldown_until && new Date(feed.cooldown_until).getTime() > Date.now()) continue
      const fetched = await fetchFeedSafe(feed.feed_url, allowHosts)
      if ('error' in fetched) {
        const failures = (feed.consecutive_failures ?? 0) + 1
        const cooldownHours = Math.min(48, 2 ** Math.min(failures, 5))
        await admin
          .from('source_feeds')
          .update({
            health_status: failures >= 3 ? 'cooldown' : 'failed',
            consecutive_failures: failures,
            last_error: fetched.error,
            last_health_at: new Date().toISOString(),
            cooldown_until: new Date(Date.now() + cooldownHours * 3600_000).toISOString(),
          })
          .eq('id', feed.id)
        continue
      }

      let items
      try {
        items = parseRssOrAtom(fetched.xml)
      } catch (e) {
        await admin
          .from('source_feeds')
          .update({
            health_status: 'failed',
            last_error: e instanceof Error ? e.message : 'parse_error',
            consecutive_failures: (feed.consecutive_failures ?? 0) + 1,
            last_health_at: new Date().toISOString(),
          })
          .eq('id', feed.id)
        continue
      }

      await admin
        .from('source_feeds')
        .update({
          health_status: 'healthy',
          consecutive_failures: 0,
          last_error: null,
          cooldown_until: null,
          last_health_at: new Date().toISOString(),
        })
        .eq('id', feed.id)

      for (const item of items) {
        if (isStale(item.publishedAt)) continue
        if (!item.title || !item.canonicalUrl.startsWith('https://')) continue
        const hash = await sha256Hex(`${item.canonicalUrl}|${item.title}`)
        const score = Number(feed.quality_score ?? 50) + Math.min(20, item.description.length / 40)
        const { data: inserted } = await admin
          .from('research_items')
          .upsert(
            {
              owner_id: ownerId,
              source_feed_id: feed.id,
              title: item.title.slice(0, 500),
              canonical_url: item.canonicalUrl,
              published_at: item.publishedAt?.toISOString() ?? null,
              source_name: feed.name,
              snippet: item.description,
              categories: item.categories.slice(0, 12),
              content_hash: hash,
              score,
              retrieved_at: new Date().toISOString(),
            },
            { onConflict: 'owner_id,canonical_url', ignoreDuplicates: true },
          )
          .select('id')
          .maybeSingle()
        if (inserted?.id) researchIds.push(inserted.id)
      }
    }

    const { data: research } = await admin
      .from('research_items')
      .select('id, title, snippet, source_name, canonical_url, published_at, score')
      .eq('owner_id', ownerId)
      .order('retrieved_at', { ascending: false })
      .limit(settings.max_research_items ?? 40)

    const healthyCount = research?.length ?? 0
    if (healthyCount < (settings.min_research_items ?? 5)) evergreenNeeded = true

    const { data: brand } = await admin.from('brand_profiles').select('*').eq('owner_id', ownerId).single()
    const { data: pillars } = await admin
      .from('content_pillars')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('enabled', true)
      .order('sort_order')

    const { data: memory } = await admin
      .from('content_memory')
      .select('topic, pillar, angle, keywords, hook_fingerprint, body_sample, normalized_hash')
      .eq('owner_id', ownerId)
      .order('published_or_imported_at', { ascending: false })
      .limit(40)

    const compactMemory = (memory ?? []).map((m) => ({
      topic: m.topic,
      pillar: m.pillar,
      angle: m.angle,
      keywords: m.keywords,
      hook_fingerprint: m.hook_fingerprint,
      date_hint: true,
    }))

    const researchPayload = (research ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      source_name: r.source_name,
      published_at: r.published_at,
      score: r.score,
    }))

    const model =
      (settings.groq_model as string) ||
      env('GEMINI_MODEL', false) ||
      env('GROQ_MODEL', false) ||
      'gemini-3.5-flash-lite'
    const tokenUsage: Record<string, unknown> = {}

    const brandCompact = brand
      ? {
          display_name: brand.display_name,
          headline: brand.headline,
          voice: brand.voice,
          about: typeof brand.about === 'string' ? brand.about.slice(0, 500) : brand.about,
          do_not_claim: brand.do_not_claim,
          preferred_cta: brand.preferred_cta,
        }
      : null
    const pillarsCompact = (pillars ?? []).map((p) => ({
      slug: p.slug,
      name: p.name,
      description: typeof p.description === 'string' ? p.description.slice(0, 160) : p.description,
    }))
    const researchCompact = researchPayload.slice(0, 12).map((r) => ({
      id: r.id,
      title: r.title,
      snippet: typeof r.snippet === 'string' ? r.snippet.slice(0, 180) : r.snippet,
      source_name: r.source_name,
      score: r.score,
    }))

    // Call 1 - strategy
    const strategySystem = `You are a LinkedIn content strategist for ${brand?.display_name ?? 'the owner'}.
Topic scope (STRICT): ONLY AI and its domains — LLMs, generative AI, ML/DL research, agentic systems, multimodal AI, AI safety/evals, RAG, fine-tuning, vector DBs, AI tooling for ML. 
FORBIDDEN topics: web UI/UX, app design, chat boxes/canvases as product design, frontend, general web/app development, generic career posts unrelated to AI.
Return ONLY valid JSON: {"opportunities":[...7 items...]}.
Each opportunity: pillar_slug, angle, topic, hook_direction, evergreen (bool), research_cites:[{research_item_id, claim_summary}].
Cite research_item_id ONLY using IDs from the provided research list. Never invent IDs. Never use null/undefined. If unsure, set evergreen=true and research_cites=[].
Never exaggerate credentials.`

    const s1 = await chatJson({
      model,
      system: strategySystem,
      user: JSON.stringify({
        brand: brandCompact,
        pillars: pillarsCompact,
        research: researchCompact,
        content_memory_compact: compactMemory.slice(0, 10),
        evergreenNeeded,
      }),
      maxOutputTokens: 2500,
    })
    tokenUsage.strategy = s1.usage
    const strategy = parseJsonObject(s1.content) as { opportunities?: unknown[] }
    const opportunities = Array.isArray(strategy.opportunities) ? strategy.opportunities.slice(0, 7) : []
    while (opportunities.length < 7) {
      opportunities.push({
        pillar_slug: pillars?.[opportunities.length % (pillars?.length || 1)]?.slug ?? 'llm-engineering',
        angle: 'Practical lesson from hands-on work',
        topic: 'Evergreen builder note',
        hook_direction: 'Share one concrete learning',
        evergreen: true,
        research_cites: [],
      })
    }

    for (let i = 0; i < 7; i++) {
      const o = opportunities[i] as Record<string, unknown>
      await admin.from('post_ideas').insert({
        owner_id: ownerId,
        content_run_id: run.id,
        slot_index: i,
        pillar_slug: String(o.pillar_slug ?? 'llm-engineering'),
        topic: String(o.topic ?? 'Topic'),
        angle: String(o.angle ?? 'Angle'),
        hook_direction: String(o.hook_direction ?? ''),
        evergreen: Boolean(o.evergreen),
        research_cites: o.research_cites ?? [],
      })
    }

    await new Promise((r) => setTimeout(r, 1200))

    // Call 2 - drafts in batches (keeps each request small)
    const draftSystem = `Write original LinkedIn posts as JSON {"drafts":[...]}.
Scope (STRICT): AI domains only (LLMs, GenAI, ML/DL, agents, research, AI systems). No web/app/UI/product-design posts.
Each draft: slot_index, pillar_slug, topic, angle, hook, body, cta, hashtags (0-3), full_text, evergreen, research_cites, keywords.
research_cites must use real research_item_id values from input only — otherwise use [] and evergreen=true.
full_text must combine hook, body, cta, hashtags. Length ${settings.char_min}-${settings.char_max} characters.
Voice: clear, practical, humble, credible. No fabricated metrics/clients/quotes. No clickbait.`

    const draftBatches = [
      opportunities.slice(0, 3),
      opportunities.slice(3, 5),
      opportunities.slice(5, 7),
    ]
    let drafts: unknown[] = []
    for (let b = 0; b < draftBatches.length; b++) {
      const batch = draftBatches[b]
      if (!batch.length) continue
      const d = await chatJson({
        model,
        system: draftSystem,
        user: JSON.stringify({
          opportunities: batch,
          brand: brandCompact,
          research: researchCompact.slice(0, 8),
        }),
        maxOutputTokens: 3500,
      })
      tokenUsage[`drafts_${b}`] = d.usage
      const parsed = parseJsonObject(d.content) as { drafts?: unknown[] }
      if (Array.isArray(parsed.drafts)) drafts = drafts.concat(parsed.drafts)
      await new Promise((r) => setTimeout(r, 1200))
    }

    // Call 3 - validate/fix
    const vSystem = `Validate/fix LinkedIn drafts. Return JSON {"results":[{slot_index, passed, issues[], revised_full_text?}]}.
Reject: non-AI topics (web/UI/app design), fabrication, missing evidence for factual claims, weak hooks, off-brand voice, duplicates vs content_memory.
If a draft drifts into web/app UI, rewrite it toward AI systems/research while keeping the slot.`
    const v3 = await chatJson({
      model,
      system: vSystem,
      user: JSON.stringify({
        drafts: drafts.map((d) => {
          const x = d as Record<string, unknown>
          return {
            slot_index: x.slot_index,
            pillar_slug: x.pillar_slug,
            topic: x.topic,
            full_text: String(x.full_text ?? '').slice(0, 1200),
            evergreen: x.evergreen,
            research_cites: x.research_cites,
          }
        }),
        brand: brandCompact,
        research_ids: researchCompact.map((r) => r.id),
        content_memory_compact: compactMemory.slice(0, 8),
      }),
      temperature: 0.2,
      maxOutputTokens: 3500,
    })
    tokenUsage.validation = v3.usage
    const validation = parseJsonObject(v3.content) as {
      results?: { slot_index: number; passed: boolean; issues?: string[]; revised_full_text?: string }[]
    }
    const results = validation.results ?? []

    const researchIdSet = new Set((research ?? []).map((r) => r.id as string))
    const slots = (settings.weekly_schedule as ScheduleSlot[]) ?? []
    const scheduleUtc = scheduleWeekUtc(slots)
    const mode = settings.publishing_mode as string
    let passedCount = 0

    for (let i = 0; i < 7; i++) {
      const raw = (drafts[i] ?? {}) as Record<string, unknown>
      const vr = results.find((r) => r.slot_index === i)
      let fullText = String(vr?.revised_full_text || raw.full_text || '')
      const cites = sanitizeResearchCites(raw.research_cites, researchIdSet)
      const hadInventedCites =
        Array.isArray(raw.research_cites) && raw.research_cites.length > 0 && cites.length === 0
      const evergreen = Boolean(raw.evergreen) || evergreenNeeded || hadInventedCites
      const draft = {
        pillar_slug: String(raw.pillar_slug ?? ''),
        topic: String(raw.topic ?? ''),
        angle: String(raw.angle ?? ''),
        hook: String(raw.hook ?? fullText.split('\n')[0] ?? ''),
        body: String(raw.body ?? ''),
        cta: String(raw.cta ?? ''),
        hashtags: Array.isArray(raw.hashtags) ? (raw.hashtags as string[]) : [],
        full_text: fullText,
        evergreen,
        research_cites: cites,
      }

      const gate = runDeterministicQualityGate(draft, memory ?? [], researchIdSet, {
        charMin: settings.char_min,
        charMax: settings.char_max,
      })
      const llmOk = vr?.passed !== false
      const passed = gate.passed && llmOk
      if (passed) passedCount++

      const status = passed
        ? mode === 'auto'
          ? 'SCHEDULED'
          : 'READY_FOR_REVIEW'
        : 'DRAFT'

      const { data: post } = await admin
        .from('posts')
        .insert({
          owner_id: ownerId,
          content_run_id: run.id,
          slot_index: i,
          status,
          pillar_slug: draft.pillar_slug,
          topic: draft.topic,
          angle: draft.angle,
          full_text: draft.full_text,
          hook: draft.hook,
          scheduled_at: scheduleUtc[i]?.toISOString() ?? null,
          evergreen: draft.evergreen,
          validation_report: {
            deterministic: gate,
            llm: vr ?? null,
            passed,
          },
          research_cites: draft.research_cites,
          iso_week_key: weekKey,
        })
        .select('id')
        .single()

      if (post) {
        await admin.from('post_versions').insert({
          owner_id: ownerId,
          post_id: post.id,
          version_number: 1,
          full_text: draft.full_text,
          source: 'generate',
        })

        const hash = await sha256Hex(normalizeForHash(draft.full_text))
        await admin.from('content_memory').upsert(
          {
            owner_id: ownerId,
            post_id: post.id,
            topic: draft.topic,
            pillar: draft.pillar_slug,
            angle: draft.angle,
            keywords: extractKeywords(draft.full_text),
            hook_fingerprint: hookFingerprint(draft.hook),
            word_count: draft.full_text.split(/\s+/).length,
            normalized_hash: hash,
            body_sample: draft.full_text.slice(0, 500),
            source: 'generated',
            published_or_imported_at: new Date().toISOString(),
          },
          { onConflict: 'owner_id,normalized_hash', ignoreDuplicates: true },
        )
      }
    }

    const runStatus = passedCount === 7 ? 'success' : passedCount > 0 ? 'partial' : 'failed'
    await admin
      .from('content_runs')
      .update({
        status: runStatus,
        token_usage: tokenUsage,
        latency_ms: Date.now() - started,
        research_item_ids: (research ?? []).map((r) => r.id),
        evergreen_used: evergreenNeeded,
        finished_at: new Date().toISOString(),
        model,
      })
      .eq('id', run.id)

    await admin.from('scheduler_runs').upsert(
      {
        owner_id: ownerId,
        job_name: 'weekly-content',
        idempotency_key: idem,
        outcome: runStatus === 'failed' ? 'failed' : 'success',
        duration_ms: Date.now() - started,
        detail: { content_run_id: run.id, passedCount, evergreenNeeded, triggeredBy, force },
      },
      { onConflict: 'idempotency_key' },
    )

    logJson('info', 'weekly_content_done', { weekKey, passedCount, evergreenNeeded, triggeredBy })
    return jsonResponse(
      {
        ok: true,
        skipped: false,
        content_run_id: run.id,
        iso_week_key: weekKey,
        passedCount,
        evergreenNeeded,
        status: runStatus,
        triggeredBy,
        message: `Generated ${passedCount}/7 posts for ${weekKey}.`,
      },
      200,
      origin,
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logJson('error', 'weekly_content_failed', { message })
    if (contentRunId && adminClient) {
      await adminClient
        .from('content_runs')
        .update({
          status: 'failed',
          error_summary: message.slice(0, 1000),
          finished_at: new Date().toISOString(),
        })
        .eq('id', contentRunId)
        .eq('status', 'running')
    }
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: message }, status, origin)
  }
})
