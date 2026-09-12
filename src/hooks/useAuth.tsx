import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  AUTH_STORAGE_KEY,
  isSessionUsable,
  readPersistedSession,
  supabase,
} from '@/lib/supabase'

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
  /** Pornirea durează neobișnuit de mult; spune-i omului, nu-l lăsa pe spinner mut. */
  bootSlow: boolean
  /** De ce s-a agățat, în clar — ca să nu mai ghicim data viitoare. */
  stallReason: string | null
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

// Bugetul propriu al lui `auth-js` la pornire e mult mai mare decât pare: până la
// 5s așteptare pe lockul de storage (`lockAcquireTimeout`, după care îl fură) PLUS
// până la 30s de reîncercări cu backoff pe refreshul tokenului
// (`AUTO_REFRESH_TICK_DURATION_MS`). Vechiul prag de 8s tăia constant peste porniri
// perfect sănătoase, doar mai lente, și arunca omul afară din cont — „intru în app
// doar ca să ies". Îi lăsăm librăriei tot bugetul ei; ecranul de deblocare rămâne
// ultima plasă, nu prima reacție.
const AUTH_BOOT_TIMEOUT_MS = 40_000

/** Peste atât spunem pe șleau că durează, ca să nu pară că a înghețat. */
const AUTH_BOOT_SLOW_MS = 5_000

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
    const prefix = AUTH_STORAGE_KEY
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
  // Pornire optimistă: dacă tokenul salvat mai e valabil, aplicația se randează
  // pe loc, iar reînnoirea se face în fundal. Fără asta, prima pagină atârna de
  // o cerere de rețea — și tocmai aia e cea care poate dura zeci de secunde.
  const bootSession = useMemo(() => {
    const persisted = readPersistedSession()
    return isSessionUsable(persisted) ? persisted : null
  }, [])

  const [session, setSession] = useState<Session | null>(bootSession)
  const [loading, setLoading] = useState(bootSession === null)
  const [authStalled, setAuthStalled] = useState(false)
  const [bootSlow, setBootSlow] = useState(false)
  const [stallReason, setStallReason] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [teacherLoading, setTeacherLoading] = useState(true)

  useEffect(() => {
    // Pornit optimist ⇒ întrebarea „avem sesiune?" are deja răspuns, deci nici
    // un timer nu mai are voie să arunce ecranul de blocaj peste un om care
    // lucrează liniștit.
    let decided = bootSession !== null

    const decide = (next: Session | null) => {
      decided = true
      setSession(next)
      setAuthStalled(false)
      setStallReason(null)
      setBootSlow(false)
      setLoading(false)
    }

    const slowTimer = setTimeout(() => {
      if (!decided) setBootSlow(true)
    }, AUTH_BOOT_SLOW_MS)

    const stallTimer = setTimeout(() => {
      if (decided) return
      decided = true
      setStallReason(
        `Reînnoirea sesiunii nu a răspuns în ${Math.round(AUTH_BOOT_TIMEOUT_MS / 1000)} de secunde.`,
      )
      setAuthStalled(true)
      setLoading(false)
    }, AUTH_BOOT_TIMEOUT_MS)

    supabase.auth
      .getSession()
      .then(({ data }) => decide(data.session))
      .catch((error: unknown) => {
        // Cu o sesiune optimistă în mână nu avem de ce s-o aruncăm: eroarea
        // privea reînnoirea, nu dreptul omului de a fi în aplicație.
        if (bootSession) return
        decided = true
        setStallReason(error instanceof Error ? error.message : String(error))
        setAuthStalled(true)
        setLoading(false)
      })
      .finally(() => {
        clearTimeout(slowTimer)
        clearTimeout(stallTimer)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Dacă răspunsul vine totuși după ce am dat timeout, ieșim din blocaj.
      decide(next)
    })

    return () => {
      clearTimeout(slowTimer)
      clearTimeout(stallTimer)
      sub.subscription.unsubscribe()
    }
  }, [bootSession])

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
    bootSlow,
    stallReason,
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
