import { env } from './http.ts'
import { geminiChatJson } from './gemini.ts'
import { groqChatJson, parseJsonObject } from './groq.ts'
import { logJson } from './redact.ts'

export { parseJsonObject }

export type ChatJsonResult = {
  content: string
  model: string
  usage?: Record<string, number>
  latencyMs: number
  provider: 'gemini' | 'groq'
}

function isGeminiFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /gemini_|UNAVAILABLE|high demand|no longer available/i.test(msg)
}

/**
 * Prefer Gemini when GEMINI_API_KEY is set.
 * If Gemini fails (outage, retired model, etc.), fall back to Groq when configured.
 */
export async function chatJson(params: {
  model?: string
  system: string
  user: string
  temperature?: number
  maxRetries?: number
  maxOutputTokens?: number
}): Promise<ChatJsonResult> {
  const geminiKey = env('GEMINI_API_KEY', false)
  const groqKey = env('GROQ_API_KEY', false)

  if (geminiKey) {
    const model =
      params.model && !params.model.includes('/') && !params.model.startsWith('llama') && !params.model.includes('2.0-flash')
        ? params.model
        : env('GEMINI_MODEL', false) || 'gemini-3.5-flash-lite'
    logJson('info', 'llm_provider', { provider: 'gemini', model })
    try {
      return await geminiChatJson({
        apiKey: geminiKey,
        model,
        system: params.system,
        user: params.user,
        temperature: params.temperature,
        maxRetries: params.maxRetries ?? 6,
        maxOutputTokens: params.maxOutputTokens ?? 4096,
      })
    } catch (e) {
      if (!groqKey || !isGeminiFailure(e)) throw e
      logJson('warn', 'llm_fallback_to_groq', {
        reason: e instanceof Error ? e.message.slice(0, 160) : String(e),
      })
    }
  }

  if (groqKey) {
    const model =
      env('GROQ_MODEL', false) ||
      (params.model?.includes('/') ? params.model : 'openai/gpt-oss-20b')
    logJson('info', 'llm_provider', { provider: 'groq', model })
    const r = await groqChatJson({
      apiKey: groqKey,
      model,
      system: params.system,
      user: params.user,
      temperature: params.temperature,
      maxRetries: params.maxRetries ?? 4,
    })
    return { ...r, provider: 'groq' }
  }

  throw new Error('Missing GEMINI_API_KEY (preferred) or GROQ_API_KEY')
}
