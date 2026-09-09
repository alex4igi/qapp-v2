import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientSearch } from '../useClientSearch'

/**
 * Căutarea de clienți pe tot ecranul. Pe telefon un dropdown ancorat în bara de
 * sus ar fi tăiat de containerul cu scroll, iar tastatura ar acoperi jumătate
 * din rezultate.
 */
export function MobileSearchScreen({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { input, setInput, tooShort, results, isFetching } = useClientSearch()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const go = (id: string) => {
    onClose()
    navigate(`/clienti/${id}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 border-b border-line bg-card px-3 py-2.5">
        <div className="flex h-11 flex-1 items-center gap-2.5 rounded-xl border border-line bg-card px-3 focus-within:border-quasar-yellow">
          <svg
            width="18"
            height="18"
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
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nume, telefon sau email…"
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 px-2 py-2 text-sm font-semibold text-muted-2"
        >
          Renunță
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tooShort ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Scrie cel puțin două litere.
          </p>
        ) : isFetching && results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">Se caută…</p>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Niciun client găsit.
          </p>
        ) : (
          results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(c.id)}
              className="flex w-full items-center gap-3 border-b border-line-2 px-4 py-3 text-left active:bg-rowhover"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-bg text-[11px] font-bold text-muted-2">
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
    </div>
  )
}
