import { useSyncExternalStore } from 'react'

// Shell-ul mobil se activează sub pragul `md` din Tailwind (768px), ca UI-ul și
// clasele `max-md:` din componente să comute în același punct.
const MOBILE_MQ = '(max-width: 767px)'
const FORCE_KEY = 'qapp.force_desktop'
// Flag-ul se schimbă dintr-un buton, nu dintr-un alt tab → `storage` nu se emite
// pe fereastra care scrie. Evenimentul propriu ține locul lui.
const FORCE_EVENT = 'qapp:force-desktop'

// Rezervă pentru ferestrele private, unde localStorage aruncă la scriere: fără ea
// butonul „Deschide versiunea desktop" n-ar avea niciun efect.
let forceFallback = false

function readForce(): boolean {
  try {
    const raw = localStorage.getItem(FORCE_KEY)
    return raw === null ? forceFallback : raw === '1'
  } catch {
    return forceFallback
  }
}

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(MOBILE_MQ)
  mq.addEventListener('change', onChange)
  window.addEventListener(FORCE_EVENT, onChange)
  return () => {
    mq.removeEventListener('change', onChange)
    window.removeEventListener(FORCE_EVENT, onChange)
  }
}

function snapshot(): boolean {
  return window.matchMedia(MOBILE_MQ).matches && !readForce()
}

/** True pe ecran îngust, cu excepția cazului în care userul a forțat desktopul. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

export function isForcedDesktop(): boolean {
  return readForce()
}

/** Lățimea reală, ignorând flag-ul — pentru „ai forțat desktopul pe un telefon". */
export function isNarrowViewport(): boolean {
  return window.matchMedia(MOBILE_MQ).matches
}

export function setForceDesktop(on: boolean): void {
  forceFallback = on
  try {
    localStorage.setItem(FORCE_KEY, on ? '1' : '0')
  } catch {
    /* fereastră privată — rămâne doar pe sesiunea curentă */
  }
  window.dispatchEvent(new Event(FORCE_EVENT))
}
