import { AuthError, handleOptions, jsonResponse, requireOwner, serviceClient } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    const { userId } = await requireOwner(req)
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)

    const admin = serviceClient()
    await admin
      .from('oauth_connections')
      .update({
        token_iv: null,
        token_ciphertext: null,
        refresh_iv: null,
        refresh_ciphertext: null,
        token_expires_at: null,
        member_urn: null,
        health: 'disconnected',
        oauth_state: null,
        pkce_verifier: null,
        updated_at: new Date().toISOString(),
      })
      .eq('owner_id', userId)
      .eq('provider', 'linkedin')

    await admin.from('app_settings').update({ auto_publish_paused: true }).eq('owner_id', userId)

    return jsonResponse({ ok: true, health: 'disconnected' }, 200, origin)
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})
