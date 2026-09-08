import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseUrl } from '@/lib/supabase'

export type AppRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'teacher'
  | 'front_desk'
  | 'marketing'

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
  /** Bootul de auth s-a agățat — arată ecranul de deblocare în loc de spinner. */
  authStalled: boolean
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
    r === 'front_desk' ||
    r === 'marketing'
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

// `@supabase/auth-js` nu pune NICIUN timeout pe fetch-urile lui. Dacă cererea de
// refresh a tokenului rămâne agățată (token expirat peste o conexiune moartă),
// `getSession()` nu se mai întoarce niciodată: fără gardul de mai jos aplicația
// rămânea pe „Se încarcă…" la infinit, fără eroare și fără ieșire, iar singura
// scăpare era ștergerea datelor de site din browser.
const AUTH_BOOT_TIMEOUT_MS = 8000

/**
 * Aruncă tokenul local și repornește aplicația. Reload-ul e obligatoriu, nu
 * cosmetic: clientul agățat ține lockul pe cheia de storage, deci până și un
 * login nou ar aștepta după el. Pagina nouă pornește cu un client curat.
 */
export function resetAuthSession() {
  try {
    // Aceeași cheie pe care și-o calculează supabase-js din URL. O ștergem
    // țintit: pe `localhost` stau în același origin și tokenurile altor app-uri
    // Supabase, iar un `sb-*` la grămadă le-ar deconecta și pe alea.
    const prefix = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    for (const key of Object.keys(localStorage)) {
      if (key === prefix || key.startsWith(`${prefix}-`)) localStorage.removeItem(key)
    }
  } catch {
    // localStorage inaccesibil (fereastră privată) — rămâne doar reload-ul
  }
  window.location.replace('/login')
}

// Pontajul NU mai atârnă de auth (redesign 2026-07-22): login ≠ sosire la muncă,
// logout ≠ plecare. Tura se deschide/închide explicit din butonul de pontaj
// (`features/pontaj/usePontaj`), pentru că orele sugerează salariul.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authStalled, setAuthStalled] = useState(false)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [teacherLoading, setTeacherLoading] = useState(true)

  useEffect(() => {
    let settled = false
    const finish = (next: Session | null, stalled: boolean) => {
      if (settled) return
      settled = true
      setSession(next)
      setAuthStalled(stalled)
      setLoading(false)
    }

    const timer = setTimeout(() => finish(null, true), AUTH_BOOT_TIMEOUT_MS)

    supabase.auth
      .getSession()
      .then(({ data }) => finish(data.session, false))
      .catch(() => finish(null, true))
      .finally(() => clearTimeout(timer))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Dacă răspunsul vine totuși după ce am dat timeout, ieșim din blocaj.
      setSession(next)
      setAuthStalled(false)
      setLoading(false)
    })

    return () => {
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
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
    authStalled,
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
