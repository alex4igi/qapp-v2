import {
  createContext,
  useContext,
  useEffect,
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
  /**
   * `teacheri.id` legat de contul curent, sau null. Ortogonal rolului: un
   * manager care predă are rol de manager ȘI profil de instructor. Discriminantul
   * „îmi arăți datele mele de instructor?" e ăsta, nu `role === 'teacher'`.
   */
  teacherId: string | null
  /** Profilul se rezolvă cu un query după login — vezi gardul din ProtectedRoute. */
  teacherLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
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

// Pontajul NU mai atârnă de auth (redesign 2026-07-22): login ≠ sosire la muncă,
// logout ≠ plecare. Tura se deschide/închide explicit din butonul de pontaj
// (`features/pontaj/usePontaj`), pentru că orele sugerează salariul.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [teacherLoading, setTeacherLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // Rezolvă profilul de instructor al contului curent. Un singur query per login,
  // ținut în context ca gating-ul „am profil de instructor" să fie sincron peste tot.
  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (!userId) {
      setTeacherId(null)
      setTeacherLoading(false)
      return
    }
    let cancelled = false
    setTeacherLoading(true)
    void (async () => {
      const { data } = await supabase
        .from('teacheri')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle()
      if (cancelled) return
      setTeacherId(data?.id ?? null)
      setTeacherLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    role: roleFromUser(session?.user ?? null),
    locatieId: locatieFromUser(session?.user ?? null),
    loading,
    teacherId,
    teacherLoading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth trebuie folosit în interiorul <AuthProvider>')
  return ctx
}
