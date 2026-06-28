import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { matchPayer, searchClienti } from './api'
import type { MatchSuggestion } from './types'

type Props = {
  payerNume: string
  descriere: string
  value: MatchSuggestion | null
  onChange: (m: MatchSuggestion | null) => void
}

export function ClientMatcher({ payerNume, descriere, value, onChange }: Props) {
  const [term, setTerm] = useState('')

  const suggestions = useQuery({
    queryKey: ['fgo-match', payerNume, descriere],
    queryFn: () => matchPayer(payerNume, descriere),
    enabled: !value && payerNume.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const search = useQuery({
    queryKey: ['fgo-search', term],
    queryFn: () => searchClienti(term),
    enabled: term.trim().length >= 2,
  })

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          ✓ {value.nume}
          {value.tip === 'familie' ? ' (familie)' : ''}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted underline hover:text-ink"
        >
          schimbă
        </button>
      </div>
    )
  }

  const sugg = (suggestions.data ?? []).slice(0, 5)
  const results = term.trim().length >= 2 ? search.data ?? [] : []

  return (
    <div className="space-y-1">
      {sugg.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sugg.map((s) => (
            <button
              key={`${s.tip}-${s.id}`}
              type="button"
              onClick={() => onChange(s)}
              className="rounded-full border border-line bg-card px-2 py-0.5 text-xs text-ink hover:border-quasar-yellow hover:bg-quasar-yellow/20"
              title={`scor ${(s.scor * 100).toFixed(0)}%`}
            >
              {s.nume}
              {s.tip === 'familie' ? ' (fam.)' : ''}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={term}
          placeholder="caută manual…"
          onChange={(e) => setTerm(e.target.value)}
          className="w-full rounded-lg border border-line bg-card px-2 py-1 text-xs text-ink outline-none focus:border-quasar-yellow"
        />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-card shadow-lg">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(r)
                  setTerm('')
                }}
                className="block w-full px-2 py-1 text-left text-xs text-ink hover:bg-surface"
              >
                {r.nume}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
