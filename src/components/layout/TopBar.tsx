import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { DateInput } from '@/components/ui'
import { LocationPicker } from './LocationPicker'
import { useClientSearch } from './useClientSearch'
import { useUnreadCount } from './useUnreadCount'

// Căutare rapidă de clienți — fluxul principal al recepției: caută client →
// intră pe fișă → înrolare / încasare. Debounce + dropdown cu rezultate.
function ClientSearch() {
  const navigate = useNavigate()
  const { input, setInput, term, results, isFetching, reset } = useClientSearch()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (id: string) => {
    setOpen(false)
    reset()
    navigate(`/clienti/${id}`)
  }

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="flex h-10 items-center gap-2.5 rounded-[10px] border border-line bg-card px-3 focus-within:border-quasar-yellow">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="shrink-0 text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Caută client după nume, telefon, email…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
      </div>

      {open && term.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-lg">
          {isFetching && results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">Se caută…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">Niciun client găsit.</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => go(c.id)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-bg text-[11px] font-bold text-muted-2">
                  {`${c.nume?.[0] ?? ''}${c.prenume?.[0] ?? ''}`.toUpperCase() || '?'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {`${c.nume ?? ''} ${c.prenume ?? ''}`.trim() || c.email || '—'}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[c.telefon, c.email].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Bara globală de utilitare (sus): căutare clienți (stânga) + locație, ziua de
// lucru, notificări (dreapta). Navigația și contul trăiesc în rail.
export function TopBar() {
  const { date, setDate } = useWorkingDate()
  const { enabled: showNotificari, count: unreadCount } = useUnreadCount()

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-card px-6">
      <ClientSearch />

      <div className="flex-1" />

      <LocationPicker />

      <div title="Ziua de lucru">
        <DateInput
          value={date}
          onChange={(e) => setDate(e.target.value)}
          wrapperClassName="w-40"
        />
      </div>

      {showNotificari && (
        <Link
          to="/notificari"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-card text-base transition-colors hover:bg-surface"
          title={unreadCount > 0 ? `${unreadCount} notificări ne-citite` : 'Notificări'}
          aria-label="Notificări"
        >
          🔔
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      )}
    </div>
  )
}
