import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Select, TextInput, Button } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { ARTICOLE_FGO } from './constants'
import { articolDinTextBanca } from './articolResolver'
import { emiteFacturi, type EmitItem } from './api'
import {
  clientIdRegistru,
  familiaIdRegistru,
  liniiAlocare,
  liniiNealocate,
  restNealocat,
  round2,
} from './alocari'
import type { FacturaRow } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// suma e string: input controlat, altfel tastarea „2"→„26"→„260" se bate cu Number().
type LineDraft = { key: string; articol: string; suma: string }
type Group = { clientId: string | null; nume: string | null; lines: LineDraft[] }

const newKey = () => crypto.randomUUID()

// Grupăm liniile pe beneficiar. Un singur client cu plata neînregistrată produce exact
// starea de dinainte de alocări: o linie cu articolul ghicit și suma întreagă.
function initialGroups(row: FacturaRow): Group[] {
  const alocari = row.alocari ?? []
  const groups: Group[] = alocari.map((a) => ({
    clientId: a.client_id,
    nume: a.nume,
    lines: liniiAlocare(row, a.client_id).map((l) => ({
      key: newKey(),
      articol: l.articol ?? '',
      suma: String(l.suma),
    })),
  }))

  const vechi = liniiNealocate(row)
  if (vechi.length) {
    groups.push({
      clientId: null,
      nume: null,
      lines: vechi.map((l) => ({ key: newKey(), articol: l.articol ?? '', suma: String(l.suma) })),
    })
  }
  if (groups.length === 0) groups.push({ clientId: null, nume: null, lines: [] })

  const guess = articolDinTextBanca(row.descriere) ?? ''
  const rest = restNealocat(row)
  const goale = groups.filter((g) => g.lines.length === 0)
  for (const g of goale) {
    // Restul se pune doar dacă un singur grup e gol; cu doi frați neplătiți nu inventăm
    // o împărțire — recepția scrie sumele.
    const suma = goale.length === 1 && rest > 0.004 ? String(rest) : ''
    g.lines = [{ key: newKey(), articol: guess, suma }]
  }
  return groups
}

// Dialog de facturare per transfer: o singură factură pe numele plătitorului, cu liniile
// grupate pe beneficiar când transferul acoperă mai mulți clienți.
export function FacturaDialog({ row, onClose }: { row: FacturaRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [groups, setGroups] = useState<Group[]>(() => initialGroups(row))
  const [error, setError] = useState<string | null>(null)

  const allLines = groups.flatMap((g) => g.lines)
  const totalLinii = round2(allLines.reduce((a, l) => a + (Number(l.suma) || 0), 0))
  const diferenta = round2(totalLinii - row.suma)
  const valid =
    allLines.length > 0 && allLines.every((l) => l.articol && Number(l.suma) > 0)

  const patchLine = (gi: number, key: string, patch: Partial<LineDraft>) =>
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi
          ? { ...g, lines: g.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }
          : g,
      ),
    )

  const emit = useMutation({
    mutationFn: async () => {
      const item: EmitItem = {
        ref: row.ref,
        client_nume: row.client_nume,
        suma: row.suma,
        data: row.data_tranzactie,
        descriere: row.descriere ?? '',
        valuta: row.valuta,
        client_id: clientIdRegistru(row.alocari ?? []),
        familia_id: familiaIdRegistru(row.alocari ?? []),
        linii: allLines.map((l) => ({ articol: l.articol, suma: Number(l.suma) })),
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
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <div key={g.clientId ?? 'nealocat'} className="space-y-2">
              {groups.length > 1 && (
                <p className="text-xs font-semibold text-muted">{g.nume ?? 'Nealocat'}</p>
              )}
              {g.lines.map((l) => (
                <div key={l.key} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Select
                      options={artOptions}
                      value={l.articol}
                      onChange={(e) => patchLine(gi, l.key, { articol: e.target.value })}
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <TextInput
                      inputMode="decimal"
                      className="text-right"
                      value={l.suma}
                      onChange={(e) => patchLine(gi, l.key, { suma: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setGroups((prev) =>
                        prev.map((x, i) =>
                          i === gi
                            ? { ...x, lines: x.lines.filter((y) => y.key !== l.key) }
                            : x,
                        ),
                      )
                    }
                    className="text-xs text-muted hover:text-red-700"
                    title="Șterge linia"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setGroups((prev) =>
                    prev.map((x, i) =>
                      i === gi
                        ? { ...x, lines: [...x.lines, { key: newKey(), articol: '', suma: '' }] }
                        : x,
                    ),
                  )
                }
                className="text-xs text-muted underline hover:text-ink"
              >
                + linie
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
          <span>Total factură</span>
          <span>
            {fmt(totalLinii)} {row.valuta}
          </span>
        </div>
        {Math.abs(diferenta) > 0.01 && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Totalul liniilor ({fmt(totalLinii)}) diferă de suma transferului (
            {fmt(row.suma)} {row.valuta}) cu {fmt(diferenta)}.
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            disabled={!valid || emit.isPending}
            onClick={() => emit.mutate()}
            title={!valid ? 'Fiecare linie are nevoie de articol și de o sumă > 0' : undefined}
          >
            {emit.isPending ? 'Se emite…' : 'Emite factura'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
