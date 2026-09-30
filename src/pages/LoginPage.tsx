import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { invokeFunction } from '@/lib/supabase'
import { Button, Card, Input, Label, Shell } from '@/components/ui'

export function LoginPage() {
  const { user, loading, configured, bootstrapCompleted, signIn, refreshBootstrap } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bootstrapSecret, setBootstrapSecret] = useState('')
  const [mode, setMode] = useState<'login' | 'bootstrap'>('login')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'bootstrap') {
        await invokeFunction('bootstrap-owner', {
          email,
          password,
          bootstrap_secret: bootstrapSecret,
        })
        await refreshBootstrap()
        await signIn(email, password)
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">LinkedIn Content OS</p>
          <h1 className="font-display mt-2 text-4xl font-bold">Absar Alam</h1>
          <p className="mt-2 text-[var(--muted)]">
            Private research → draft → schedule → publish dashboard. Single owner. Zero subscription stack.
          </p>
        </div>
        <Card>
          {!configured ? (
            <p className="text-sm text-[var(--warn)]">
              Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> before signing in.
            </p>
          ) : null}
          <div className="mb-4 flex gap-2">
            <Button variant={mode === 'login' ? 'primary' : 'secondary'} type="button" onClick={() => setMode('login')}>
              Sign in
            </Button>
            {bootstrapCompleted === false ? (
              <Button
                variant={mode === 'bootstrap' ? 'primary' : 'secondary'}
                type="button"
                onClick={() => setMode('bootstrap')}
              >
                First-time bootstrap
              </Button>
            ) : null}
          </div>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <Label>Email</Label>
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
              />
            </div>
            {mode === 'bootstrap' ? (
              <div>
                <Label>Bootstrap secret</Label>
                <Input
                  type="password"
                  value={bootstrapSecret}
                  onChange={(e) => setBootstrapSecret(e.target.value)}
                  required
                  minLength={16}
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  One-time server secret. Never commit it. Bootstrap disables itself after success.
                </p>
              </div>
            ) : null}
            {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
            <Button type="submit" disabled={busy || !configured} className="w-full">
              {busy ? 'Working…' : mode === 'bootstrap' ? 'Create owner account' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </Shell>
  )
}
