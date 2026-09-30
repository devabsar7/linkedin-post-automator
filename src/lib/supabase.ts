import { createClient } from '@supabase/supabase-js'
import type { Database } from '@shared/database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient<Database>(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

export async function invokeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} })

  const payload = (data && typeof data === 'object' ? data : null) as {
    ok?: boolean
    error?: string
    message?: string
    detail?: string
  } | null

  if (error) {
    const ctx = (error as { context?: Response }).context
    let detail: string | null = null
    if (ctx) {
      try {
        const clone = ctx.clone?.() ?? ctx
        const text = await clone.text()
        if (text) {
          try {
            const parsed = JSON.parse(text) as { error?: string; message?: string; detail?: string }
            detail =
              (typeof parsed.message === 'string' && parsed.message) ||
              (typeof parsed.error === 'string' && parsed.error) ||
              (typeof parsed.detail === 'string' && parsed.detail) ||
              text.slice(0, 400)
          } catch {
            detail = text.slice(0, 400)
          }
        }
      } catch {
        // ignore
      }
    }
    if (!detail && payload) {
      detail =
        (typeof payload.message === 'string' && payload.message) ||
        (typeof payload.error === 'string' && payload.error) ||
        (typeof payload.detail === 'string' && payload.detail) ||
        null
    }
    throw new Error(detail || error.message || `Function ${name} failed`)
  }

  if (payload && payload.ok === false) {
    throw new Error(
      (typeof payload.message === 'string' && payload.message) ||
        (typeof payload.error === 'string' && payload.error) ||
        (typeof payload.detail === 'string' && payload.detail) ||
        `Function ${name} failed`,
    )
  }

  return data as T
}
