import { AuthError, env, handleOptions, jsonResponse, requireOwner, serviceClient } from '../_shared/http.ts'
import { randomUrlSafe } from '../_shared/crypto.ts'
import { linkedinAuthUrl } from '../_shared/linkedin.ts'
import { logJson } from '../_shared/redact.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')
  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)
    const { userId } = await requireOwner(req)

    const state = randomUrlSafe(24)
    const expires = new Date(Date.now() + 10 * 60_000).toISOString()

    const admin = serviceClient()
    await admin.from('oauth_connections').upsert(
      {
        owner_id: userId,
        provider: 'linkedin',
        oauth_state: state,
        oauth_state_expires_at: expires,
        // Confidential client + client_secret: do not use PKCE (LinkedIn often rejects it).
        pkce_verifier: null,
        health: 'disconnected',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,provider' },
    )

    const url = linkedinAuthUrl({
      clientId: env('LINKEDIN_CLIENT_ID'),
      redirectUri: env('LINKEDIN_REDIRECT_URI'),
      state,
    })

    logJson('info', 'linkedin_oauth_start', { ownerId: userId })
    return jsonResponse({ authorize_url: url }, 200, origin)
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, status, origin)
  }
})
