import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'

// Delogare automată după inactivitate (cont de lucru partajat la recepție).
// „Idle" = nicio interacțiune în tab-ul Qapp; pe alt tab/aplicație tot e idle
// (browserul nu vede alte taburi) — comportament intenționat (decizie user).
// Pontajul rămâne corect și fără asta prin fallback-ul server-side pe ora de
// închidere a locației; idle = securitate, se declanșează doar cât tab-ul rulează.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 min

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
] as const

export function useIdleLogout() {
  const { session, idleLogout } = useAuth()
  const hasSession = Boolean(session)
  // idleLogout nu e memoizat în provider → ref ca să nu reluăm efectul (și să nu
  // resetăm timerul) la fiecare re-render / refresh de token.
  const idleLogoutRef = useRef(idleLogout)
  idleLogoutRef.current = idleLogout

  useEffect(() => {
    if (!hasSession) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let fired = false
    let lastReset = 0

    const logout = () => {
      if (fired) return
      fired = true
      void idleLogoutRef.current()
    }

    const reset = () => {
      if (fired) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(logout, IDLE_TIMEOUT_MS)
    }

    // throttle: mousemove poate emite sute de evenimente — resetăm cel mult 1×/s
    const onActivity = () => {
      const now = Date.now()
      if (now - lastReset < 1000) return
      lastReset = now
      reset()
    }

    reset()
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true }),
    )

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      if (timer) clearTimeout(timer)
    }
  }, [hasSession])
}
