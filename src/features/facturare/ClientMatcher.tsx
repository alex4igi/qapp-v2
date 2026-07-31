import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { matchPayer, searchClienti } from './api'
import type { MatchSuggestion } from './types'

// Picker de client/familie: sugestii fuzzy după plătitor + căutare manuală. Nu ține
// starea alegerii — cine e ales se vede în ClientiAlocati, ca să poți alege în continuare.
type Props = {
  payerNume: string
  descriere: string
  excludeIds?: string[]
  placeholder?: string
  onPick: (m: MatchSuggestion) => void
}

export function ClientMatcher({
  payerNume,
  descriere,
  excludeIds,
  placeholder,
  onPick,
}: Props) {
  const [term, setTerm] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const suggestions = useQuery({
    queryKey: ['fgo-match', payerNume, descriere],
    queryFn: () => matchPayer(payerNume, descriere),
    enabled: payerNume.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const search = useQuery({
    queryKey: ['fgo-search', term],
    queryFn: () => searchClienti(term),
    enabled: term.trim().length >= 2,
  })

  // Filtrarea se face client-side ca queryKey-ul să rămână comun între rândurile cu
  // același plătitor (altfel s-ar reface RPC-ul de potrivire la fiecare alocare).
  const exclude = new Set(excludeIds ?? [])
  const results = (term.trim().length >= 2 ? search.data ?? [] : []).filter(
    (r) => !exclude.has(r.id),
  )
  const showResults = focused && results.length > 0

  // Panoul de rezultate e randat în portal (fixed), ca să nu fie tăiat de
  // overflow-ul tabelului. Reancorăm la input pe scroll/resize.
  useEffect(() => {
    if (!showResults) return
    const update = () => {
      if (inputRef.current) setRect(inputRef.current.getBoundingClientRect())
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [showResults])

  const sugg = (suggestions.data ?? []).filter((s) => !exclude.has(s.id)).slice(0, 5)

  return (
    <div className="space-y-1">
      {sugg.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sugg.map((s) => (
            <button
              key={`${s.tip}-${s.id}`}
              type="button"
              onClick={() => onPick(s)}
              className="rounded-full border border-line bg-card px-2 py-0.5 text-xs text-ink hover:border-quasar-yellow hover:bg-quasar-yellow/20"
              title={`scor ${(s.scor * 100).toFixed(0)}%`}
            >
              {s.nume}
              {s.tip === 'familie' ? ' (fam.)' : ''}
            </button>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={term}
        placeholder={placeholder ?? 'caută manual…'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => setTerm(e.target.value)}
        className="w-full rounded-lg border border-line bg-card px-2 py-1 text-xs text-ink outline-none focus:border-quasar-yellow"
      />
      {showResults &&
        rect &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: rect.bottom + 4,
              left: rect.left,
              width: Math.max(rect.width, 240),
              zIndex: 60,
            }}
            className="max-h-72 overflow-y-auto rounded-lg border border-line bg-card shadow-lg"
          >
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(r)
                  setTerm('')
                  setFocused(false)
                }}
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface"
              >
                {r.nume}
                {r.status && r.status !== 'Activ' && (
                  <span className="ml-1 text-xs text-muted">· {r.status}</span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
