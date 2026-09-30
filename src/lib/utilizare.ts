import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// Măsurarea utilizării (docs/utilizare-aplicatie.md): contoare pe zi × rol × pagină × buton,
// fără id de utilizator. Totul e „trimite și uită": nicio eroare de aici nu ajunge la om.

type Varianta = 'desktop' | 'mobil'
type Tip = 'pagina' | 'clic'

const FLUSH_MS = 30_000
const MAX_TINTA = 80

const buffer = new Map<string, number>()
// Dev și Playwright nu sunt utilizare reală; `localStorage.utilizare_test = '1'` le pornește
// pentru verificarea colectării înseși.
let oprit = (import.meta.env.DEV || navigator.webdriver) && !testForced()

function testForced(): boolean {
  try {
    return localStorage.getItem('utilizare_test') === '1'
  } catch {
    return false
  }
}
let varianta: Varianta = 'desktop'
let rutaCurenta = '/'
let rutaNumarata = false

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `/clienti/3f2a…` → `/clienti/:id`; din query rămâne doar `tab` (sub-paginile din /statistici etc.). */
export function normalizeRoute(pathname: string, search = ''): string {
  const path = pathname
    .split('/')
    .map((s) => (UUID.test(s) ? ':id' : /^\d+$/.test(s) ? ':n' : s))
    .join('/')
  const tab = new URLSearchParams(search).get('tab')
  return (tab ? `${path}?tab=${tab}` : path).slice(0, 100)
}

const CUVANT_PROPRIU = /^\p{Lu}\p{Ll}/u

/**
 * Cifrele (sume, date, telefoane) devin `#`, iar numele proprii `[nume]` — altfel „Încasează 250 lei"
 * și „Maria Popescu" ar fragmenta statistica și ar pune date personale în jurnal.
 * Un cuvânt cu majusculă e nume dacă nu e primul, sau dacă e primul și îl urmează altul cu majusculă.
 */
export function sanitizeLabel(raw: string): string {
  const cuvinte = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\d][\d.,:/\-\s]*[\d]|\d/g, '#')
    .split(' ')
  // „Primul cuvânt" = primul cu litere: în „+ Client", „Client" e începutul etichetei, nu un nume.
  const primul = cuvinte.findIndex((w) => /\p{L}/u.test(w))
  const out: string[] = []
  cuvinte.forEach((w, i) => {
    const propriu =
      CUVANT_PROPRIU.test(w) && (i > primul || CUVANT_PROPRIU.test(cuvinte[i + 1] ?? ''))
    if (propriu) {
      if (out[out.length - 1] !== '[nume]') out.push('[nume]')
    } else {
      out.push(w)
    }
  })
  return out.join(' ').slice(0, MAX_TINTA)
}

function hrefTarget(a: HTMLAnchorElement): string {
  const href = a.getAttribute('href') ?? ''
  if (/^(tel|mailto|sms):/i.test(href)) return `→ ${href.split(':')[0].toLowerCase()}:`
  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) return `→ ${url.hostname}`
    return `→ ${normalizeRoute(url.pathname, url.search)}`
  } catch {
    return '→ ?'
  }
}

function labelFor(el: Element): string {
  const explicit = el.closest<HTMLElement>('[data-track]')?.dataset.track
  if (explicit) return explicit.slice(0, MAX_TINTA)
  if (el instanceof HTMLAnchorElement && el.hasAttribute('href')) return hrefTarget(el)

  const text =
    el.getAttribute('aria-label') ||
    (el as HTMLElement).innerText ||
    el.getAttribute('title') ||
    (el instanceof HTMLInputElement ? el.closest('label')?.innerText ?? '' : '')
  const curat = sanitizeLabel(text)
  if (curat) return curat
  // Buton doar cu iconiță și fără etichetă: numele iconiței lucide rămâne un reper.
  const icon = el.querySelector('svg')?.getAttribute('class')?.match(/lucide-([\w-]+)/)?.[1]
  return icon ? `[icon ${icon}]` : '[fără etichetă]'
}

// Un „Salvează" din modalul de plată ≠ „Salvează" din modalul de lead.
function contextFor(el: Element): string {
  const titlu = el.closest('[data-modal-overlay]')?.querySelector('h2')?.textContent
  return titlu ? `${sanitizeLabel(titlu).slice(0, 60)} › ` : ''
}

const CLICKABLE = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'summary',
].join(',')

function add(tip: Tip, ruta: string, tinta: string) {
  const key = JSON.stringify([varianta, ruta, tip, tinta])
  buffer.set(key, (buffer.get(key) ?? 0) + 1)
}

function onClick(e: MouseEvent) {
  if (oprit || !(e.target instanceof Element)) return
  const el = e.target.closest(CLICKABLE)
  if (!el || (el as HTMLButtonElement).disabled) return
  try {
    add('clic', rutaCurenta, (contextFor(el) + labelFor(el)).slice(0, 160))
  } catch {
    // statistică: un clic pierdut nu contează
  }
}

async function flush() {
  if (oprit || buffer.size === 0) return
  const lot = [...buffer.entries()].map(([key, n]) => {
    const [v, r, t, g] = JSON.parse(key) as [Varianta, string, Tip, string]
    return { v, r, t, g, n: Math.min(n, 1000) }
  })
  buffer.clear()
  try {
    const { data: s } = await supabase.auth.getSession()
    const token = s.session?.access_token
    if (!token) return
    // Direct cu `keepalive`, nu prin supabase.rpc: lotul trimis la închiderea tabului trebuie
    // să plece și după ce pagina dispare.
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/inregistreaza_utilizare`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ p_lot: lot.slice(0, 500) }),
    })
    // false = colectarea e oprită (finalul sezonului) sau contul e exclus → tăcem până la reload.
    if (res.ok && (await res.json()) === false) oprit = true
  } catch {
    // rețea căzută: lotul se pierde, statistica rămâne valabilă
  }
}

/** Montat o singură dată, în AppLayout (doar aplicația de staff, după login). */
export function useUtilizareTracking(isMobile: boolean) {
  const { pathname, search } = useLocation()
  const ruta = normalizeRoute(pathname, search)

  useEffect(() => {
    varianta = isMobile ? 'mobil' : 'desktop'
  }, [isMobile])

  // AppLayout se remontează la trecerea între blocurile de rute și la pornirea optimistă a
  // sesiunii; numărăm doar când ruta chiar se schimbă, nu la fiecare montare.
  useEffect(() => {
    if (ruta === rutaCurenta && rutaNumarata) return
    rutaCurenta = ruta
    rutaNumarata = true
    if (!oprit) add('pagina', ruta, '')
  }, [ruta])

  useEffect(() => {
    if (oprit) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    const timer = window.setInterval(flush, FLUSH_MS)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      window.clearInterval(timer)
      void flush()
    }
  }, [])
}
