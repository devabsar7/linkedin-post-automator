import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export function env(name: string, required = true): string {
  const v = Deno.env.get(name)
  if (required && !v) throw new Error(`Missing env ${name}`)
  return v ?? ''
}

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient(authHeader?: string | null): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function corsHeaders(origin?: string | null): Record<string, string> {
  const allowed = env('APP_BASE_URL', false) || '*'
  return {
    'Access-Control-Allow-Origin': origin && allowed !== '*' ? (origin === allowed ? origin : allowed) : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-bootstrap-secret',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  }
}

export function jsonResponse(body: unknown, status = 200, origin?: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

export function redirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: url } })
}

export async function requireOwner(req: Request): Promise<{ userId: string; client: SupabaseClient }> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) throw new AuthError('Missing bearer token')
  const client = anonClient(auth)
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new AuthError('Invalid session')
  const ownerEmail = Deno.env.get('OWNER_EMAIL')
  if (ownerEmail && data.user.email && data.user.email.toLowerCase() !== ownerEmail.toLowerCase()) {
    throw new AuthError('Not the configured owner')
  }
  return { userId: data.user.id, client }
}

export class AuthError extends Error {
  status = 401
  constructor(message: string) {
    super(message)
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let acc = 0
    for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i)
    return false
  }
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export function requireCron(req: Request): void {
  const secret = env('CRON_INTERNAL_SECRET')
  const provided = req.headers.get('X-Cron-Secret') ?? ''
  if (!timingSafeEqual(provided, secret)) {
    throw new AuthError('Invalid cron secret')
  }
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req.headers.get('Origin')) })
  }
  return null
}
