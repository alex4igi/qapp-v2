import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { humanizeError } from '@/lib/errorMessage'
import { ROLE_LABEL, ROUTE_ACCESS } from '@/lib/rolesMatrix'
import type { AppRole } from '@/hooks/useAuth'
import {
  DataTable,
  Field,
  PageHeader,
  Pills,
  Select,
  Spinner,
  Tabs,
  TextInput,
  type Column,
} from '@/components/ui'
import { getPerioade, getRaport, type UtilizareRand } from './api'

const ROLURI: AppRole[] = ['owner', 'admin', 'manager', 'front_desk', 'teacher', 'marketing']

// Rutele care doar redirecționează nu au ce număra.
const RUTE_REDIRECT = new Set(['/recuperare', '/administrare'])

type Mod = 'luna' | 'zi'
type Tab = 'pagini' | 'butoane' | 'nedeschise'

type RandAgregat = {
  key: string
  ruta: string
  tinta: string
  total: number
  zile: number
  perRol: Partial<Record<AppRole, number>>
}

function ultimaZi(luna: string): string {
  const [y, m] = luna.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

function lunaLabel(luna: string): string {
  const [y, m] = luna.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })
}

function ziLabel(zi: string): string {
  return new Date(`${zi}T12:00:00`).toLocaleDateString('ro-RO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function agrega(randuri: UtilizareRand[], cheie: (r: UtilizareRand) => [string, string]): RandAgregat[] {
  const map = new Map<string, RandAgregat>()
  for (const r of randuri) {
    const [ruta, tinta] = cheie(r)
    const key = `${ruta}\u0000${tinta}`
    const a = map.get(key) ?? { key, ruta, tinta, total: 0, zile: 0, perRol: {} }
    a.total += r.n
    // Zilele nu se adună între roluri (aceeași zi ar conta de două ori): cea mai mare e reperul.
    a.zile = Math.max(a.zile, r.zile)
    const rol = r.rol as AppRole
    a.perRol[rol] = (a.perRol[rol] ?? 0) + r.n
    map.set(key, a)
  }
  return [...map.values()]
}

function coloaneRoluri(roluri: AppRole[]): Column<RandAgregat>[] {
  return roluri.map((rol) => ({
    header: ROLE_LABEL[rol].replace(' (agenție)', ''),
    className: 'text-right tabular-nums',
    cell: (r) => r.perRol[rol] ?? '',
    sortValue: (r) => r.perRol[rol] ?? 0,
    defaultDir: 'desc' as const,
  }))
}

export default function UtilizarePage() {
  const [mod, setMod] = useState<Mod>('luna')
  const [perioadaAleasa, setPerioada] = useState('')
  const [rol, setRol] = useState('')
  const [varianta, setVarianta] = useState('')
  const [tab, setTab] = useState<Tab>('pagini')
  const [rutaButoane, setRutaButoane] = useState('')
  const [cautare, setCautare] = useState('')

  const perioade = useQuery({ queryKey: ['utilizare', 'perioade'], queryFn: getPerioade })

  const optiuni = mod === 'luna' ? perioade.data?.luni ?? [] : perioade.data?.zile ?? []
  const perioada = optiuni.includes(perioadaAleasa) ? perioadaAleasa : optiuni[0] ?? ''
  const interval: [string, string] | null = perioada
    ? mod === 'luna'
      ? [perioada, ultimaZi(perioada)]
      : [perioada, perioada]
    : null

  const raport = useQuery({
    queryKey: ['utilizare', 'raport', interval],
    queryFn: () => getRaport(interval![0], interval![1]),
    enabled: !!interval,
  })

  const filtrate = useMemo(
    () =>
      (raport.data ?? []).filter(
        (r) => (!rol || r.rol === rol) && (!varianta || r.varianta === varianta),
      ),
    [raport.data, rol, varianta],
  )

  const roluriVizibile = rol ? [rol as AppRole] : ROLURI

  const pagini = useMemo(
    () => agrega(filtrate.filter((r) => r.tip === 'pagina'), (r) => [r.ruta, '']),
    [filtrate],
  )

  const toateButoanele = useMemo(
    () => agrega(filtrate.filter((r) => r.tip === 'clic'), (r) => [r.ruta, r.tinta]),
    [filtrate],
  )
  const butoane = useMemo(() => {
    const q = cautare.trim().toLowerCase()
    return toateButoanele.filter(
      (b) => (!rutaButoane || b.ruta === rutaButoane) && (!q || b.tinta.toLowerCase().includes(q)),
    )
  }, [toateButoanele, rutaButoane, cautare])

  const ruteCuClicuri = useMemo(
    () => [...new Set(toateButoanele.map((b) => b.ruta))].sort(),
    [toateButoanele],
  )

  // Paginile din meniu (ROUTE_ACCESS) × rolurile care au acces: cât le-a deschis fiecare.
  // Sub-paginile cu `?tab=` se adună la pagina lor.
  const nedeschise = useMemo(() => {
    const vizite = new Map<string, Partial<Record<AppRole, number>>>()
    for (const r of filtrate) {
      if (r.tip !== 'pagina') continue
      const baza = r.ruta.split('?')[0]
      const m = vizite.get(baza) ?? {}
      m[r.rol as AppRole] = (m[r.rol as AppRole] ?? 0) + r.n
      vizite.set(baza, m)
    }
    return Object.entries(ROUTE_ACCESS)
      .filter(([ruta]) => !RUTE_REDIRECT.has(ruta))
      .map(([ruta, acces]) => {
        const v = vizite.get(ruta) ?? {}
        const cuAcces = roluriVizibile.filter((r) => (acces as readonly AppRole[]).includes(r))
        const perRol: Partial<Record<AppRole, number>> = {}
        for (const r of cuAcces) perRol[r] = v[r] ?? 0
        const total = cuAcces.reduce((s, r) => s + (v[r] ?? 0), 0)
        return { key: ruta, ruta, tinta: '', total, zile: 0, perRol, cuAcces }
      })
      .filter((r) => r.cuAcces.length > 0)
  }, [filtrate, roluriVizibile])

  const colPagini: Column<RandAgregat>[] = [
    { header: 'Pagină', cell: (r) => <code className="text-xs">{r.ruta}</code>, sortValue: (r) => r.ruta },
    {
      header: 'Total',
      className: 'text-right font-semibold tabular-nums',
      cell: (r) => r.total,
      sortValue: (r) => r.total,
      defaultDir: 'desc',
    },
    ...(mod === 'luna'
      ? [{
          header: 'Zile',
          className: 'text-right tabular-nums text-muted',
          cell: (r: RandAgregat) => r.zile,
          sortValue: (r: RandAgregat) => r.zile,
          defaultDir: 'desc' as const,
        }]
      : []),
    ...coloaneRoluri(roluriVizibile),
  ]

  const colButoane: Column<RandAgregat>[] = [
    { header: 'Pagină', cell: (r) => <code className="text-xs">{r.ruta}</code>, sortValue: (r) => r.ruta },
    { header: 'Buton / link', cell: (r) => r.tinta, sortValue: (r) => r.tinta },
    ...colPagini.slice(1),
  ]

  const colNedeschise: Column<RandAgregat>[] = [
    { header: 'Pagină', cell: (r) => <code className="text-xs">{r.ruta}</code>, sortValue: (r) => r.ruta },
    {
      header: 'Total',
      className: 'text-right font-semibold tabular-nums',
      cell: (r) => r.total,
      sortValue: (r) => r.total,
    },
    ...roluriVizibile.map((rol) => ({
      header: ROLE_LABEL[rol].replace(' (agenție)', ''),
      className: 'text-right tabular-nums',
      cell: (r: RandAgregat) => {
        const n = r.perRol[rol]
        if (n === undefined) return <span className="text-muted-2">—</span>
        return n === 0 ? <span className="font-semibold text-red-600">0</span> : n
      },
      sortValue: (r: RandAgregat) => r.perRol[rol] ?? -1,
    })),
  ]

  const activPanaLa = perioade.data?.activ_pana_la
  const subtitle = `Contoare pe rol, fără nume de utilizator.${
    activPanaLa
      ? ` Colectarea merge până la ${new Date(`${activPanaLa}T12:00:00`).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}.`
      : ''
  }`

  return (
    <div>
      <PageHeader title="Utilizarea aplicației" subtitle={subtitle} />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Field label="Perioadă">
          <Pills
            clearable={false}
            value={mod}
            onChange={(v) => setMod(v as Mod)}
            options={[
              { value: 'luna', label: 'Lună' },
              { value: 'zi', label: 'Zi' },
            ]}
          />
        </Field>
        <Field label={mod === 'luna' ? 'Luna' : 'Ziua'}>
          <Select
            className="min-w-44"
            value={perioada}
            onChange={(e) => setPerioada(e.target.value)}
            disabled={optiuni.length === 0}
            options={
              optiuni.length
                ? optiuni.map((p) => ({ value: p, label: mod === 'luna' ? lunaLabel(p) : ziLabel(p) }))
                : [{ value: '', label: 'Încă nu sunt date' }]
            }
          />
        </Field>
        <Field label="Rol">
          <Select
            className="min-w-40"
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            options={[
              { value: '', label: 'Toate rolurile' },
              ...ROLURI.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
            ]}
          />
        </Field>
        <Field label="Varianta">
          <Pills
            value={varianta}
            onChange={setVarianta}
            options={[
              { value: 'desktop', label: 'Desktop' },
              { value: 'mobil', label: 'Telefon' },
            ]}
          />
        </Field>
      </div>

      <Tabs
        active={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: 'pagini', label: 'Pagini deschise' },
          { id: 'butoane', label: 'Butoane apăsate' },
          { id: 'nedeschise', label: 'Pagini × roluri' },
        ]}
      />

      {perioade.isLoading || raport.isLoading ? (
        <Spinner />
      ) : perioade.error || raport.error ? (
        <p className="text-sm text-red-600">{humanizeError(perioade.error ?? raport.error)}</p>
      ) : tab === 'pagini' ? (
        <DataTable
          columns={colPagini}
          rows={pagini}
          rowKey={(r) => r.key}
          defaultSort={{ idx: 1, dir: 'desc' }}
          emptyMessage="Nicio pagină deschisă în perioada aleasă."
        />
      ) : tab === 'butoane' ? (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Pagina">
              <Select
                className="min-w-56"
                value={rutaButoane}
                onChange={(e) => setRutaButoane(e.target.value)}
                options={[
                  { value: '', label: 'Toate paginile' },
                  ...ruteCuClicuri.map((r) => ({ value: r, label: r })),
                ]}
              />
            </Field>
            <Field label="Caută buton">
              <TextInput value={cautare} onChange={(e) => setCautare(e.target.value)} placeholder="ex. Salvează" />
            </Field>
          </div>
          <DataTable
            columns={colButoane}
            rows={butoane}
            rowKey={(r) => r.key}
            defaultSort={{ idx: 2, dir: 'desc' }}
            maxRows={1000}
            emptyMessage="Niciun clic în perioada aleasă."
          />
          <p className="mt-3 text-xs text-muted">
            Aici apar doar butoanele apăsate cel puțin o dată. Lista celor niciodată apăsate se
            face la finalul sezonului, comparând cu inventarul tuturor butoanelor din aplicație.
          </p>
        </>
      ) : (
        <>
          <DataTable
            columns={colNedeschise}
            rows={nedeschise}
            rowKey={(r) => r.key}
            defaultSort={{ idx: 1, dir: 'asc' }}
            emptyMessage="Nicio pagină pentru rolul ales."
          />
          <p className="mt-3 text-xs text-muted">
            <span className="font-semibold text-red-600">0</span> = rolul are acces, dar nu a deschis
            pagina în perioada aleasă. — = rolul nu are acces. Rar nu înseamnă inutil: citește lista cu
            calendarul sezonului în față.
          </p>
        </>
      )}
    </div>
  )
}
