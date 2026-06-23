import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Field,
  TextInput,
  Select,
  Combobox,
  Button,
  Spinner,
} from '@/components/ui'
import { clientiOptions } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { formatRON } from '@/lib/format'
import type { VPlatiInrolari } from '@/types/db'
import {
  getInrolariClientSezon,
  listSezoane,
  registerPlataFifo,
} from '../../api'
import { fmtDate, todayIso } from './helpers'
import { MetodaPlataField, resolveTenders, type MetodaSel } from './MetodaPlataField'

type Props = {
  onClose: () => void
  onAddInrolare?: (clientId: string) => void
  defaultClientId?: string
}

// Tab-ul „Abonament": selectează cursantul + sezonul, vede toate înrolările
// cursantului în sezon (cu rest neachitat), bifează una sau mai multe în
// ordine cronologică pe curs (FIFO), opțional partial, alege metoda → distribuie
// suma FIFO peste rândurile bifate.
export function AbonamentTab({ onClose, onAddInrolare, defaultClientId }: Props) {
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [sezonId, setSezonId] = useState('')
  const { locatieId, locatieNume } = useWorkingLocatie()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [partial, setPartial] = useState('')
  const [metoda, setMetoda] = useState<MetodaSel>('Cash')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
  })

  const sezoaneQ = useQuery({
    queryKey: ['lookup', 'sezoane-full'],
    queryFn: listSezoane,
  })

  // Auto-pick current season once loaded
  useMemo(() => {
    if (sezonId || !sezoaneQ.data?.length) return
    const today = todayIso()
    const current = sezoaneQ.data.find(
      (s) =>
        (!s.data_incepere || s.data_incepere <= today) &&
        (!s.data_final || s.data_final >= today),
    )
    setSezonId(current?.id ?? sezoaneQ.data[0].id)
  }, [sezoaneQ.data, sezonId])

  const sezon = sezoaneQ.data?.find((s) => s.id === sezonId)

  const inrolariQ = useQuery({
    queryKey: [
      'plata-noua-inrolari',
      clientId,
      sezon?.data_incepere ?? '',
      sezon?.data_final ?? '',
    ],
    queryFn: () =>
      getInrolariClientSezon({
        clientId,
        sezonStart: sezon?.data_incepere ?? null,
        sezonEnd: sezon?.data_final ?? null,
      }),
    enabled: Boolean(clientId && sezon),
  })

  const rows = useMemo(() => inrolariQ.data ?? [], [inrolariQ.data])

  // canCheck(row): toate rândurile anterioare de același id_curs sunt plătite
  // (rest=0) sau bifate. Garantează ordinea FIFO.
  const canCheck = useMemo(() => {
    const map = new Map<string, boolean>()
    const byCurs = new Map<string, VPlatiInrolari[]>()
    for (const r of rows) {
      if (!r.id_curs) continue
      const arr = byCurs.get(r.id_curs) ?? []
      arr.push(r)
      byCurs.set(r.id_curs, arr)
    }
    for (const list of byCurs.values()) {
      for (let i = 0; i < list.length; i++) {
        const earlierUnpaidUnchecked = list
          .slice(0, i)
          .some(
            (prev) =>
              (prev.rest ?? 0) > 0 &&
              !checked.has(String(prev.id_enrollment)),
          )
        map.set(String(list[i].id_enrollment), !earlierUnpaidUnchecked)
      }
    }
    return map
  }, [rows, checked])

  const checkedRowsOrdered = useMemo(
    () =>
      rows.filter(
        (r) => r.id_enrollment && checked.has(String(r.id_enrollment)),
      ),
    [rows, checked],
  )

  const total = useMemo(
    () => checkedRowsOrdered.reduce((acc, r) => acc + Number(r.rest ?? 0), 0),
    [checkedRowsOrdered],
  )

  const toggle = (r: VPlatiInrolari) => {
    if (!r.id_enrollment) return
    const key = String(r.id_enrollment)
    const isChecked = checked.has(key)
    if (isChecked) {
      // La debifare, debifez și rândurile ulterioare ale aceluiași curs
      // (nu mai sunt valide ca selecție FIFO).
      const next = new Set(checked)
      next.delete(key)
      if (r.id_curs) {
        for (const other of rows) {
          if (
            other.id_curs === r.id_curs &&
            other.data_incepere &&
            r.data_incepere &&
            other.data_incepere > r.data_incepere
          ) {
            next.delete(String(other.id_enrollment))
          }
        }
      }
      setChecked(next)
    } else {
      if (!canCheck.get(key)) return
      const next = new Set(checked)
      next.add(key)
      setChecked(next)
    }
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
      if (checkedRowsOrdered.length === 0) {
        throw new Error('Selectează cel puțin o înrolare.')
      }
      if (!locatieId) {
        throw new Error(
          'Setează locația de lucru din bara de sus (📍 lângă data).',
        )
      }
      const partialNum = partial.trim() ? Number(partial) : null
      if (partialNum != null) {
        if (!isFinite(partialNum) || partialNum <= 0)
          throw new Error('Suma parțială invalidă.')
        if (partialNum > total)
          throw new Error('Suma parțială depășește totalul.')
      }
      const pool = partialNum != null ? partialNum : total
      const tenders = resolveTenders({ metoda, total: pool, cash, card })
      return registerPlataFifo({
        enrollmentIds: checkedRowsOrdered.map((r) => String(r.id_enrollment)),
        remaining: checkedRowsOrdered.map((r) => Number(r.rest ?? 0)),
        partialAmount: partialNum,
        metoda: tenders[0].metoda,
        tenders,
        data: todayIso(),
        locatieId,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
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
        <div className="w-56">
          <Field label="În sezonul">
            <Select
              options={(sezoaneQ.data ?? []).map((s) => ({
                value: s.id,
                label: s.numele_sezonului,
              }))}
              value={sezonId}
              onChange={(e) => setSezonId(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex items-end rounded-md bg-quasar-gray-light/30 px-3 py-2 text-xs text-quasar-gray">
          📍 {locatieNume ?? 'fără locație setată'}
        </div>
      </div>

      {!clientId ? (
        <p className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/20 p-4 text-center text-sm text-quasar-gray">
          Selectează un cursant pentru a vedea înrolările.
        </p>
      ) : inrolariQ.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/20 p-4 text-center text-sm text-quasar-gray">
          Nicio înrolare în acest sezon.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-quasar-gray-light">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-quasar-gray-light bg-quasar-gray-light/40">
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2 text-left font-medium text-quasar-black">
                  Numele cursului
                </th>
                <th className="px-3 py-2 text-left font-medium text-quasar-black">
                  Data începere
                </th>
                <th className="px-3 py-2 text-left font-medium text-quasar-black">
                  Tipul înrolării
                </th>
                <th className="px-3 py-2 text-right font-medium text-quasar-black">
                  Achitat
                </th>
                <th className="px-3 py-2 text-right font-medium text-quasar-black">
                  Datorat
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = String(r.id_enrollment)
                const isChecked = checked.has(key)
                const allowed = canCheck.get(key) ?? false
                const rest = Number(r.rest ?? 0)
                return (
                  <tr
                    key={key}
                    className={[
                      'border-b border-quasar-gray-light/60 last:border-b-0',
                      isChecked ? 'bg-quasar-yellow/30' : '',
                      rest === 0 ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-quasar-yellow"
                        checked={isChecked}
                        onChange={() => toggle(r)}
                        disabled={rest === 0 || (!isChecked && !allowed)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span>{r.nume_curs ?? '—'}</span>
                      {r.cod_voucher && (
                        <span className="ml-2 inline-block rounded bg-quasar-yellow/40 px-1.5 py-0.5 text-xs font-medium text-quasar-black">
                          {r.cod_voucher}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{fmtDate(r.data_incepere)}</td>
                    <td className="px-3 py-2">{r.tip_plata ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(r.platit ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{rest}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {onAddInrolare && (
            <div className="border-t border-quasar-gray-light bg-quasar-gray-light/20 px-3 py-2">
              <Button
                variant="secondary"
                onClick={() => onAddInrolare(clientId)}
              >
                + Adaugă înrolare
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Plată parțială (opțional)">
          <TextInput
            type="number"
            min="0"
            step="0.01"
            placeholder="ex: 500"
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
          <span className="text-base font-bold text-quasar-black">
            {formatRON(total)}
          </span>
        </div>
        <Button variant="secondary" onClick={handleClose}>
          Anulează
        </Button>
        <Button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || total <= 0}
        >
          {submit.isPending ? 'Se înregistrează…' : 'Înregistrează plată'}
        </Button>
      </div>
    </div>
  )
}
