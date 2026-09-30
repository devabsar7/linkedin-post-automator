import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'

type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
  configured: boolean
  bootstrapCompleted: boolean | null
  refreshBootstrap: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootstrapCompleted, setBootstrapCompleted] = useState<boolean | null>(null)

  const refreshBootstrap = useCallback(async () => {
    if (!supabaseConfigured) {
      setBootstrapCompleted(false)
      return
    }
    const { data, error } = await supabase.from('bootstrap_state').select('completed').eq('id', true).maybeSingle()
    if (error) {
      setBootstrapCompleted(null)
      return
    }
    setBootstrapCompleted(Boolean(data?.completed))
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    void refreshBootstrap()
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [refreshBootstrap])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: supabaseConfigured,
      bootstrapCompleted,
      refreshBootstrap,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [session, loading, bootstrapCompleted, refreshBootstrap],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside provider')
  return ctx
}
