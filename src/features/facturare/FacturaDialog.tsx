import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Select, Button } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { ARTICOLE_FGO } from './constants'
import { articolDinTextBanca } from './articolResolver'
import { emiteFacturi, type EmitItem } from './api'
import type { FacturaRow, MatchSuggestion } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type LineDraft = { articol: string; suma: number }

// Dialog de facturare per transfer: liniile vin din plata înregistrată (pre-completate
// cu articolul derivat), recepția completează/editează articolele apoi emite factura FGO.
export function FacturaDialog({
  row,
  match,
  onClose,
}: {
  row: FacturaRow
  match: MatchSuggestion | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  // Pre-completare articol: întâi cel derivat din plată (linia); dacă lipsește,
  // ghicire din textul extrasului bancar (editabilă). Restul → recepția alege.
  const guess = articolDinTextBanca(row.descriere) ?? ''
  const [lines, setLines] = useState<LineDraft[]>(
    row.linii && row.linii.length
      ? row.linii.map((l) => ({ articol: l.articol ?? guess, suma: l.suma }))
      : [{ articol: guess, suma: row.suma }],
  )
  const [error, setError] = useState<string | null>(null)

  const totalLinii = lines.reduce((a, l) => a + l.suma, 0)
  const allFilled = lines.every((l) => l.articol)

  const emit = useMutation({
    mutationFn: async () => {
      const item: EmitItem = {
        ref: row.ref,
        client_nume: row.client_nume,
        suma: row.suma,
        data: row.data_tranzactie,
        descriere: row.descriere ?? '',
        valuta: row.valuta,
        client_id: match?.tip === 'client' ? match.id : row.client_id,
        familia_id:
          match?.tip === 'familie' ? match.id : match?.familia_id ?? row.familia_id,
        linii: lines.map((l) => ({ articol: l.articol, suma: l.suma })),
      }
      const res = await emiteFacturi(row.firma_cui, [item])
      const r0 = res.results[0]
      if (r0 && r0.status === 'eroare') throw new Error(r0.mesaj || 'Eroare la emitere.')
      return res
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'banca'] })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la emitere.')),
  })

  const artOptions = [
    { value: '', label: '— alege articol —' },
    ...ARTICOLE_FGO.map((a) => ({ value: a, label: a })),
  ]

  return (
    <Modal open title="Emite factură FGO" onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-ink">
          Client (plătitor): <strong>{row.client_nume}</strong>
        </p>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1">
                <Select
                  options={artOptions}
                  value={l.articol}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, articol: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div className="w-32 text-right text-sm whitespace-nowrap text-ink">
                {fmt(l.suma)} {row.valuta}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
          <span>Total factură</span>
          <span>
            {fmt(totalLinii)} {row.valuta}
          </span>
        </div>
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            disabled={!allFilled || emit.isPending}
            onClick={() => emit.mutate()}
            title={!allFilled ? 'Completează articolul pe toate liniile' : undefined}
          >
            {emit.isPending ? 'Se emite…' : 'Emite factura'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
