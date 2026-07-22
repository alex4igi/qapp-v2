import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, TextInput, Button } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { marcheazaFacturi } from './api'
import type { FacturaRow } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// „Marcată" NU emite nimic — doar consemnează o factură emisă deja de mână în FGO.
// Numărul e obligatoriu tocmai ca marcarea să nu poată fi făcută din reflex: dacă nu ai
// emis factura, nu ai ce număr să treci.
export function MarcheazaDialog({ row, onClose }: { row: FacturaRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [numar, setNumar] = useState('')
  const [error, setError] = useState<string | null>(null)

  const numarValid = numar.trim().length >= 2

  const marcheaza = useMutation({
    mutationFn: async () => {
      const res = await marcheazaFacturi(row.firma_cui, [
        {
          ref: row.ref,
          client_nume: row.client_nume,
          suma: row.suma,
          data: row.data_tranzactie,
          descriere: row.descriere ?? '',
          numar_factura: numar.trim(),
        },
      ])
      const r0 = res.results[0]
      if (r0 && r0.status === 'eroare') throw new Error(r0.mesaj || 'Eroare la marcare.')
      return res
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'banca'] })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la marcare.')),
  })

  return (
    <Modal open title="Marchează ca facturat în FGO" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Aici <strong>nu se emite nicio factură</strong>. Folosește doar dacă ai emis deja
          factura de mână în FGO. Dacă nu ai emis-o, închide și apasă „🧾 Facturează".
        </div>
        <div className="space-y-1 text-sm text-ink">
          <p>
            Plătitor: <strong>{row.client_nume}</strong>
          </p>
          <p>
            Sumă:{' '}
            <strong>
              {fmt(row.suma)} {row.valuta}
            </strong>{' '}
            · {row.data_tranzactie}
          </p>
          {row.descriere && <p className="text-muted">{row.descriere}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-semibold text-ink" htmlFor="numar-factura">
            Numărul facturii din FGO
          </label>
          <TextInput
            id="numar-factura"
            value={numar}
            autoFocus
            placeholder="ex. QDS 1234"
            onChange={(e) => setNumar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && numarValid && !marcheaza.isPending) marcheaza.mutate()
            }}
          />
          <p className="text-xs text-muted">
            Se salvează în registru ca dovadă că transferul chiar are factură.
          </p>
        </div>
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            disabled={!numarValid || marcheaza.isPending}
            onClick={() => marcheaza.mutate()}
            title={!numarValid ? 'Completează numărul facturii din FGO' : undefined}
          >
            {marcheaza.isPending ? 'Se salvează…' : 'Marchează'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
