import { AuthError, handleOptions, jsonResponse, requireOwner, serviceClient } from '../_shared/http.ts'
import { decryptSecret } from '../_shared/crypto.ts'
import { env } from '../_shared/http.ts'
import { fetchLinkedInUserinfo } from '../_shared/linkedin.ts'
import { logJson } from '../_shared/redact.ts'

function deriveHealth(expiresAt: string | null): string {
  if (!expiresAt) return 'disconnected'
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  if (ms < 3 * 24 * 60 * 60 * 1000) return 'expiring'
  return 'connected'
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    const { userId } = await requireOwner(req)
    const admin = serviceClient()
    const { data: conn } = await admin
      .from('oauth_connections')
      .select('*')
      .eq('owner_id', userId)
      .eq('provider', 'linkedin')
      .maybeSingle()

    if (!conn || !conn.token_ciphertext || !conn.token_iv) {
      return jsonResponse({ health: 'disconnected', live_check: false }, 200, origin)
    }

    let health = deriveHealth(conn.token_expires_at)
    let live_check = false
    let live_ok = false

    const url = new URL(req.url)
    const live = url.searchParams.get('live') === '1' || req.method === 'POST'

    if (live && health !== 'expired') {
      try {
        const token = await decryptSecret(
          { iv_b64: conn.token_iv, ciphertext_b64: conn.token_ciphertext },
          env('TOKEN_ENCRYPTION_KEY'),
        )
        await fetchLinkedInUserinfo(token)
        live_check = true
        live_ok = true
        health = deriveHealth(conn.token_expires_at)
      } catch {
        live_check = true
        live_ok = false
        health = 'needs_reauth'
      }
    }

    await admin
      .from('oauth_connections')
      .update({ health, last_health_check_at: new Date().toISOString() })
      .eq('id', conn.id)

    if (health === 'needs_reauth' || health === 'expired' || health === 'revoked') {
      await admin.from('app_settings').update({ auto_publish_paused: true }).eq('owner_id', userId)
    }

    logJson('info', 'linkedin_health', { health, live_check, live_ok })
    return jsonResponse(
      {
        health,
        live_check,
        live_ok,
        token_expires_at: conn.token_expires_at,
        member_name: conn.member_name,
        member_urn: conn.member_urn,
      },
      200,
      origin,
    )
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})
