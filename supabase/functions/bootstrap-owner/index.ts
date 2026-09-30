import {
  AuthError,
  env,
  handleOptions,
  jsonResponse,
  serviceClient,
  timingSafeEqual,
} from '../_shared/http.ts'
import { logJson } from '../_shared/redact.ts'

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const origin = req.headers.get('Origin')

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, origin)

    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const bootstrapSecret = String(body.bootstrap_secret ?? req.headers.get('X-Bootstrap-Secret') ?? '')

    const expectedSecret = env('BOOTSTRAP_SECRET')
    const ownerEmail = env('OWNER_EMAIL').toLowerCase()

    if (!timingSafeEqual(bootstrapSecret, expectedSecret)) {
      return jsonResponse({ error: 'invalid_bootstrap_secret' }, 403, origin)
    }
    if (email !== ownerEmail) {
      return jsonResponse({ error: 'email_must_match_OWNER_EMAIL' }, 400, origin)
    }
    if (password.length < 10) {
      return jsonResponse({ error: 'password_too_short' }, 400, origin)
    }

    const admin = serviceClient()
    const { data: state } = await admin.from('bootstrap_state').select('completed').eq('id', true).maybeSingle()
    if (state?.completed) {
      return jsonResponse({ error: 'bootstrap_already_completed' }, 409, origin)
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      logJson('error', 'bootstrap_create_user_failed', { message: createErr?.message })
      return jsonResponse({ error: 'create_user_failed', detail: createErr?.message }, 500, origin)
    }

    const ownerId = created.user.id
    const { error: seedErr } = await admin.rpc('seed_owner_defaults', { p_owner_id: ownerId })
    if (seedErr) {
      logJson('error', 'bootstrap_seed_failed', { message: seedErr.message })
      return jsonResponse({ error: 'seed_failed', detail: seedErr.message }, 500, origin)
    }

    await admin
      .from('bootstrap_state')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', true)

    logJson('info', 'bootstrap_completed', { ownerId })
    return jsonResponse({ ok: true, owner_id: ownerId }, 200, origin)
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500
    logJson('error', 'bootstrap_error', { message: e instanceof Error ? e.message : String(e) })
    return jsonResponse({ error: 'bootstrap_failed' }, status, origin)
  }
})
