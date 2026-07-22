import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'

// Delogare automată după inactivitate — pură măsură de SECURITATE (ecran lăsat
// deschis la recepție). NU mai atinge pontajul: tura rămâne deschisă până la
// check-out explicit. Motivul: „idle în tab" ≠ „plecat de la muncă" — recepția e
// legitim plecată de la calculator (client în sală, curățenie), iar vechea logică
// îi tăia ore reale exact când pontajul a devenit sugestie de salariu.
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
  const { session, signOut } = useAuth()
  const hasSession = Boolean(session)
  // signOut nu e memoizat în provider → ref ca să nu reluăm efectul (și să nu
  // resetăm timerul) la fiecare re-render / refresh de token.
  const idleLogoutRef = useRef(signOut)
  idleLogoutRef.current = signOut

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
