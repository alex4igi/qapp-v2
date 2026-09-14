import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  Field,
  Select,
  DataTable,
  Spinner,
  Badge,
  type Column,
} from '@/components/ui'
import {
  cursuriOptionsForCurrentTeacher,
  locatiiOptions,
  sezoaneOptions,
  sezonActivId,
} from '@/lib/lookups'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isTeacher, isManagerOrHigher } from '@/lib/rolesMatrix'
import type { Enums, VListaCursuri } from '@/types/db'
import { ChecklistBadge } from '@/components/checklist'
import { evalueazaChecklist, type Rezultat } from '@/lib/checklist'
import { CURS_CHECKLIST } from '@/lib/checklist/specs/curs'
import { CursForm } from './CursForm'
import {
  getCursuriChecklistFields,
  getGrupeSubMinim,
  listCursuri,
  listCursuriFilterOptions,
  PAGE_SIZE,
  type GrupaPragMinim,
} from './api'
import { PragMinimPanel } from './components/PragMinimPanel'
import { formatOra } from './program'

const FARA_LOCATIE = '— Fără locație —'

// Aceeași derivare ca în CursForm/DetaliiTab: tipul nu e stocat, se citește din
// facultativ + nivelul='Trupa'.
function tipLabel(c: VListaCursuri): string {
  if (c.facultativ) return 'Facultativ'
  return c.nivelul === 'Trupa' ? 'Recurent trupă' : 'Recurent'
}

const makeColumns = (
  checklistById: Map<string, Rezultat>,
  pragMinimById: Map<string, GrupaPragMinim>,
): Column<VListaCursuri>[] => [
  {
    header: 'Curs',
    cell: (c) => <span className="font-medium">{c.numele_cursului}</span>,
    sortValue: (c) => c.numele_cursului?.toLowerCase(),
  },
  {
    header: 'Teacher',
    cell: (c) => [c.nume, c.prenume].filter(Boolean).join(' ') || '—',
    sortValue: (c) => [c.nume, c.prenume].filter(Boolean).join(' ').toLowerCase(),
  },
  {
    header: 'Locație',
    cell: (c) => c.locatie ?? '—',
    sortValue: (c) => c.locatie,
  },
  { header: 'Sală', cell: (c) => c.sala ?? '—', sortValue: (c) => c.sala },
  {
    header: 'Zile',
    cell: (c) => (c.zile?.length ? c.zile.join(', ') : '—'),
    sortValue: (c) => c.zile?.join(', '),
  },
  {
    header: 'Ora',
    // Compact: orele de start distincte („17:00" sau „17:00 / 18:00"), cu
    // detalierea pe zile în tooltip.
    cell: (c) =>
      c.ore_start?.length ? (
        <span title={formatOra(c) || undefined}>{c.ore_start.join(' / ')}</span>
      ) : (
        '—'
      ),
    className: 'w-28',
    sortValue: (c) => c.ora_start,
  },
  {
    header: 'Tip',
    cell: (c) => tipLabel(c),
    className: 'w-32',
    sortValue: (c) => tipLabel(c),
  },
  {
    header: 'Nivel',
    cell: (c) => c.nivelul ?? '—',
    sortValue: (c) => c.nivelul,
  },
  {
    header: 'Înscriși',
    cell: (c) => {
      const inscrisi = c.capacitate_maxima
        ? `${c.inscrisi}/${c.capacitate_maxima}`
        : c.inscrisi
      const prag = c.id ? pragMinimById.get(c.id) : undefined
      if (prag?.stare !== 'de_suspendat' && prag?.stare !== 'in_observatie') {
        return inscrisi
      }
      return (
        <span className="flex flex-col items-start gap-0.5">
          <span>{inscrisi}</span>
          <Badge tone={prag.stare === 'de_suspendat' ? 'danger' : 'warn'}>
            sub minim {prag.luniSubConsecutive}{' '}
            {prag.luniSubConsecutive === 1 ? 'lună' : 'luni'}
          </Badge>
        </span>
      )
    },
    className: 'w-28',
    sortValue: (c) => c.inscrisi ?? 0,
  },
  {
    header: 'Fișă',
    cell: (c) => {
      const rez = c.id ? checklistById.get(c.id) : undefined
      return rez ? <ChecklistBadge rezultat={rez} compact /> : '—'
    },
    className: 'w-36',
    // Esențialele cântăresc mai mult decât recomandatele, ca o sortare
    // descrescătoare să ridice întâi grupele cu probleme reale.
    sortValue: (c) => {
      const rez = c.id ? checklistById.get(c.id) : undefined
      if (!rez) return 0
      return rez.lipsaEsentiale.length * 100 + rez.lipsaRecomandate.length
    },
  },
]

