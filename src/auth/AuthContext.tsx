import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, rawSupabase } from '../lib/supabase'
import {
  buildDemoAuth, clearDemoSession, matchDemoCredentials, readDemoSession, writeDemoSession,
} from '../lib/mockData'

export type Role = 'admin' | 'teacher' | 'student'
export type Profile = { id: string; full_name: string | null; email: string | null; phone: string | null; role: Role; status: string; suspended_reason: string | null }

type Ctx = {
  session: Session | null
  profile: Profile | null
  role: Role | null
  loading: boolean
  recovering: boolean
  isDemo: boolean
  loginAsDemo: (role: Role) => void
  loginWithDemoCredentials: (email: string, password: string) => Role | null
  signOut: (everywhere?: boolean) => Promise<void>
  refreshProfile: () => Promise<void>
}

const C = createContext<Ctx>({
  session: null,
  profile: null,
  role: null,
  loading: true,
  recovering: false,
  isDemo: false,
  loginAsDemo: () => {},
  loginWithDemoCredentials: () => null,
  signOut: async () => {},
  refreshProfile: async () => {},
})

export const useAuth = () => useContext(C)

// Supports both live Supabase sessions and 100% frontend Client Preview demo sessions.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [isDemo, setIsDemo] = useState(false)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setLoading(false); return }
    const demo = readDemoSession()
    if (demo && s.user.id === demo.profile.id) {
      setProfile(demo.profile)
      setIsDemo(true)
      setLoading(false)
      return
    }
    if (!configured) {
      setProfile(null)
      setLoading(false)
      return
    }
    const { data } = await rawSupabase
      .from('profiles')
      .select('id, full_name, email, phone, role, status, suspended_reason')
      .eq('id', s.user.id)
      .maybeSingle()
    setProfile((data as Profile) ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    // Restore demo session immediately if present so portal refreshes stay signed in.
    const demo = readDemoSession()
    if (demo) {
      setSession(demo.session as unknown as Session)
      setProfile(demo.profile)
      setIsDemo(true)
      setLoading(false)
      return
    }

    if (!configured) {
      setLoading(false)
      return
    }

    rawSupabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session)
    })
    const { data: sub } = rawSupabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') loadProfile(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const loginAsDemo = useCallback((targetRole: Role) => {
    const authPayload = buildDemoAuth(targetRole)
    writeDemoSession(authPayload)
    setSession(authPayload.session as unknown as Session)
    setProfile(authPayload.profile)
    setIsDemo(true)
    setRecovering(false)
    setLoading(false)
  }, [])

  const loginWithDemoCredentials = useCallback((email: string, password: string): Role | null => {
    const matched = matchDemoCredentials(email, password)
    if (!matched) return null
    loginAsDemo(matched)
    return matched
  }, [loginAsDemo])

  const signOut = useCallback(async (everywhere = false) => {
    const wasDemo = isDemo || !!readDemoSession()
    clearDemoSession()
    setIsDemo(false)
    if (configured && !wasDemo) {
      await rawSupabase.auth.signOut({ scope: everywhere ? 'global' : 'local' }).catch(() => {})
    }
    setSession(null)
    setProfile(null)
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  }, [isDemo])

  return (
    <C.Provider
      value={{
        session,
        profile,
        loading,
        recovering,
        isDemo,
        role: profile?.status === 'active' ? profile.role : null,
        loginAsDemo,
        loginWithDemoCredentials,
        signOut,
        refreshProfile: () => loadProfile(session),
      }}
    >
      {children}
    </C.Provider>
  )
}
