import { env, redirect, serviceClient } from '../_shared/http.ts'
import { encryptSecret } from '../_shared/crypto.ts'
import {
  exchangeLinkedInCode,
  fetchLinkedInUserinfo,
  personUrnFromSub,
} from '../_shared/linkedin.ts'
import { logJson } from '../_shared/redact.ts'

Deno.serve(async (req) => {
  const appBase = env('APP_BASE_URL').replace(/\/$/, '')
  const settingsUrl = `${appBase}/settings`

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const err = url.searchParams.get('error')

    if (err) {
      return redirect(`${settingsUrl}?linkedin=error&reason=${encodeURIComponent(err)}`)
    }
    if (!code || !state) {
      return redirect(`${settingsUrl}?linkedin=error&reason=missing_code_or_state`)
    }

    const admin = serviceClient()
    const { data: conn } = await admin
      .from('oauth_connections')
      .select('*')
      .eq('oauth_state', state)
      .maybeSingle()

    if (!conn) {
      return redirect(`${settingsUrl}?linkedin=error&reason=invalid_state`)
    }
    if (conn.oauth_state_expires_at && new Date(conn.oauth_state_expires_at).getTime() < Date.now()) {
      return redirect(`${settingsUrl}?linkedin=error&reason=state_expired`)
    }

    let tokens
    try {
      tokens = await exchangeLinkedInCode({
        clientId: env('LINKEDIN_CLIENT_ID'),
        clientSecret: env('LINKEDIN_CLIENT_SECRET'),
        redirectUri: env('LINKEDIN_REDIRECT_URI'),
        code,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'token_exchange_failed'
      logJson('error', 'linkedin_token_exchange_failed', { message: msg })
      return redirect(`${settingsUrl}?linkedin=error&reason=${encodeURIComponent(msg)}`)
    }

    if (!tokens.access_token || !tokens.expires_in) {
      return redirect(`${settingsUrl}?linkedin=error&reason=bad_token_response`)
    }

    let userinfo
    try {
      userinfo = await fetchLinkedInUserinfo(tokens.access_token)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'userinfo_failed'
      logJson('error', 'linkedin_userinfo_failed', { message: msg })
      return redirect(`${settingsUrl}?linkedin=error&reason=${encodeURIComponent(msg)}`)
    }

    if (!userinfo.sub) {
      return redirect(`${settingsUrl}?linkedin=error&reason=missing_openid_sub`)
    }

    const memberUrn = personUrnFromSub(userinfo.sub)
    const encKey = env('TOKEN_ENCRYPTION_KEY')
    const accessEnc = await encryptSecret(tokens.access_token, encKey)
    let refreshIv: string | null = null
    let refreshCt: string | null = null
    if (tokens.refresh_token) {
      const r = await encryptSecret(tokens.refresh_token, encKey)
      refreshIv = r.iv_b64
      refreshCt = r.ciphertext_b64
    }

    const expiresAt = new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()

    const { error: updErr } = await admin
      .from('oauth_connections')
      .update({
        member_urn: memberUrn,
        member_name: userinfo.name ?? null,
        token_iv: accessEnc.iv_b64,
        token_ciphertext: accessEnc.ciphertext_b64,
        token_expires_at: expiresAt,
        refresh_iv: refreshIv,
        refresh_ciphertext: refreshCt,
        scopes: tokens.scope ?? 'openid profile w_member_social',
        health: 'connected',
        last_health_check_at: new Date().toISOString(),
        oauth_state: null,
        oauth_state_expires_at: null,
        pkce_verifier: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id)

    if (updErr) {
      logJson('error', 'linkedin_oauth_store_failed', { message: updErr.message })
      return redirect(`${settingsUrl}?linkedin=error&reason=store_failed`)
    }

    await admin
      .from('app_settings')
      .update({ auto_publish_paused: false })
      .eq('owner_id', conn.owner_id)

    logJson('info', 'linkedin_oauth_connected', { ownerId: conn.owner_id })
    return redirect(`${settingsUrl}?linkedin=connected`)
  } catch (e) {
    logJson('error', 'linkedin_oauth_callback_failed', {
      message: e instanceof Error ? e.message : String(e),
    })
    return redirect(`${settingsUrl}?linkedin=error&reason=callback_failed`)
  }
})
