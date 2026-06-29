import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, TextInput, Combobox, Button, Spinner } from '@/components/ui'
import { clientiOptions } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { formatRON } from '@/lib/format'
import type { Enums, VDatoriiRest } from '@/types/db'
import { listDatoriiClient, registerPlataDatoriiFifo } from '../../api'
import { fmtDate, todayIso } from './helpers'
import { MetodaPlataField, resolveTenders, type MetodaSel } from './MetodaPlataField'

type Props = {
  onClose: () => void
  defaultClientId?: string
}

// Tab-ul „Datorii": încasează restul datoriilor one-off (Bilet/Merch/Taxă) ale unui
// client. Bifezi una sau mai multe, opțional sumă parțială, alegi metoda → distribuie
// FIFO peste cele bifate.
export function DatoriiTab({ onClose, defaultClientId }: Props) {
  const queryClient = useQueryClient()
  const { locatieId, locatieNume } = useWorkingLocatie()
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [partial, setPartial] = useState('')
  const [metoda, setMetoda] = useState<MetodaSel>('Cash')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({ queryKey: ['lookup', 'clienti'], queryFn: clientiOptions })

  const datoriiQ = useQuery({
    queryKey: ['datorii', clientId],
    queryFn: () => listDatoriiClient(clientId),
    enabled: Boolean(clientId),
  })

  const rows = useMemo(() => datoriiQ.data ?? [], [datoriiQ.data])
  const checkedRows = useMemo(
    () => rows.filter((r) => r.id && checked.has(String(r.id))),
    [rows, checked],
  )
  const total = useMemo(
    () => checkedRows.reduce((acc, r) => acc + Number(r.rest ?? 0), 0),
    [checkedRows],
  )

  const toggle = (r: VDatoriiRest) => {
    if (!r.id) return
    const key = String(r.id)
    const next = new Set(checked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setChecked(next)
  }

  const reset = () => {
    setChecked(new Set())
    setPartial('')
    setMetoda('Cash')
    setCash('')
    setCard('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    setClientId('')
    onClose()
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (checkedRows.length === 0) throw new Error('Selectează cel puțin o datorie.')
      if (!locatieId) {
        throw new Error('Setează locația de lucru din bara de sus (📍 lângă dată).')
      }
      const partialNum = partial.trim() ? Number(partial) : null
      if (partialNum != null) {
        if (!isFinite(partialNum) || partialNum <= 0)
          throw new Error('Suma parțială invalidă.')
        if (partialNum > total) throw new Error('Suma parțială depășește totalul.')
      }
      const pool = partialNum != null ? partialNum : total
      const tenders = resolveTenders({ metoda, total: pool, cash, card })
      return registerPlataDatoriiFifo({
        clientId,
        datorii: checkedRows.map((r) => ({
          id: String(r.id),
          rest: Number(r.rest ?? 0),
          categorie: (r.categorie ?? 'Taxa') as Enums<'categorie_incasare'>,
          locatie: r.locatie ?? null,
        })),
        partialAmount: partialNum,
        tenders,
        data: todayIso(),
        locatieId,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['datorii'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      handleClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Field label="Cursant">
            <Combobox
              placeholder="Caută cursant (nume sau telefon)…"
              options={clientiQ.data ?? []}
              value={clientId}
              onChange={(v) => {
                setClientId(v)
                if (!v) reset()
              }}
            />
          </Field>
        </div>
        <div className="flex items-end rounded-md bg-quasar-gray-light/30 px-3 py-2 text-xs text-quasar-gray">
          📍 {locatieNume ?? 'fără locație setată'}
        </div>
      </div>

      {!clientId ? (
        <p className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/20 p-4 text-center text-sm text-quasar-gray">
          Selectează un cursant pentru a vedea datoriile (bilet / merch / taxă).
        </p>
      ) : datoriiQ.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/20 p-4 text-center text-sm text-quasar-gray">
          Nicio datorie neachitată.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-quasar-gray-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-quasar-gray-light bg-quasar-gray-light/40">
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2 text-left font-medium text-quasar-black">Categorie</th>
                <th className="px-3 py-2 text-left font-medium text-quasar-black">Descriere</th>
                <th className="px-3 py-2 text-left font-medium text-quasar-black">Data</th>
                <th className="px-3 py-2 text-right font-medium text-quasar-black">Achitat</th>
                <th className="px-3 py-2 text-right font-medium text-quasar-black">Datorat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = String(r.id)
                const isChecked = checked.has(key)
                return (
                  <tr
                    key={key}
                    className={[
                      'border-b border-quasar-gray-light/60 last:border-b-0',
                      isChecked ? 'bg-quasar-yellow/30' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-quasar-yellow"
                        checked={isChecked}
                        onChange={() => toggle(r)}
                      />
                    </td>
                    <td className="px-3 py-2">{r.categorie ?? '—'}</td>
                    <td className="px-3 py-2">{r.descriere ?? '—'}</td>
                    <td className="px-3 py-2">{fmtDate(r.created ? String(r.created).slice(0, 10) : null)}</td>
                    <td className="px-3 py-2 text-right">{Number(r.platit ?? 0)}</td>
                    <td className="px-3 py-2 text-right font-medium">{Number(r.rest ?? 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Plată parțială (opțional)">
          <TextInput
            type="number"
            min="0"
            step="0.01"
            placeholder="ex: 50"
            value={partial}
            onChange={(e) => setPartial(e.target.value)}
            disabled={total <= 0}
          />
        </Field>
        <MetodaPlataField
          metoda={metoda}
          onMetoda={setMetoda}
          total={partial.trim() ? Number(partial) || 0 : total}
          cash={cash}
          card={card}
          onCash={setCash}
          onCard={setCard}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-quasar-gray-light pt-3">
        <div className="mr-auto flex items-center gap-3 text-sm">
          <span className="text-quasar-gray">Total de plată:</span>
          <span className="text-base font-bold text-quasar-black">{formatRON(total)}</span>
        </div>
        <Button variant="secondary" onClick={handleClose}>
          Anulează
        </Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending || total <= 0}>
          {submit.isPending ? 'Se înregistrează…' : 'Înregistrează plată'}
        </Button>
      </div>
    </div>
  )
}
