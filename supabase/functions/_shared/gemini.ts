import { logJson } from './redact.ts'
import { parseJsonObject } from './groq.ts'

export type LlmChatResult = {
  content: string
  model: string
  usage?: Record<string, number>
  latencyMs: number
  provider: 'gemini'
}

/** Current Gemini Flash IDs (retired 2.0-* removed). */
const GEMINI_MODEL_FALLBACKS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
] as const

function modelCandidates(preferred: string): string[] {
  const out: string[] = []
  for (const m of [preferred, ...GEMINI_MODEL_FALLBACKS]) {
    if (m && !out.includes(m)) out.push(m)
  }
  return out
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function geminiChatJson(params: {
  apiKey: string
  model: string
  system: string
  user: string
  temperature?: number
  maxRetries?: number
  maxOutputTokens?: number
}): Promise<LlmChatResult> {
  const maxRetries = params.maxRetries ?? 6
  const models = modelCandidates(params.model)
  let modelIdx = 0
  let attempt = 0
  let lastErr: Error | null = null

  while (attempt < maxRetries) {
    attempt++
    const model = models[Math.min(modelIdx, models.length - 1)]
    const started = Date.now()
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
        `?key=${encodeURIComponent(params.apiKey)}`

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.system }] },
          contents: [{ role: 'user', parts: [{ text: params.user }] }],
          generationConfig: {
            temperature: params.temperature ?? 0.4,
            maxOutputTokens: params.maxOutputTokens ?? 4096,
            responseMimeType: 'application/json',
          },
        }),
      })

      if (res.status === 429) {
        const waitMs = Math.min(45_000, 5_000 * attempt)
        logJson('warn', 'gemini_rate_limited', { waitMs, attempt, model })
        if (modelIdx < models.length - 1) modelIdx++
        await sleep(waitMs)
        continue
      }

      if (res.status === 503 || res.status === 500) {
        const text = await res.text()
        logJson('warn', 'gemini_unavailable', {
          status: res.status,
          attempt,
          model,
          preview: text.slice(0, 160),
        })
        lastErr = new Error(`gemini_http_${res.status}:${text.slice(0, 200)}`)
        if (modelIdx < models.length - 1) modelIdx++
        await sleep(Math.min(20_000, 2_500 * attempt))
        continue
      }

      if (!res.ok) {
        const text = await res.text()
        const missing =
          res.status === 404 ||
          text.includes('not found') ||
          text.includes('NOT_FOUND') ||
          text.includes('no longer available') ||
          text.includes('is not found for API version')
        if (missing && modelIdx < models.length - 1) {
          logJson('warn', 'gemini_model_fallback', { from: model, to: models[modelIdx + 1], attempt })
          modelIdx++
          continue
        }
        throw new Error(`gemini_http_${res.status}:${text.slice(0, 280)}`)
      }

      const data = await res.json()
      const blockReason = data?.promptFeedback?.blockReason
      if (blockReason) {
        throw new Error(`gemini_blocked:${blockReason}`)
      }

      const parts = data?.candidates?.[0]?.content?.parts
      const content = Array.isArray(parts)
        ? parts.map((p: { text?: string }) => p?.text ?? '').join('')
        : ''
      if (!content.trim()) {
        if (attempt < maxRetries) {
          if (modelIdx < models.length - 1) modelIdx++
          await sleep(800 * attempt)
          continue
        }
        throw new Error('gemini_empty_content')
      }

      try {
        parseJsonObject(content)
      } catch {
        if (attempt < maxRetries) {
          await sleep(600 * attempt)
          continue
        }
        throw new Error('gemini_unparseable_json')
      }

      const usageMeta = data?.usageMetadata
      const usage = usageMeta
        ? {
            prompt_tokens: Number(usageMeta.promptTokenCount ?? 0),
            completion_tokens: Number(usageMeta.candidatesTokenCount ?? 0),
            total_tokens: Number(usageMeta.totalTokenCount ?? 0),
          }
        : undefined

      return {
        content,
        model: data?.modelVersion ?? model,
        usage,
        latencyMs: Date.now() - started,
        provider: 'gemini',
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      const msg = lastErr.message
      const switchModel = /gemini_http_503|gemini_http_500|gemini_http_429|gemini_http_404|UNAVAILABLE|high demand|no longer available/i.test(
        msg,
      )
      if (switchModel && modelIdx < models.length - 1) modelIdx++
      if (attempt >= maxRetries) break
      await sleep(switchModel ? Math.min(15_000, 2_000 * attempt) : 500 * 2 ** Math.min(attempt - 1, 3))
    }
  }
  throw lastErr ?? new Error('gemini_failed')
}
