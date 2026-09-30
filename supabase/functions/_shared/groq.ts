import { logJson } from './redact.ts'

export type GroqChatResult = {
  content: string
  model: string
  usage?: Record<string, number>
  latencyMs: number
}

/** Models known to work on free Groq keys that lack Meta Llama access. */
export const GROQ_MODEL_FALLBACKS = [
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
] as const

type ResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema'
      json_schema: {
        name: string
        strict?: boolean
        schema: Record<string, unknown>
      }
    }

function modelCandidates(preferred: string): string[] {
  const out: string[] = []
  for (const m of [preferred, ...GROQ_MODEL_FALLBACKS]) {
    if (m && !out.includes(m)) out.push(m)
  }
  return out
}

export async function groqChatJson(params: {
  apiKey: string
  model: string
  system: string
  user: string
  temperature?: number
  maxRetries?: number
  jsonSchema?: {
    name: string
    strict?: boolean
    schema: Record<string, unknown>
  }
}): Promise<GroqChatResult> {
  const maxRetries = params.maxRetries ?? 5
  const models = modelCandidates(params.model)
  let modelIdx = 0
  let attempt = 0
  let lastErr: Error | null = null
  let useStructured = true

  while (attempt < maxRetries) {
    attempt++
    const model = models[Math.min(modelIdx, models.length - 1)]
    const started = Date.now()
    try {
      const responseFormat: ResponseFormat | undefined = !useStructured
        ? undefined
        : params.jsonSchema
          ? {
              type: 'json_schema',
              json_schema: {
                name: params.jsonSchema.name,
                strict: params.jsonSchema.strict ?? false,
                schema: params.jsonSchema.schema,
              },
            }
          : { type: 'json_object' }

      const body: Record<string, unknown> = {
        model,
        temperature: params.temperature ?? 0.4,
        max_tokens: 3500,
        messages: [
          {
            role: 'system',
            content: useStructured
              ? params.system
              : `${params.system}\n\nIMPORTANT: Reply with a single valid JSON object only. No markdown fences.`,
          },
          { role: 'user', content: params.user },
        ],
      }
      if (responseFormat) body.response_format = responseFormat

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') ?? '15')
        const waitMs = Math.min(
          90_000,
          Math.max(5_000, (Number.isFinite(retryAfter) ? retryAfter : 15) * 1000),
        )
        logJson('warn', 'groq_rate_limited', { waitMs, attempt, model })
        await sleep(waitMs)
        continue
      }

      if (!res.ok) {
        const text = await res.text()
        const isModelMissing =
          res.status === 404 ||
          text.includes('model_not_found') ||
          text.includes('does not exist') ||
          text.includes('do not have access')
        if (isModelMissing && modelIdx < models.length - 1) {
          logJson('warn', 'groq_model_fallback', {
            from: model,
            to: models[modelIdx + 1],
            attempt,
          })
          modelIdx++
          useStructured = true
          continue
        }

        const isJsonValidate =
          res.status === 400 &&
          (text.includes('json_validate_failed') || text.includes('Failed to validate JSON'))
        if (isJsonValidate && attempt < maxRetries) {
          logJson('warn', 'groq_json_validate_failed', { attempt, model, preview: text.slice(0, 180) })
          useStructured = false
          await sleep(800 * attempt)
          continue
        }
        throw new Error(`groq_http_${res.status}:${text.slice(0, 280)}`)
      }

      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        if (attempt < maxRetries) {
          useStructured = false
          await sleep(500 * attempt)
          continue
        }
        throw new Error('groq_empty_content')
      }

      try {
        parseJsonObject(content)
      } catch {
        if (attempt < maxRetries) {
          useStructured = false
          await sleep(500 * attempt)
          continue
        }
        throw new Error('groq_unparseable_json')
      }

      return {
        content,
        model: data.model ?? model,
        usage: data.usage,
        latencyMs: Date.now() - started,
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (attempt >= maxRetries) break
      await sleep(600 * 2 ** Math.min(attempt - 1, 4) + Math.floor(Math.random() * 250))
    }
  }
  throw lastErr ?? new Error('groq_failed')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim())
    }
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1))
    throw new Error('malformed_json')
  }
}
