import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { recordAuditLog } from '@/lib/auditLog'
import { useAuth } from './useAuth'

type Ctx = {
  /** Modul „doar azi" e pornit pe sesiunea curentă. */
  active: boolean
  activate: () => Promise<void>
}

const STORAGE_KEY = 'qapp.today_only'

// Cât așteptăm scrierea în jurnalul de audit înainte de reîncărcare. Ecranul e
// deja restrâns în momentul ăla, deci întârzierea nu se vede.
const AUDIT_WAIT_MS = 1500

const TodayOnlyContext = createContext<Ctx | undefined>(undefined)

/**
 * Identitatea LOGĂRII, nu a contului: `session_id` din JWT rămâne același la
 * reînnoirea tokenului și se schimbă la fiecare logare nouă. Modul e legat de
 * valoarea asta, deci „ieși la re-login" nu are nevoie de nicio curățenie —
 * sesiunea nouă pur și simplu nu se mai potrivește cu ce e salvat.
 */
function sessionKey(session: Session | null): string | null {
  if (!session) return null
  try {
    const payload = session.access_token.split('.')[1]
    const claims = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { session_id?: unknown }
    if (typeof claims.session_id === 'string') return claims.session_id
  } catch {
    // token ilizibil — cădem pe varianta de mai jos
  }
  const { id, last_sign_in_at } = session.user
  return last_sign_in_at ? `${id}:${last_sign_in_at}` : null
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function TodayOnlyProvider({ children }: { children: ReactNode }) {
  const { session, locatieId } = useAuth()
  const key = useMemo(() => sessionKey(session), [session])
  const [stored, setStored] = useState<string | null>(readStored)

  // Celelalte taburi deschise pe același calculator intră în mod odată cu ăsta.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setStored(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const activate = useCallback(async () => {
    if (!key) return
    try {
      localStorage.setItem(STORAGE_KEY, key)
    } catch {
      // fără localStorage modul ține doar până la refresh — tot mai bine decât deloc
    }
    setStored(key)

    await Promise.race([
      recordAuditLog({
        action: 'today_only_activated',
        entityType: 'sesiune',
        newValue: { pagina: window.location.pathname },
        locatieId,
      }).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, AUDIT_WAIT_MS)),
    ])

    // Reîncărcare completă, nu navigare: aruncă și cache-ul React Query, și
    // modalele deschise, și orice stare de pagină rămasă din afara zilei de azi.
    window.location.replace('/')
  }, [key, locatieId])

  const value = useMemo<Ctx>(
    () => ({ active: key !== null && stored === key, activate }),
    [key, stored, activate],
  )

  return (
    <TodayOnlyContext.Provider value={value}>
      {children}
    </TodayOnlyContext.Provider>
  )
}

export function useTodayOnly(): Ctx {
  const ctx = useContext(TodayOnlyContext)
  if (!ctx)
    throw new Error('useTodayOnly trebuie folosit în <TodayOnlyProvider>')
  return ctx
}
