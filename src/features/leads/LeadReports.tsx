import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Select, Spinner } from '@/components/ui'
import { campaniiOptions, sezonActiv } from '@/lib/lookups'
import { listUsers } from '@/features/setari/utilizatoriApi'
import type { Lead } from '@/types/db'
import { listLeads, getLeadFunnelGlobal } from './api'
import { GRUPA_LABELS, GRUPE, LOCATII } from './constants'

// Perioada cohortei de funnel (data intrării lead-ului).
type Perioada = 'sezon' | 'luna' | 'tot'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

type Bucket = {
  key: string
  label: string
  total: number
  convertiti: number
  pierduti: number
}

function aggregate(
  leads: Lead[],
  keyOf: (l: Lead) => string,
  labelOf: (k: string) => string,
): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const l of leads) {
    const k = keyOf(l)
    let b = map.get(k)
    if (!b) {
      b = { key: k, label: labelOf(k), total: 0, convertiti: 0, pierduti: 0 }
      map.set(k, b)
    }
    b.total++
    if (l.status === 'convertit') b.convertiti++
    if (l.status === 'pierdut') b.pierduti++
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

function rata(b: Bucket): string {
  return b.total
    ? `${Math.round((b.convertiti / b.total) * 100)}%`
    : '—'
}

function BreakdownTable({
  titlu,
  coloana,
  buckets,
}: {
  titlu: string
  coloana: string
  buckets: Bucket[]
}) {
  return (
    <section className="rounded-lg border border-quasar-gray-light bg-white">
      <h3 className="border-b border-quasar-gray-light px-3 py-2 text-sm font-semibold text-quasar-black">
        {titlu}
      </h3>
      {buckets.length === 0 ? (
        <p className="px-3 py-3 text-sm text-quasar-gray">Fără date.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-quasar-gray">
              <th className="px-3 py-1.5 font-medium">{coloana}</th>
              <th className="px-3 py-1.5 text-right font-medium">Total</th>
              <th className="px-3 py-1.5 text-right font-medium">Convertiți</th>
              <th className="px-3 py-1.5 text-right font-medium">Pierduți</th>
              <th className="px-3 py-1.5 text-right font-medium">Rată</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr
                key={b.key}
                className="border-t border-quasar-gray-light/60"
              >
                <td className="px-3 py-1.5 text-quasar-black">{b.label}</td>
                <td className="px-3 py-1.5 text-right">{b.total}</td>
                <td className="px-3 py-1.5 text-right text-green-700">
                  {b.convertiti}
                </td>
                <td className="px-3 py-1.5 text-right text-quasar-gray">
                  {b.pierduti}
                </td>
                <td className="px-3 py-1.5 text-right font-medium">
                  {rata(b)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function LeadReports() {
  const [locatie, setLocatie] = useState('')
  const [grupa, setGrupa] = useState('')
  const [perioada, setPerioada] = useState<Perioada>('sezon')
  const leadsQ = useQuery({ queryKey: ['leads'], queryFn: listLeads })
  const sezonQ = useQuery({
    queryKey: ['lookup', 'sezon-activ-detalii'],
    queryFn: sezonActiv,
  })
  const campaniiQ = useQuery({
    queryKey: ['lookup', 'campanii'],
    queryFn: campaniiOptions,
  })
  const usersQ = useQuery({
    queryKey: ['lookup', 'users'],
    queryFn: listUsers,
    retry: false,
  })

  const campaniiById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of campaniiQ.data ?? []) m.set(c.value, c.label)
    return m
  }, [campaniiQ.data])

  const usersById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of usersQ.data ?? []) m.set(u.id, u.email ?? u.id)
    return m
  }, [usersQ.data])

  // Intervalul cohortei [from, to] pe data intrării lead-ului (leads.created).
  const range = useMemo(() => {
    const today = ymd(new Date())
    if (perioada === 'luna') {
      const d = new Date()
      return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: today }
    }
    if (perioada === 'sezon' && sezonQ.data) {
      return {
        from: sezonQ.data.data_incepere.slice(0, 10),
        to: sezonQ.data.data_final.slice(0, 10),
      }
    }
    // „Tot istoricul" (și fallback dacă sezonul încă se încarcă).
    return { from: '2019-01-01', to: today }
  }, [perioada, sezonQ.data])

  // Aceeași semantică de filtrare ca în Kanban (match exact pe câmpul lead-ului),
  // plus cohorta pe perioadă — coerentă cu funnel-ul.
  const leads = useMemo(() => {
    return (leadsQ.data ?? []).filter((l) => {
      if (locatie && l.locatia !== locatie) return false
      if (grupa && l.grupa_varsta !== grupa) return false
      const zi = (l.created ?? '').slice(0, 10)
      if (zi && (zi < range.from || zi > range.to)) return false
      return true
    })
  }, [leadsQ.data, locatie, grupa, range])

  // Funnel cumulativ istoric — semnale persistente din get_lead_funnel (un lead
  // avansat rămâne numărat la treptele anterioare), NU statusul curent.
  const funnelQ = useQuery({
    queryKey: ['lead-funnel', range.from, range.to, locatie, grupa],
    queryFn: () => getLeadFunnelGlobal(range.from, range.to, locatie || null, grupa || null),
  })

  const funnel = funnelQ.data
  const funnelStages = funnel
    ? [
        { key: 'noi', label: 'Noi', count: funnel.noi },
        { key: 'contactati', label: 'Contactați', count: funnel.contactati },
        { key: 'programati', label: 'Programați', count: funnel.programati },
        { key: 'prezenti', label: 'Au venit', count: funnel.prezenti },
        { key: 'convertiti', label: 'Convertiți', count: funnel.convertiti },
      ]
    : []

  const total = funnel?.noi ?? 0
  const convertiti = funnel?.convertiti ?? 0

  const perSursa = useMemo(
    () =>
      aggregate(
        leads,
        (l) => l.sursa ?? '—',
        (k) => (k === '—' ? 'Fără sursă' : (campaniiById.get(k) ?? k)),
      ),
    [leads, campaniiById],
  )
  const perInteres = useMemo(
    () =>
      aggregate(
        leads,
        (l) => l.interes ?? '—',
        (k) => (k === '—' ? 'Necompletat' : k),
      ),
    [leads],
  )
  const perGrupa = useMemo(
    () =>
      aggregate(
        leads,
        (l) => l.grupa_varsta ?? '—',
        (k) =>
          k === '—'
            ? 'Necompletat'
            : (GRUPA_LABELS[k as keyof typeof GRUPA_LABELS] ?? k),
      ),
    [leads],
  )
  const perResponsabil = useMemo(
    () =>
      aggregate(
        leads,
        (l) => l.responsabil_id ?? '—',
        (k) => (k === '—' ? 'Neasignat' : (usersById.get(k) ?? 'Utilizator')),
      ),
    [leads, usersById],
  )

  if (leadsQ.isLoading) return <Spinner />
  if (leadsQ.isError)
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcarea lead-urilor.
      </p>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select
            options={[
              { label: 'Sezonul curent', value: 'sezon' },
              { label: 'Luna curentă', value: 'luna' },
              { label: 'Tot istoricul', value: 'tot' },
            ]}
            value={perioada}
            onChange={(e) => setPerioada(e.target.value as Perioada)}
          />
        </div>
        <div className="w-40">
          <Select
            placeholder="Toate locațiile"
            options={LOCATII.map((l) => ({ label: l, value: l }))}
            value={locatie}
            onChange={(e) => setLocatie(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select
            placeholder="Toate grupele"
            options={GRUPE.map((g) => ({ label: GRUPA_LABELS[g], value: g }))}
            value={grupa}
            onChange={(e) => setGrupa(e.target.value)}
          />
        </div>
        {(locatie || grupa) && (
          <Button
            variant="secondary"
            onClick={() => {
              setLocatie('')
              setGrupa('')
            }}
          >
            Resetează
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-quasar-gray-light bg-white px-4 py-3">
          <p className="text-xs text-quasar-gray">Total lead-uri</p>
          <p className="text-2xl font-semibold text-quasar-black">{total}</p>
        </div>
        <div className="rounded-lg border border-quasar-gray-light bg-white px-4 py-3">
          <p className="text-xs text-quasar-gray">Convertiți</p>
          <p className="text-2xl font-semibold text-green-700">
            {convertiti}
          </p>
        </div>
        <div className="rounded-lg border border-quasar-gray-light bg-white px-4 py-3">
          <p className="text-xs text-quasar-gray">Rată conversie</p>
          <p className="text-2xl font-semibold text-quasar-black">
            {total ? Math.round((convertiti / total) * 100) : 0}%
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-quasar-gray-light bg-white">
        <h3 className="border-b border-quasar-gray-light px-3 py-2 text-sm font-semibold text-quasar-black">
          Funnel istoric
          <span className="ml-2 font-normal text-quasar-gray">
            din lead-urile intrate în perioadă, câți au ajuns la fiecare etapă
          </span>
        </h3>
        {funnelQ.isLoading ? (
          <div className="p-3">
            <Spinner />
          </div>
        ) : !funnel || funnel.noi === 0 ? (
          <p className="px-3 py-3 text-sm text-quasar-gray">Fără date.</p>
        ) : (
          <div className="space-y-2 p-3">
            {funnelStages.map((s, i) => {
              const prev = i === 0 ? s.count : funnelStages[i - 1].count
              const dinAnterior = i === 0 || prev === 0 ? null : (s.count / prev) * 100
              const dinTotal = funnel.noi ? (s.count / funnel.noi) * 100 : 0
              return (
                <div key={s.key} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 text-quasar-gray">{s.label}</span>
                  <div className="h-5 flex-1 rounded bg-quasar-gray-light/50">
                    <div
                      className="flex h-5 items-center justify-end rounded bg-quasar-yellow px-1.5"
                      style={{ width: `${Math.max(dinTotal, 3)}%` }}
                    >
                      <span className="text-xs font-semibold text-quasar-black">
                        {s.count}
                      </span>
                    </div>
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-quasar-gray">
                    {dinAnterior === null
                      ? `${Math.round(dinTotal)}% total`
                      : `${Math.round(dinAnterior)}% din ant.`}
                  </span>
                </div>
              )
            })}
            <div className="mt-1 space-y-1 border-t border-quasar-gray-light/60 pt-2">
              <p className="text-xs font-medium text-quasar-gray">Ieșiri</p>
              {(
                [
                  { key: 'nu_a_venit', label: 'Nu a venit', count: funnel.nuAVenit },
                  { key: 'pierdut', label: 'Pierdut', count: funnel.pierdut },
                ] as const
              ).map((o) => (
                <div key={o.key} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 text-quasar-gray">{o.label}</span>
                  <div className="h-4 flex-1 rounded bg-quasar-gray-light/50">
                    <div
                      className="h-4 rounded bg-quasar-gray/40"
                      style={{
                        width: `${funnel.noi ? Math.max((o.count / funnel.noi) * 100, o.count ? 3 : 0) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-quasar-gray">
                    {o.count}
                    {funnel.noi ? ` · ${Math.round((o.count / funnel.noi) * 100)}% total` : ''}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 border-t border-quasar-gray-light/60 pt-2 text-xs text-quasar-gray">
              Retenție 90z:{' '}
              <span className="font-semibold text-quasar-black">
                {funnel.retentie90z}
              </span>{' '}
              din {funnel.retentieEligibili} convertiți eligibili (≥90 zile)
              {funnel.retentieEligibili > 0 &&
                ` — ${Math.round((funnel.retentie90z / funnel.retentieEligibili) * 100)}%`}
            </div>
          </div>
        )}
      </section>

      <BreakdownTable
        titlu="Conversie pe sursă"
        coloana="Sursă"
        buckets={perSursa}
      />
      <BreakdownTable
        titlu="Conversie pe interes"
        coloana="Interes"
        buckets={perInteres}
      />
      <BreakdownTable
        titlu="Conversie pe grupă"
        coloana="Grupă"
        buckets={perGrupa}
      />
      <BreakdownTable
        titlu="Conversie pe responsabil"
        coloana="Responsabil"
        buckets={perResponsabil}
      />
    </div>
  )
}
