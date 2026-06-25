import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type AppRole = 'owner' | 'admin' | 'manager' | 'teacher' | 'front_desk'

type AuthContextValue = {
  session: Session | null
  user: User | null
  role: AppRole
  locatieId: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Închide tura curentă (pontaj manual) și apoi face sign-out. */
  endShift: () => Promise<void>
  /** Delogare automată după inactivitate (pontaj source='idle'). */
  idleLogout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function roleFromUser(user: User | null): AppRole {
  const r = user?.app_metadata?.role
  if (
    r === 'owner' ||
    r === 'admin' ||
    r === 'manager' ||
    r === 'teacher' ||
    r === 'front_desk'
  ) {
    return r
  }
  // 'user' legacy → front_desk (DB migrată în 20260527190000)
  return 'front_desk'
}

function locatieFromUser(user: User | null): string | null {
  const l = user?.app_metadata?.locatie_id
  return typeof l === 'string' && l.length > 0 ? l : null
}

async function openPontajSession(): Promise<void> {
  try {
    await supabase.rpc('pontaj_open_session')
  } catch {
    /* pontaj e best-effort — nu blocăm login-ul dacă eșuează */
  }
}

async function closePontajSession(
  source: 'signout' | 'manual' | 'idle',
): Promise<void> {
  try {
    await supabase.rpc('pontaj_close_session', { p_source: source })
  } catch {
    /* idem — best effort */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // Track ultimul user pentru care am deschis sesiune pontaj — ca să nu deschidem
  // de mai multe ori pe același login (tab switch, token refresh, etc).
  const pontajOpenedFor = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      const userId = next?.user?.id ?? null
      // SIGNED_IN: deschide o sesiune pontaj nouă (RPC închide automat sesiunile reziduale).
      // INITIAL_SESSION: la prima încărcare a paginii cu sesiune persistată, NU deschidem.
      if (event === 'SIGNED_IN' && userId && pontajOpenedFor.current !== userId) {
        pontajOpenedFor.current = userId
        void openPontajSession()
      }
      if (event === 'SIGNED_OUT') {
        pontajOpenedFor.current = null
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await closePontajSession('signout')
    await supabase.auth.signOut()
  }

  const endShift = async () => {
    await closePontajSession('manual')
    await supabase.auth.signOut()
  }

  const idleLogout = async () => {
    await closePontajSession('idle')
    await supabase.auth.signOut()
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    role: roleFromUser(session?.user ?? null),
    locatieId: locatieFromUser(session?.user ?? null),
    loading,
    signIn,
    signOut,
    endShift,
    idleLogout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth trebuie folosit în interiorul <AuthProvider>')
  return ctx
}
