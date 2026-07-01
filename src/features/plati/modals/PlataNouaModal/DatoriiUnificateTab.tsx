import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field, TextInput, Select, Combobox, Button, Spinner } from '@/components/ui'
import { clientiOptions } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { formatRON } from '@/lib/format'
import type { Enums, VDatoriiRest, VPlatiInrolari } from '@/types/db'
import {
  getInrolariClientSezon,
  getInrolariRestanteAnterioare,
  listDatoriiClient,
  listSezoane,
  registerPlataDatoriiFifo,
  registerPlataFifo,
} from '../../api'
import { fmtDate, todayIso } from './helpers'
import {
  MetodaPlataField,
  resolveTenders,
  type MetodaSel,
  type Tender,
} from './MetodaPlataField'

type Props = {
  onClose: () => void
  onAddInrolare?: (clientId: string) => void
  defaultClientId?: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Împarte lista de tenders (Cash/Card) în două felii: prima însumând `firstAmount`
// (înrolări), restul (datorii). Taie ultimul tender la graniță dacă e nevoie.
function splitTenders(tenders: Tender[], firstAmount: number): [Tender[], Tender[]] {
  const a: Tender[] = []
  const b: Tender[] = []
  let remaining = round2(firstAmount)
  for (const t of tenders) {
    if (remaining <= 0.004) {
      b.push(t)
    } else if (t.suma <= remaining + 0.004) {
      a.push(t)
      remaining = round2(remaining - t.suma)
    } else {
      a.push({ metoda: t.metoda, suma: round2(remaining) })
      b.push({ metoda: t.metoda, suma: round2(t.suma - remaining) })
      remaining = 0
    }
  }
  return [a.filter((t) => t.suma > 0.004), b.filter((t) => t.suma > 0.004)]
}

// Tab unificat de colectare a datoriilor: la selectarea clientului arată TOT ce are
// de plată — rate înrolări (FIFO pe curs, pe sezon) + datorii one-off (bilet / merch /
// taxă / închiriere). Bifezi din ambele, opțional parțial, o singură încasare.
export function DatoriiUnificateTab({ onClose, onAddInrolare, defaultClientId }: Props) {
  const queryClient = useQueryClient()
  const { locatieId, locatieNume } = useWorkingLocatie()
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [sezonId, setSezonId] = useState('')
  const [checkedEnroll, setCheckedEnroll] = useState<Set<string>>(new Set())
  const [checkedDat, setCheckedDat] = useState<Set<string>>(new Set())
  const [partial, setPartial] = useState('')
  const [metoda, setMetoda] = useState<MetodaSel>('Cash')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [error, setError] = useState<string | null>(null)

  const clientiQ = useQuery({ queryKey: ['lookup', 'clienti'], queryFn: clientiOptions })
  const sezoaneQ = useQuery({ queryKey: ['lookup', 'sezoane-full'], queryFn: listSezoane })

  // Auto-pick sezonul curent o dată încărcat.
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
    queryKey: ['plata-noua-inrolari', clientId, sezon?.data_incepere ?? '', sezon?.data_final ?? ''],
    queryFn: () =>
      getInrolariClientSezon({
        clientId,
        sezonStart: sezon?.data_incepere ?? null,
        sezonEnd: sezon?.data_final ?? null,
      }),
    enabled: Boolean(clientId && sezon),
  })

  // Restanțe de abonament din sezoanele anterioare (informativ + încasabil opțional).
  const inrolariAntQ = useQuery({
    queryKey: ['plata-noua-inrolari-ant', clientId, sezon?.data_incepere ?? ''],
    queryFn: () =>
      getInrolariRestanteAnterioare({
        clientId,
        sezonStart: sezon?.data_incepere ?? null,
      }),
    enabled: Boolean(clientId && sezon?.data_incepere),
  })

  const datoriiQ = useQuery({
    queryKey: ['datorii', clientId],
    queryFn: () => listDatoriiClient(clientId),
    enabled: Boolean(clientId),
  })

  const curentRows = useMemo(() => inrolariQ.data ?? [], [inrolariQ.data])
  const anteriorRows = useMemo(() => inrolariAntQ.data ?? [], [inrolariAntQ.data])
  // Sursă unică pentru FIFO/totaluri/plată: anterioare + curente (curs distinct ⇒
  // gruparea FIFO pe curs rămâne independentă).
  const enrollRows = useMemo(
    () => [...anteriorRows, ...curentRows],
    [anteriorRows, curentRows],
  )
  const datRows = useMemo(() => datoriiQ.data ?? [], [datoriiQ.data])

  // canCheck: pentru un rând de înrolare, toate rândurile anterioare de același curs
  // sunt plătite (rest=0) sau bifate → garantează FIFO pe curs.
  const canCheck = useMemo(() => {
    const map = new Map<string, boolean>()
    const byCurs = new Map<string, VPlatiInrolari[]>()
    for (const r of enrollRows) {
      if (!r.id_curs) continue
      const arr = byCurs.get(r.id_curs) ?? []
      arr.push(r)
      byCurs.set(r.id_curs, arr)
    }
    for (const list of byCurs.values()) {
      for (let i = 0; i < list.length; i++) {
        const earlierUnpaidUnchecked = list
          .slice(0, i)
          .some((prev) => (prev.rest ?? 0) > 0 && !checkedEnroll.has(String(prev.id_enrollment)))
        map.set(String(list[i].id_enrollment), !earlierUnpaidUnchecked)
      }
    }
    return map
  }, [enrollRows, checkedEnroll])

  const checkedEnrollOrdered = useMemo(
    () => enrollRows.filter((r) => r.id_enrollment && checkedEnroll.has(String(r.id_enrollment))),
    [enrollRows, checkedEnroll],
  )
  const checkedDatRows = useMemo(
    () => datRows.filter((r) => r.id && checkedDat.has(String(r.id))),
    [datRows, checkedDat],
  )

  const totalEnroll = useMemo(
    () => checkedEnrollOrdered.reduce((a, r) => a + Number(r.rest ?? 0), 0),
    [checkedEnrollOrdered],
  )
  const totalDat = useMemo(
    () => checkedDatRows.reduce((a, r) => a + Number(r.rest ?? 0), 0),
    [checkedDatRows],
  )
  const total = round2(totalEnroll + totalDat)

  const toggleEnroll = (r: VPlatiInrolari) => {
    if (!r.id_enrollment) return
    const key = String(r.id_enrollment)
    if (checkedEnroll.has(key)) {
      const next = new Set(checkedEnroll)
      next.delete(key)
      // Debifez și rândurile ulterioare ale aceluiași curs (FIFO invalid).
      if (r.id_curs) {
        for (const other of enrollRows) {
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
      setCheckedEnroll(next)
    } else {
      if (!canCheck.get(key)) return
      const next = new Set(checkedEnroll)
      next.add(key)
      setCheckedEnroll(next)
    }
  }

  const toggleDat = (r: VDatoriiRest) => {
    if (!r.id) return
    const key = String(r.id)
    const next = new Set(checkedDat)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCheckedDat(next)
  }

  const reset = () => {
    setCheckedEnroll(new Set())
    setCheckedDat(new Set())
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
      if (checkedEnrollOrdered.length === 0 && checkedDatRows.length === 0) {
        throw new Error('Selectează cel puțin o datorie.')
      }
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

      // Plătim ÎNTÂI înrolările (obligația recurentă), apoi datoriile one-off.
      const enrollmentPay = round2(Math.min(pool, totalEnroll))
      const datoriiPay = round2(pool - enrollmentPay)
      const [enrollTenders, datTenders] = splitTenders(tenders, enrollmentPay)

      if (enrollmentPay > 0.004 && checkedEnrollOrdered.length) {
        await registerPlataFifo({
          clientId,
          enrollmentIds: checkedEnrollOrdered.map((r) => String(r.id_enrollment)),
          remaining: checkedEnrollOrdered.map((r) => Number(r.rest ?? 0)),
          partialAmount: enrollmentPay,
          metoda: enrollTenders[0].metoda,
          tenders: enrollTenders,
          data: todayIso(),
          locatieId,
        })
      }

      if (datoriiPay > 0.004 && checkedDatRows.length) {
        try {
          await registerPlataDatoriiFifo({
            clientId,
            datorii: checkedDatRows.map((r) => ({
              id: String(r.id),
              rest: Number(r.rest ?? 0),
              categorie: (r.categorie ?? 'Taxa') as Enums<'categorie_incasare'>,
              locatie: r.locatie ?? null,
            })),
            partialAmount: datoriiPay,
            tenders: datTenders,
            data: todayIso(),
            locatieId,
          })
        } catch (e) {
          if (enrollmentPay > 0.004) {
            throw new Error(
              'Abonamentele au fost încasate, dar datoriile NU — reîncearcă doar datoriile.',
            )
          }
          throw e
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari-ant'] })
      void queryClient.invalidateQueries({ queryKey: ['datorii'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      handleClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const loading = inrolariQ.isLoading || inrolariAntQ.isLoading || datoriiQ.isLoading
  const nimic = clientId && !loading && enrollRows.length === 0 && datRows.length === 0

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
          <Field label="Sezon (abonamente)">
            <Select
              options={(sezoaneQ.data ?? []).map((s) => ({ value: s.id, label: s.numele_sezonului }))}
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
          Selectează un cursant pentru a vedea tot ce are de plată.
        </p>
      ) : loading ? (
        <Spinner />
      ) : nimic ? (
        <p className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/20 p-4 text-center text-sm text-quasar-gray">
          Nicio datorie neachitată.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Abonamente / înrolări */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-quasar-black">
                Abonamente (sezon {sezon?.numele_sezonului ?? '—'})
              </h3>
              {onAddInrolare && (
                <Button variant="secondary" onClick={() => onAddInrolare(clientId)}>
                  + Adaugă înrolare
                </Button>
              )}
            </div>
            {curentRows.length === 0 ? (
              <p className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/10 p-3 text-sm text-quasar-gray">
                Nicio înrolare în acest sezon.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-quasar-gray-light">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-quasar-gray-light bg-quasar-gray-light/40">
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2 text-left font-medium text-quasar-black">Curs</th>
                      <th className="px-3 py-2 text-left font-medium text-quasar-black">Începere</th>
                      <th className="px-3 py-2 text-left font-medium text-quasar-black">Tip</th>
                      <th className="px-3 py-2 text-right font-medium text-quasar-black">Achitat</th>
                      <th className="px-3 py-2 text-right font-medium text-quasar-black">Datorat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curentRows.map((r) => {
                      const key = String(r.id_enrollment)
                      const isChecked = checkedEnroll.has(key)
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
                              onChange={() => toggleEnroll(r)}
                              disabled={rest === 0 || (!isChecked && !allowed)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {r.nume_curs ?? '—'}
                            {r.cod_voucher && (
                              <span className="ml-2 inline-block rounded bg-quasar-yellow/40 px-1.5 py-0.5 text-xs font-medium text-quasar-black">
                                {r.cod_voucher}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">{fmtDate(r.data_incepere)}</td>
                          <td className="px-3 py-2">{r.tip_plata ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{Number(r.platit ?? 0)}</td>
                          <td className="px-3 py-2 text-right font-medium">{rest}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Restanțe abonamente din sezoane anterioare (informativ + încasabil opțional) */}
          {anteriorRows.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-amber-700">
                Restanțe din sezoane anterioare (neachitate)
              </h3>
              <p className="mb-2 text-xs text-quasar-gray">
                Opțional — poți încasa aceste restanțe acum, dar nu blochează plata sezonului curent.
              </p>
              <div className="overflow-hidden rounded-md border border-amber-300">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-amber-300 bg-amber-100/60">
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2 text-left font-medium text-quasar-black">Curs</th>
                      <th className="px-3 py-2 text-left font-medium text-quasar-black">Începere</th>
                      <th className="px-3 py-2 text-left font-medium text-quasar-black">Tip</th>
                      <th className="px-3 py-2 text-right font-medium text-quasar-black">Achitat</th>
                      <th className="px-3 py-2 text-right font-medium text-quasar-black">Datorat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anteriorRows.map((r) => {
                      const key = String(r.id_enrollment)
                      const isChecked = checkedEnroll.has(key)
                      const allowed = canCheck.get(key) ?? false
                      const rest = Number(r.rest ?? 0)
                      return (
                        <tr
                          key={key}
                          className={[
                            'border-b border-amber-200/70 last:border-b-0',
                            isChecked ? 'bg-quasar-yellow/30' : 'bg-amber-50/40',
                          ].join(' ')}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded accent-quasar-yellow"
                              checked={isChecked}
                              onChange={() => toggleEnroll(r)}
                              disabled={!isChecked && !allowed}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {r.nume_curs ?? '—'}
                            {r.cod_voucher && (
                              <span className="ml-2 inline-block rounded bg-quasar-yellow/40 px-1.5 py-0.5 text-xs font-medium text-quasar-black">
                                {r.cod_voucher}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">{fmtDate(r.data_incepere)}</td>
                          <td className="px-3 py-2">{r.tip_plata ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{Number(r.platit ?? 0)}</td>
                          <td className="px-3 py-2 text-right font-medium">{rest}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Datorii one-off */}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-quasar-black">
              Alte datorii (bilet / merch / taxă / închiriere)
            </h3>
            {datRows.length === 0 ? (
              <p className="rounded-md border border-quasar-gray-light bg-quasar-gray-light/10 p-3 text-sm text-quasar-gray">
                Nicio datorie one-off.
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
                    {datRows.map((r) => {
                      const key = String(r.id)
                      const isChecked = checkedDat.has(key)
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
                              onChange={() => toggleDat(r)}
                            />
                          </td>
                          <td className="px-3 py-2">{r.categorie ?? '—'}</td>
                          <td className="px-3 py-2">{r.descriere ?? '—'}</td>
                          <td className="px-3 py-2">
                            {fmtDate(r.created ? String(r.created).slice(0, 10) : null)}
                          </td>
                          <td className="px-3 py-2 text-right">{Number(r.platit ?? 0)}</td>
                          <td className="px-3 py-2 text-right font-medium">{Number(r.rest ?? 0)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Plată parțială (opțional)">
          <TextInput
            type="number"
            min="0"
            step="0.01"
            placeholder="ex: 100"
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
