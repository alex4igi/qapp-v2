import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Checkbox, Spinner } from '@/components/ui'
import { ClientMatcher } from './ClientMatcher'
import { listMembriFamilie } from './api'
import {
  estePlatita,
  restNealocat,
  sumaAlocare,
  sumaAlocata,
} from './alocari'
import type { Alocare, FacturaRow, MatchSuggestion } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Props = {
  row: FacturaRow
  onChange: (alocari: Alocare[]) => void
  onPlata: (a: Alocare) => void
  // Butonul de plată stă în coloana de acțiuni cât timp e un singur beneficiar (poziția
  // de dinainte de alocări); per chip apare doar când sunt mai mulți.
  showPlata: boolean
}

export function ClientiAlocati({ row, onChange, onPlata, showPlata }: Props) {
  const [familieFor, setFamilieFor] = useState<MatchSuggestion | null>(null)
  const [bifati, setBifati] = useState<Set<string>>(new Set())

  const alocari = row.alocari ?? []
  const alocat = sumaAlocata(row)
  const rest = restNealocat(row)

  const membri = useQuery({
    queryKey: ['fgo-familie-membri', familieFor?.id],
    queryFn: () => listMembriFamilie(familieFor!.id),
    enabled: !!familieFor,
  })

  const adauga = (list: MatchSuggestion[]) => {
    const noi = list
      .filter((s) => !alocari.some((a) => a.client_id === s.id))
      .map((s) => ({ client_id: s.id, familia_id: s.familia_id, nume: s.nume }))
    if (noi.length) onChange([...alocari, ...noi])
  }

  const onPick = (s: MatchSuggestion) => {
    if (s.tip === 'client') {
      adauga([s])
      return
    }
    // Familie: transferul e de regulă pentru frați — bifezi copiii vizați.
    setBifati(new Set())
    setFamilieFor(s)
  }

  const inchideFamilia = () => {
    setFamilieFor(null)
    setBifati(new Set())
  }

  return (
    <div className="space-y-1">
      {alocari.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {alocari.map((a) => {
            const platita = estePlatita(row, a.client_id)
            const suma = sumaAlocare(row, a.client_id)
            return (
              <span
                key={a.client_id}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
              >
                ✓ {a.nume}
                {suma > 0 && <span className="font-normal">· {fmt(suma)}</span>}
                {showPlata && !platita && (
                  <button
                    type="button"
                    onClick={() => onPlata(a)}
                    title={`Plată nouă (Transfer) pentru ${a.nume}`}
                    className="rounded-full border border-green-300 bg-white/70 px-1 hover:bg-quasar-yellow"
                  >
                    💳
                  </button>
                )}
                <button
                  type="button"
                  disabled={platita}
                  onClick={() => onChange(alocari.filter((x) => x.client_id !== a.client_id))}
                  title={
                    platita
                      ? 'Plata e deja înregistrată pentru acest client'
                      : 'Scoate clientul de pe transfer'
                  }
                  className="rounded-full px-0.5 text-green-700 hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ✕
                </button>
              </span>
            )
          })}
        </div>
      )}

      {familieFor ? (
        <div className="space-y-1 rounded-lg border border-line bg-surface p-2">
          <p className="text-xs font-semibold text-ink">{familieFor.nume} — cine e pe transfer?</p>
          {membri.isLoading ? (
            <Spinner />
          ) : (membri.data ?? []).length === 0 ? (
            <p className="text-xs text-muted">Familia nu are membri.</p>
          ) : (
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {(membri.data ?? []).map((m) => (
                <Checkbox
                  key={m.id}
                  id={`fam-${familieFor.id}-${m.id}`}
                  checked={bifati.has(m.id)}
                  disabled={alocari.some((a) => a.client_id === m.id)}
                  onChange={(e) =>
                    setBifati((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(m.id)
                      else next.delete(m.id)
                      return next
                    })
                  }
                  label={
                    <span className="text-xs">
                      {m.nume}
                      {m.status && m.status !== 'Activ' && (
                        <span className="ml-1 text-muted">· {m.status}</span>
                      )}
                    </span>
                  }
                />
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={bifati.size === 0}
              onClick={() => {
                adauga((membri.data ?? []).filter((m) => bifati.has(m.id)))
                inchideFamilia()
              }}
              className="rounded-lg bg-quasar-yellow px-2 py-0.5 text-xs font-medium text-black disabled:opacity-40"
            >
              Adaugă ({bifati.size})
            </button>
            <button
              type="button"
              onClick={inchideFamilia}
              className="text-xs text-muted underline hover:text-ink"
            >
              Renunță
            </button>
          </div>
        </div>
      ) : (
        <ClientMatcher
          payerNume={row.client_nume}
          descriere={row.descriere ?? ''}
          excludeIds={alocari.map((a) => a.client_id)}
          placeholder={alocari.length ? 'adaugă alt client…' : 'caută manual…'}
          onPick={onPick}
        />
      )}

      {/* Un client fără plată încă înregistrată n-are ce raporta („rest = tot") — hint-ul
          apare doar când sunt mai mulți beneficiari sau când chiar s-a alocat ceva. */}
      {(alocari.length > 1 || (alocat > 0.01 && Math.abs(rest) > 0.01)) && (
        <p
          className={
            rest < -0.01
              ? 'text-xs text-red-700'
              : rest > 0.01
                ? 'text-xs text-amber-700'
                : 'text-xs text-muted'
          }
        >
          alocat {fmt(alocat)} din {fmt(row.suma)} {row.valuta}
          {Math.abs(rest) > 0.01 && ` · rest ${fmt(rest)}`}
        </p>
      )}
    </div>
  )
}
