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
  getPlanPlataIntegrala,
  incaseazaPlataIntegrala,
  listDatoriiClient,
  listSezoane,
  registerPlataDatoriiFifo,
  registerPlataFifo,
  getClientCredit,
  useClientCredit,
} from '../../api'
import { fmtDate, todayIso } from './helpers'
import {
  MetodaPlataField,
  resolveTenders,
  type MetodaSel,
  type Tender,
} from './MetodaPlataField'
import { articolDatorie, articolInrolare } from '@/features/facturare/articolResolver'
import type { FacturaLinie } from '@/features/facturare/types'

type Props = {
  onClose: () => void
  onAddInrolare?: (clientId: string) => void
  defaultClientId?: string
  defaultSuma?: number
  defaultMetoda?: MetodaSel
  // clientId e cel din formular la momentul salvării, nu defaultClientId: selectorul de
  // cursant rămâne editabil, iar apelantul (fluxul bancă) atribuie plata pe cine trebuie.
  onRecorded?: (linii: FacturaLinie[], clientId: string) => void
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
export function DatoriiUnificateTab({
  onClose,
  onAddInrolare,
  defaultClientId,
  defaultSuma,
  defaultMetoda,
  onRecorded,
}: Props) {
  const queryClient = useQueryClient()
  const { locatieId, locatieNume } = useWorkingLocatie()
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [sezonId, setSezonId] = useState('')
  const [checkedEnroll, setCheckedEnroll] = useState<Set<string>>(new Set())
  const [checkedDat, setCheckedDat] = useState<Set<string>>(new Set())
  const [partial, setPartial] = useState(defaultSuma ? String(defaultSuma) : '')
  const [metoda, setMetoda] = useState<MetodaSel>(defaultMetoda ?? 'Cash')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [useCreditOn, setUseCreditOn] = useState(false)
  const [useCreditAmt, setUseCreditAmt] = useState('')
  const [integralOn, setIntegralOn] = useState(false)
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

  // Oferta de plată integrală (−5%, Anexa 1): eligibilitatea o decide DB-ul, aceeași
  // funcție care servește și portalul — recepția nu are voie să ajungă la alt preț.
  const planIntegralQ = useQuery({
    queryKey: ['plan-integral', clientId],
    queryFn: () => getPlanPlataIntegrala(clientId),
    enabled: Boolean(clientId),
  })
  const planIntegral = planIntegralQ.data
  const integralOferit =
    planIntegral?.eligibil === true && (!sezonId || planIntegral.sezon_id === sezonId)
  const integralActiv = integralOn && integralOferit && planIntegral?.eligibil === true

  const creditQ = useQuery({
    queryKey: ['client-credit', clientId],
    queryFn: () => getClientCredit(clientId),
    enabled: Boolean(clientId),
  })
  const credit = creditQ.data ?? 0

  const curentRows = useMemo(() => inrolariQ.data ?? [], [inrolariQ.data])
  const anteriorRows = useMemo(() => inrolariAntQ.data ?? [], [inrolariAntQ.data])
  // Sursă unică pentru FIFO/totaluri/plată: anterioare + curente (curs distinct ⇒
  // gruparea FIFO pe curs rămâne independentă).
  const enrollRows = useMemo(
    () => [...anteriorRows, ...curentRows],
    [anteriorRows, curentRows],
  )
  const datRows = useMemo(() => datoriiQ.data ?? [], [datoriiQ.data])

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

  // Credit: câți lei din creditul clientului acoperă selecția (întâi înrolări).
  // creditApplied e mereu clampat la min(dorit, disponibil, pool) → sigur chiar
  // dacă inputul e stale. cashPool = restul de încasat Cash/Card.
  const poolDisplay = integralActiv
    ? planIntegral.total_plata
    : partial.trim()
      ? Number(partial) || 0
      : total
  const creditWanted = integralActiv ? 0 : useCreditOn ? Number(useCreditAmt) || 0 : 0
  const creditApplied = round2(Math.min(creditWanted, credit, Math.max(poolDisplay, 0)))
  const cashPool = round2(Math.max(poolDisplay - creditApplied, 0))

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
      const next = new Set(checkedEnroll)
      next.add(key)
      // FIFO: bifez automat și lunile anterioare neachitate ale aceluiași curs.
      if (r.id_curs) {
        for (const other of enrollRows) {
          if (
            other.id_curs === r.id_curs &&
            other.data_incepere &&
            r.data_incepere &&
            other.data_incepere < r.data_incepere &&
            Number(other.rest ?? 0) > 0
          ) {
            next.add(String(other.id_enrollment))
          }
        }
      }
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
    // Revenim la metoda cu care s-a deschis modalul, nu la Cash: din fluxul bancă
    // schimbarea cursantului transforma tăcut un transfer în numerar.
    setMetoda(defaultMetoda ?? 'Cash')
    setCash('')
    setCard('')
    setUseCreditOn(false)
    setUseCreditAmt('')
    setIntegralOn(false)
    setError(null)
  }
  const handleClose = () => {
    reset()
    setClientId('')
    onClose()
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!locatieId) {
        throw new Error('Setează locația de lucru din bara de sus (📍 lângă dată).')
      }

      // Plata integrală a sezonului: un singur RPC, care recalculează el prețurile.
      // Nu trece prin FIFO — nu alegem noi ce rate se achită, ci tot contractul.
      if (integralActiv && planIntegral.eligibil) {
        const tenders = resolveTenders({
          metoda,
          total: planIntegral.total_plata,
          cash,
          card,
        })
        await incaseazaPlataIntegrala({
          clientId,
          tenders,
          data: todayIso(),
          locatieId,
        })
        const platiPeRand = new Map(
          planIntegral.plan.map((r) => [r.enrollment_id, Number(r.pay)]),
        )
        const linii: FacturaLinie[] = []
        for (const r of enrollRows) {
          const suma = platiPeRand.get(String(r.id_enrollment))
          if (suma != null && suma > 0.004) {
            linii.push({ articol: articolInrolare(r), suma: round2(suma) })
          }
        }
        return { linii, clientId }
      }

      if (checkedEnrollOrdered.length === 0 && checkedDatRows.length === 0) {
        throw new Error('Selectează cel puțin o datorie.')
      }
      const partialNum = partial.trim() ? Number(partial) : null
      if (partialNum != null) {
        if (!isFinite(partialNum) || partialNum <= 0)
          throw new Error('Suma parțială invalidă.')
        if (partialNum > total) throw new Error('Suma parțială depășește totalul.')
      }
      const pool = partialNum != null ? partialNum : total

      // Linii pentru factură (FGO): alocarea pool-ului pe itemele bifate, în ordine
      // FIFO (întâi înrolări, apoi datorii), fiecare → { articol derivat, suma alocată }.
      const linii: FacturaLinie[] = []
      let remLine = pool
      for (const r of checkedEnrollOrdered) {
        if (remLine <= 0.004) break
        const s = round2(Math.min(Number(r.rest ?? 0), remLine))
        if (s <= 0.004) continue
        linii.push({ articol: articolInrolare(r), suma: s })
        remLine = round2(remLine - s)
      }
      for (const r of checkedDatRows) {
        if (remLine <= 0.004) break
        const s = round2(Math.min(Number(r.rest ?? 0), remLine))
        if (s <= 0.004) continue
        linii.push({ articol: articolDatorie(r), suma: s })
        remLine = round2(remLine - s)
      }

      // Împart pool-ul: întâi din credit (dacă activ), apoi Cash/Card. Ambele
      // acoperă întâi înrolările, apoi datoriile one-off.
      const creditUse = useCreditOn ? Number(useCreditAmt) || 0 : 0
      const creditApply = round2(Math.min(creditUse, credit, pool))
      const cashAmt = round2(pool - creditApply)
      const creditEnroll = round2(Math.min(creditApply, totalEnroll))
      const creditDat = round2(creditApply - creditEnroll)

      // Cât credit alocăm pe fiecare rând bifat (FIFO), reținut pentru a reduce
      // rest-ul trecut motorului Cash/Card.
      const creditByEnroll = new Map<string, number>()
      let remCredE = creditEnroll
      for (const r of checkedEnrollOrdered) {
        if (remCredE <= 0.004) break
        const take = round2(Math.min(remCredE, Number(r.rest ?? 0)))
        if (take <= 0.004) continue
        creditByEnroll.set(String(r.id_enrollment), take)
        remCredE = round2(remCredE - take)
      }
      const creditByDat = new Map<string, number>()
      let remCredD = creditDat
      for (const r of checkedDatRows) {
        if (remCredD <= 0.004) break
        const take = round2(Math.min(remCredD, Number(r.rest ?? 0)))
        if (take <= 0.004) continue
        creditByDat.set(String(r.id), take)
        remCredD = round2(remCredD - take)
      }

      // Faza 1 — alocă creditul pe fiecare țintă (RPC-ul acceptă o țintă/apel).
      // Doar mută bani existenți: dacă Cash-ul de mai jos eșuează, ce s-a alocat
      // aici rămâne valid (a redus datoria real).
      for (const r of checkedEnrollOrdered) {
        const amt = creditByEnroll.get(String(r.id_enrollment)) ?? 0
        if (amt > 0.004) {
          await useClientCredit({
            clientId,
            amount: amt,
            action: 'allocate',
            targetType: 'enrollment',
            targetId: String(r.id_enrollment),
          })
        }
      }
      for (const r of checkedDatRows) {
        const amt = creditByDat.get(String(r.id)) ?? 0
        if (amt > 0.004) {
          await useClientCredit({
            clientId,
            amount: amt,
            action: 'allocate',
            targetType: 'datorie',
            targetId: String(r.id),
          })
        }
      }

      // Faza 2 — Cash/Card pe restul, cu rest-ul redus post-credit.
      if (cashAmt > 0.004) {
        const tenders = resolveTenders({ metoda, total: cashAmt, cash, card })
        const enrollmentPay = round2(Math.min(cashAmt, round2(totalEnroll - creditEnroll)))
        const datoriiPay = round2(cashAmt - enrollmentPay)
        const [enrollTenders, datTenders] = splitTenders(tenders, enrollmentPay)

        if (enrollmentPay > 0.004 && checkedEnrollOrdered.length) {
          await registerPlataFifo({
            clientId,
            enrollmentIds: checkedEnrollOrdered.map((r) => String(r.id_enrollment)),
            remaining: checkedEnrollOrdered.map((r) =>
              round2(Number(r.rest ?? 0) - (creditByEnroll.get(String(r.id_enrollment)) ?? 0)),
            ),
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
                rest: round2(Number(r.rest ?? 0) - (creditByDat.get(String(r.id)) ?? 0)),
                categorie: (r.categorie ?? 'Taxa') as Enums<'categorie_incasare'>,
                locatie: r.locatie ?? null,
              })),
              partialAmount: datoriiPay,
              tenders: datTenders,
              data: todayIso(),
              locatieId,
            })
          } catch (e) {
            if (enrollmentPay > 0.004 || creditApply > 0.004) {
              throw new Error(
                'Abonamentele/creditul au fost aplicate, dar datoriile NU — reîncearcă doar datoriile.',
              )
            }
            throw e
          }
        }
      }

      return { linii, clientId }
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari-ant'] })
      void queryClient.invalidateQueries({ queryKey: ['datorii'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['client-credit'] })
      void queryClient.invalidateQueries({ queryKey: ['surplus-targets'] })
      void queryClient.invalidateQueries({ queryKey: ['plati-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['plan-integral'] })
      onRecorded?.(data.linii, data.clientId)
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
          {integralOferit && planIntegral.eligibil && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    💛 Plată integrală pe tot sezonul — reducere 5%
                  </p>
                  <p className="text-xs text-amber-800">
                    {formatRON(planIntegral.total_curent)} →{' '}
                    <strong>{formatRON(planIntegral.total_plata)}</strong> ({planIntegral.luni}{' '}
                    rate) · economie {formatRON(planIntegral.discount)} · doar până la{' '}
                    {fmtDate(planIntegral.scadenta)}
                  </p>
                </div>
                <Button
                  variant={integralOn ? 'secondary' : 'primary'}
                  onClick={() => setIntegralOn(!integralOn)}
                >
                  {integralOn ? 'Renunță la reducere' : 'Încasează tot sezonul −5%'}
                </Button>
              </div>
              {integralOn && (
                <p className="rounded-md bg-amber-100 px-2 py-1 text-xs">
                  Se încasează toate cele {planIntegral.luni} rate ale sezonului, la prețul
                  redus — selecția de mai jos e ignorată. Reducerea nu se cumulează: ratele
                  care au deja −10% de familie rămân la ea.
                </p>
              )}
            </div>
          )}

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
                              className="h-4 w-4 rounded accent-quasar-yellow disabled:opacity-40"
                              checked={isChecked}
                              onChange={() => toggleEnroll(r)}
                              disabled={rest === 0 || integralActiv}
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
                              disabled={integralActiv}
                              className="h-4 w-4 rounded accent-quasar-yellow disabled:opacity-40"
                              checked={isChecked}
                              onChange={() => toggleEnroll(r)}
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
                              disabled={integralActiv}
                              className="h-4 w-4 rounded accent-quasar-yellow disabled:opacity-40"
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

          {/* Credit în favoarea clientului — acoperă (parțial/total) selecția */}
          {credit > 0 && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  disabled={integralActiv}
                  className="h-4 w-4 rounded accent-blue-600 disabled:opacity-40"
                  checked={useCreditOn}
                  onChange={(e) => {
                    setUseCreditOn(e.target.checked)
                    if (e.target.checked && !useCreditAmt) {
                      setUseCreditAmt(String(round2(Math.min(credit, poolDisplay))))
                    }
                  }}
                />
                💳 Folosește din credit — disponibil {formatRON(credit)}
              </label>
              {useCreditOn && (
                <div className="flex flex-wrap items-center gap-3 pl-6">
                  <div className="w-40">
                    <TextInput
                      type="number"
                      min="0"
                      step="0.01"
                      value={useCreditAmt}
                      onChange={(e) => setUseCreditAmt(e.target.value)}
                    />
                  </div>
                  <span className="text-xs text-blue-800">
                    Se acoperă {formatRON(creditApplied)} din credit; rest de încasat{' '}
                    {formatRON(cashPool)}.
                  </span>
                </div>
              )}
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
            placeholder="ex: 100"
            value={partial}
            onChange={(e) => setPartial(e.target.value)}
            disabled={total <= 0 || integralActiv}
          />
        </Field>
        <MetodaPlataField
          metoda={metoda}
          onMetoda={setMetoda}
          total={cashPool}
          cash={cash}
          card={card}
          onCash={setCash}
          onCard={setCard}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-quasar-gray-light pt-3">
        <div className="mr-auto flex flex-col gap-0.5 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-quasar-gray">Total de plată:</span>
            <span className="text-base font-bold text-quasar-black">
              {formatRON(integralActiv ? planIntegral.total_plata : total)}
            </span>
          </div>
          {integralActiv && (
            <span className="text-xs text-amber-800">
              Sezon integral, reducere aplicată: −{formatRON(planIntegral.discount)}
            </span>
          )}
          {creditApplied > 0.004 && (
            <span className="text-xs text-blue-800">
              Din credit: {formatRON(creditApplied)} · De încasat: {formatRON(cashPool)}
            </span>
          )}
        </div>
        <Button variant="secondary" onClick={handleClose}>
          Anulează
        </Button>
        <Button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || (creditApplied <= 0.004 && cashPool <= 0.004)}
        >
          {submit.isPending
            ? 'Se înregistrează…'
            : integralActiv
              ? 'Încasează sezonul integral'
              : 'Înregistrează plată'}
        </Button>
      </div>
    </div>
  )
}
