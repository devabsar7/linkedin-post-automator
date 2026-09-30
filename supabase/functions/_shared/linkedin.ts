import { logJson } from './redact.ts'

export const LINKEDIN_SCOPES = 'openid profile w_member_social'

export function linkedinAuthUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge?: string
}): string {
  const u = new URL('https://www.linkedin.com/oauth/v2/authorization')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', params.clientId)
  u.searchParams.set('redirect_uri', params.redirectUri)
  u.searchParams.set('state', params.state)
  u.searchParams.set('scope', LINKEDIN_SCOPES)
  if (params.codeChallenge) {
    u.searchParams.set('code_challenge', params.codeChallenge)
    u.searchParams.set('code_challenge_method', 'S256')
  }
  return u.toString()
}

export type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  id_token?: string
}

export async function exchangeLinkedInCode(params: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
  codeVerifier?: string
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  })
  if (params.codeVerifier) body.set('code_verifier', params.codeVerifier)

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const t = await res.text()
    logJson('error', 'linkedin_token_exchange_failed', { status: res.status, body: t.slice(0, 200) })
    throw new Error(`token_exchange_${res.status}`)
  }
  return await res.json()
}

export type OidcUserinfo = {
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  email?: string
}

export async function fetchLinkedInUserinfo(accessToken: string): Promise<OidcUserinfo> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`userinfo_${res.status}`)
  return await res.json()
}

export function personUrnFromSub(sub: string): string {
  if (sub.startsWith('urn:li:person:')) return sub
  return `urn:li:person:${sub}`
}

export type PublishResult =
  | { ok: true; urn: string; url: string; status: number }
  | { ok: false; status: number | null; body: string; unknown: boolean }

/** Human-openable LinkedIn feed URL (do not fully encode the URN). */
export function linkedInFeedUrl(urn: string): string {
  const clean = urn.trim()
  if (!clean) return ''
  // LinkedIn web expects colons in the path; encoding %3A often breaks the page.
  return `https://www.linkedin.com/feed/update/${clean}`
}

export async function publishTextPost(params: {
  accessToken: string
  authorUrn: string
  text: string
  linkedinVersion: string
  timeoutMs?: number
}): Promise<PublishResult> {
  // LinkedIn expects YYYYMM (e.g. 202609). Older secrets may be YYYYMMDD.
  const version = String(params.linkedinVersion || '202609').replace(/\D/g, '').slice(0, 6) || '202609'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 20_000)
  try {
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'Linkedin-Version': version,
      },
      body: JSON.stringify({
        author: params.authorUrn,
        commentary: params.text,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    })

    const body = await res.text()
    if (res.status === 0) {
      return { ok: false, status: null, body: 'empty_status', unknown: true }
    }

    if (res.ok || res.status === 201) {
      const urn =
        res.headers.get('x-restli-id') ||
        res.headers.get('X-RestLi-Id') ||
        safeJsonId(body) ||
        ''
      if (!urn.startsWith('urn:li:')) {
        // Treat missing post id as failure — avoids false PUBLISHED in the dashboard.
        return {
          ok: false,
          status: res.status,
          body: `missing_post_urn:${body.slice(0, 200)}`,
          unknown: true,
        }
      }

      // Best-effort verify the post is readable as AUTHOR (does not require r_member_social list).
      const verified = await verifyLinkedInPost({
        accessToken: params.accessToken,
        urn,
        linkedinVersion: version,
      })
      if (!verified.ok) {
        logJson('warn', 'linkedin_post_verify_failed', { urn, detail: verified.detail.slice(0, 160) })
      }

      return { ok: true, urn, url: linkedInFeedUrl(urn), status: res.status }
    }

    // Ambiguous: timeout aborted after request may have succeeded — caller should check AbortError separately
    return {
      ok: false,
      status: res.status,
      body: body.slice(0, 400),
      unknown: false,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Abort / network after send → unknown outcome risk
    return { ok: false, status: null, body: msg, unknown: true }
  } finally {
    clearTimeout(timer)
  }
}

async function verifyLinkedInPost(params: {
  accessToken: string
  urn: string
  linkedinVersion: string
}): Promise<{ ok: boolean; detail: string }> {
  try {
    const encoded = encodeURIComponent(params.urn)
    const res = await fetch(
      `https://api.linkedin.com/rest/posts/${encoded}?viewContext=AUTHOR`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Linkedin-Version': params.linkedinVersion,
        },
      },
    )
    const text = await res.text()
    if (!res.ok) return { ok: false, detail: `verify_http_${res.status}:${text.slice(0, 120)}` }
    return { ok: true, detail: text.slice(0, 80) }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

function safeJsonId(body: string): string | null {
  try {
    const j = JSON.parse(body)
    return typeof j.id === 'string' ? j.id : null
  } catch {
    return null
  }
}

export type FailureClass = 'transient' | 'auth' | 'permanent' | 'unknown'

export function classifyLinkedInFailure(status: number | null, unknown = false): FailureClass {
  if (unknown || status === null) return 'unknown'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429 || status >= 500) return 'transient'
  if (status >= 400 && status < 500) return 'permanent'
  return 'unknown'
}

export function nextRetryAt(attemptNumber: number, now = new Date(), baseMs = 60_000, maxMs = 3_600_000): Date {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attemptNumber - 1))
  const jitter = Math.floor(Math.random() * Math.min(5_000, exp * 0.2))
  return new Date(now.getTime() + exp + jitter)
}
