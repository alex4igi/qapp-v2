import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Lipsesc variabilele de mediu Supabase. Completează VITE_SUPABASE_URL și VITE_SUPABASE_ANON_KEY în .env.local',
  )
}

/** Cheia sub care `auth-js` își ține sesiunea — o calculăm la fel ca librăria. */
export const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

// `auth-js` nu pune NICIUN timeout pe fetch-urile lui. O cerere de refresh care
// atârnă (token expirat peste o conexiune moartă) ține pornirea agățată la
// nesfârșit. Tăiem DOAR cererile de auth: un abort ajunge la librărie ca
// `AuthRetryableFetchError`, deci reîncearcă imediat în loc să aștepte la infinit.
// Interogările de date rămân netăiate — rapoartele grele trec legitim de prag.
const AUTH_FETCH_TIMEOUT_MS = 10_000

const authAwareFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  if (!url.includes('/auth/v1/')) return fetch(input, init)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS)

  const caller = init?.signal
  if (caller) {
    if (caller.aborted) controller.abort()
    else caller.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer)
  })
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { fetch: authAwareFetch },
})

/** Cât timp înainte de expirare încetăm să mai avem încredere în tokenul salvat. */
const SESSION_FRESH_MARGIN_S = 60

function decodeStoredSession(raw: string): string {
  // Versiunile actuale scriu JSON curat, dar `auth-js` are și un mod base64url;
  // îl acceptăm ca un upgrade de librărie să nu ne lase tăcut fără boot rapid.
  if (!raw.startsWith('base64-')) return raw
  const b64 = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Citește sincron sesiunea salvată, fără să atingă clientul de auth. E temelia
 * pornirii optimiste din `useAuth`: prima pagină nu mai depinde de o cerere de
 * rețea care poate dura zeci de secunde.
 */
export function readPersistedSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(decodeStoredSession(raw)) as Session | null
    if (!parsed?.access_token || !parsed.user) return null
    return parsed
  } catch {
    // localStorage inaccesibil sau conținut corupt — pornim pe drumul normal.
    return null
  }
}

/** Tokenul mai e bun de folosit ca atare, fără să așteptăm o reînnoire? */
export function isSessionUsable(session: Session | null): boolean {
  if (!session?.expires_at) return false
  return session.expires_at - SESSION_FRESH_MARGIN_S > Date.now() / 1000
}
