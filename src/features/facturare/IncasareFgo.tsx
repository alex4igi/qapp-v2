import { useMutation, useQueryClient } from '@tanstack/react-query'
import { incaseazaFgo } from './api'
import type { FacturaRow } from './types'

// Starea plății în FGO pentru o factură emisă din aplicație. Facturile emise înainte
// de legătura cu FGO (ambele câmpuri goale) nu afișează nimic.
export function IncasareFgo({ row }: { row: FacturaRow }) {
  const queryClient = useQueryClient()
  const retry = useMutation({
    mutationFn: () => incaseazaFgo(row.ref),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['facturi-fgo'] }),
  })

  if (row.status !== 'Emisa') return null
  if (row.fgo_incasata_la) return <span className="text-xs text-muted">plătită în FGO</span>
  if (!row.fgo_incasare_eroare) return null
  return (
    <span className="text-xs text-amber-700" title={row.fgo_incasare_eroare}>
      ⚠ neplătită în FGO — marcheaz-o manual{' '}
      <button
        type="button"
        className="underline disabled:opacity-50"
        disabled={retry.isPending}
        onClick={() => retry.mutate()}
      >
        {retry.isPending ? 'se trimite…' : 'Reîncearcă'}
      </button>
    </span>
  )
}