export function CursuriListPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const teacherMode = isTeacher(role)
  const { locatieId: workingLocatieId } = useWorkingLocatie()
  const [locatieFilter, setLocatieFilter] = useState(workingLocatieId ?? '')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [sezonFilter, setSezonFilter] = useState('')
  const [sezonInit, setSezonInit] = useState(false)
  const [varstaFilter, setVarstaFilter] = useState<Enums<'varsta_curs'> | ''>('')
  const [teacherFilter, setTeacherFilter] = useState('')

  // Pentru teacher: limităm la cursurile asociate (via cursuri_teacheri M:N).
  // Fără filtru de sezon aici — pagina are selector propriu care se intersectează.
  const teacherCursuriQ = useQuery({
    queryKey: ['lookup', 'cursuri', 'teacher'],
    queryFn: () => cursuriOptionsForCurrentTeacher(),
    enabled: teacherMode,
  })
  const teacherCursIds = teacherMode
    ? (teacherCursuriQ.data ?? []).map((o) => o.value)
    : null

  // Filtrul pornește de la locația de lucru și o urmează doar când header-ul
  // chiar se schimbă — nu la fiecare câmp gol, altfel „Toate locațiile" n-ar
  // rămâne selectat (aceeași capcană reparată în /teacheri).
  const ultimaLocatieGlobala = useRef(workingLocatieId)
  useEffect(() => {
    if (workingLocatieId === ultimaLocatieGlobala.current) return
    ultimaLocatieGlobala.current = workingLocatieId
    setLocatieFilter(workingLocatieId ?? '')
  }, [workingLocatieId])

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })
  const sezoaneQ = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
  })
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })

  // Default = sezonul activ (decongestionează); userul poate alege „Toate sezoanele".
  useEffect(() => {
    if (!sezonInit && sezonActivQ.isSuccess) {
      setSezonFilter(sezonActivQ.data ?? '')
      setSezonInit(true)
    }
  }, [sezonInit, sezonActivQ.isSuccess, sezonActivQ.data])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(0)
  }, [locatieFilter])

  const filtersReady = (!teacherMode || teacherCursuriQ.isSuccess) && sezonInit

  // Opțiunile de vârstă/teacher urmăresc selecția curentă (sezon + locația de
  // lucru), ca să nu ofere filtre care întorc lista goală.
  const optiuniQ = useQuery({
    queryKey: ['cursuri', 'filtre', { locatieFilter, sezonFilter, teacherCursIds }],
    queryFn: () =>
      listCursuriFilterOptions({
        locatieId: locatieFilter || null,
        sezonId: sezonFilter || null,
        cursIds: teacherCursIds,
      }),
    enabled: filtersReady,
  })

  // Dacă opțiunea aleasă dispare după schimbarea sezonului/locației, o golim —
  // altfel lista rămâne goală fără explicație.
  useEffect(() => {
    if (!optiuniQ.isSuccess) return
    const { varste, teacheri } = optiuniQ.data
    if (varstaFilter && !varste.some((o) => o.value === varstaFilter)) {
      setVarstaFilter('')
      setPage(0)
    }
    if (teacherFilter && !teacheri.some((o) => o.value === teacherFilter)) {
      setTeacherFilter('')
      setPage(0)
    }
  }, [optiuniQ.isSuccess, optiuniQ.data, varstaFilter, teacherFilter])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'cursuri',
      { search, page, locatieFilter, sezonFilter, varstaFilter, teacherFilter, teacherCursIds },
    ],
    queryFn: () =>
      listCursuri({
        search,
        page,
        locatieId: locatieFilter || null,
        sezonId: sezonFilter || null,
        varsta: varstaFilter || null,
        teacherId: teacherFilter || null,
        cursIds: teacherCursIds,
      }),
    placeholderData: keepPreviousData,
    enabled: filtersReady,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  const rowIds = useMemo(
    () =>
      (data?.rows ?? [])
        .map((r) => r.id)
        .filter((id): id is string => Boolean(id)),
    [data],
  )

  const checklistQ = useQuery({
    queryKey: ['cursuri', 'checklist', rowIds],
    queryFn: () => getCursuriChecklistFields(rowIds),
    enabled: rowIds.length > 0,
    placeholderData: keepPreviousData,
  })

  const checklistById = useMemo(() => {
    const m = new Map<string, Rezultat>()
    for (const row of checklistQ.data ?? []) {
      m.set(row.id, evalueazaChecklist(CURS_CHECKLIST, row))
    }
    return m
  }, [checklistQ.data])

  // Pragul minim se evaluează doar pe sezonul activ: pe unul încheiat nu mai e
  // nimic de decis. RPC-ul e doar pentru manageri, ca și suspendarea.
  const pragMinimActiv =
    isManagerOrHigher(role) &&
    Boolean(sezonActivQ.data) &&
    sezonFilter === sezonActivQ.data
  const pragMinimQ = useQuery({
    queryKey: ['cursuri', 'prag-minim', sezonFilter],
    queryFn: () => getGrupeSubMinim({ sezonId: sezonFilter }),
    enabled: pragMinimActiv,
  })

  const pragMinimById = useMemo(() => {
    const m = new Map<string, GrupaPragMinim>()
    if (!pragMinimActiv) return m
    for (const g of pragMinimQ.data ?? []) m.set(g.cursId, g)
    return m
  }, [pragMinimQ.data, pragMinimActiv])

  const columns = useMemo(
    () => makeColumns(checklistById, pragMinimById),
    [checklistById, pragMinimById],
  )

  const groups = useMemo(() => {
    const rows = data?.rows ?? []
    if (locatieFilter) {
      return [{ locatie: null as string | null, rows }]
    }
    const map = new Map<string, VListaCursuri[]>()
    for (const r of rows) {
      const key = r.locatie ?? FARA_LOCATIE
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).map(([locatie, rs]) => ({
      locatie,
      rows: rs,
    }))
  }, [data, locatieFilter])

  return (
    <div>
      <PageHeader
        title="Cursuri"
        subtitle={data ? `${data.total} cursuri` : undefined}
        actions={
          isManagerOrHigher(role) ? (
            <Button onClick={() => setFormOpen(true)}>+ Curs nou</Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Field label="Caută" htmlFor="curs-search">
            <TextInput
              id="curs-search"
              placeholder="Nume curs…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Locație" htmlFor="curs-locatie">
            <Select
              id="curs-locatie"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={locatieFilter}
              onChange={(e) => setLocatieFilter(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Sezon" htmlFor="curs-sezon">
            <Select
              id="curs-sezon"
              placeholder="Toate sezoanele"
              options={sezoaneQ.data ?? []}
              value={sezonFilter}
              onChange={(e) => {
                setSezonFilter(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Grupă vârstă" htmlFor="curs-varsta">
            <Select
              id="curs-varsta"
              placeholder="Toate vârstele"
              options={optiuniQ.data?.varste ?? []}
              value={varstaFilter}
              onChange={(e) => {
                setVarstaFilter(e.target.value as Enums<'varsta_curs'> | '')
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Teacher" htmlFor="curs-teacher">
            <Select
              id="curs-teacher"
              placeholder="Toți teacherii"
              options={optiuniQ.data?.teacheri ?? []}
              value={teacherFilter}
              onChange={(e) => {
                setTeacherFilter(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
      </div>

      {pragMinimActiv && pragMinimQ.data && (
        <PragMinimPanel grupe={pragMinimQ.data} />
      )}

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {humanizeError(error)}
        </p>
      ) : (
        <>
          {groups.length === 0 || (data?.rows.length ?? 0) === 0 ? (
            <DataTable
              columns={columns}
              rows={[]}
              rowKey={(c) => c.id ?? ''}
              emptyMessage="Niciun curs găsit."
            />
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.locatie ?? 'all'}>
                  {!locatieFilter && (
                    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-quasar-gray">
                      {g.locatie ?? FARA_LOCATIE}{' '}
                      <span className="ml-1 font-normal normal-case tracking-normal text-quasar-gray">
                        ({g.rows.length})
                      </span>
                    </h2>
                  )}
                  <DataTable
                    columns={columns}
                    rows={g.rows}
                    rowKey={(c) => c.id ?? ''}
                    onRowClick={(c) => c.id && navigate(`/cursuri/${c.id}`)}
                    emptyMessage="Niciun curs găsit."
                  />
                </section>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-sm text-quasar-gray">
            <span>
              Pagina {page + 1} din {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Următor →
              </Button>
            </div>
          </div>
        </>
      )}

      {formOpen && <CursForm open onClose={() => setFormOpen(false)} />}
    </div>
  )
}
