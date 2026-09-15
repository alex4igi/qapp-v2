import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  DataTable,
  KebabMenu,
  Spinner,
  type Column,
  type MenuItem,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { locatiiOptions } from '@/lib/lookups'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatMonth, formatRON } from '@/lib/format'
import { metodaTone } from '@/lib/metodaPlata'
import { categorieIncasareLabel } from '@/lib/enums'
import { PlataNouaModal } from './PlataNouaModal'
import { CorecteazaMetodaModal } from './modals/CorecteazaMetodaModal'
import { IncasareEditModal } from './modals/IncasareEditModal'
import { MutaIncasareModal } from './modals/MutaIncasareModal'
import { todayIso } from './modals/PlataNouaModal/helpers'
import { PlatiFiltreBar } from './components/PlatiFiltreBar'
import { intervalPerioada, type Perioada } from './perioada'
import { SumarPlatiBar } from './components/SumarPlatiBar'
import {
  listPlati,
  exportPlati,
  getSumarPlati,
  PAGE_SIZE,
  type PlataRow,
  type PlatiFiltre,
} from './api'

// Pentru abonament: luna acoperită (Per luna) sau ziua ședinței.
function pentruSecundar(r: PlataRow): string {
  const parts: string[] = [r.categorie ? (categorieIncasareLabel[r.categorie] ?? r.categorie) : '—']
  if (r.categorie === 'Abonament' && r.luna) {
    parts.push(r.tip_plata === 'Per luna' ? formatMonth(r.luna) : formatDate(r.luna))
  }
  if (r.bucati && r.bucati > 1) parts.push(`${r.bucati} buc.`)
  return parts.join(' · ')
}

export function PlatiListPage() {
  const { role } = useAuth()
  const canEdit = isManagerOrHigher(role)
  const { locatieId: globalLocatieId } = useWorkingLocatie()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [perioada, setPerioada] = useState<Perioada>('luna')
  const [interval, setIntervalAles] = useState({ from: '', to: '' })
  // null = neales încă: se folosește locația de lucru (care se poate încărca după
  // primul render). „Toate locațiile" e '' — o alegere explicită, nu lipsă.
  const [locatieAleasa, setLocatieAleasa] = useState<string | null>(null)
  const [categorie, setCategorie] = useState('')
  const [metoda, setMetoda] = useState('')
  const [page, setPage] = useState(0)

  const [plataOpen, setPlataOpen] = useState(false)
  const [corectId, setCorectId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [mutaRow, setMutaRow] = useState<PlataRow | null>(null)
  const [exporting, setExporting] = useState(false)

  const locatieId = locatieAleasa ?? globalLocatieId ?? ''

  // Orice filtru nou pornește de la prima pagină.
  const cuReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setPage(0)
    }

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const filtre: PlatiFiltre = useMemo(() => {
    const { from, to } = intervalPerioada(perioada, todayIso(), interval)
    return { search, from, to, locatieId, categorie, metoda }
  }, [search, perioada, interval, locatieId, categorie, metoda])

  const listQ = useQuery({
    queryKey: ['plati', filtre, page],
    queryFn: () => listPlati({ filtre, page }),
    placeholderData: keepPreviousData,
  })

  const sumarQ = useQuery({
    queryKey: ['plati-sumar', filtre],
    queryFn: () => getSumarPlati(filtre),
    placeholderData: keepPreviousData,
  })

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const totalPages = Math.max(1, Math.ceil((listQ.data?.total ?? 0) / PAGE_SIZE))

  const onExport = async () => {
    setExporting(true)
    try {
      const rows = await exportPlati(filtre)
      const body: (string | number)[][] = rows.map((r) => [
        r.data ?? '',
        r.client_nume ?? '',
        r.categorie ?? '',
        r.detalii ?? '',
        r.categorie === 'Abonament' && r.luna ? r.luna.slice(0, 7) : '',
        r.locatie_nume ?? '',
        r.metoda ?? '',
        r.suma,
        r.observatii ?? '',
      ])
      body.push(['TOTAL', '', '', '', '', '', '', rows.reduce((a, r) => a + r.suma, 0), ''])
      downloadCsv(
        `plati_${filtre.from || 'inceput'}_${filtre.to || 'azi'}.csv`,
        ['Data', 'Client', 'Categorie', 'Pentru', 'Luna', 'Locație', 'Metodă', 'Sumă (RON)', 'Observații'],
        body,
      )
    } finally {
      setExporting(false)
    }
  }

  const actiuni = (r: PlataRow): MenuItem[] => {
    const items: MenuItem[] = []
    // Online = Netopia din portal: forma de plată nu e o alegere a recepției.
    if (r.metoda !== 'Online')
      items.push({
        icon: '💳',
        label: 'Corectează forma de plată',
        onClick: () => setCorectId(r.id),
      })
    if (
      r.categorie === 'Abonament' &&
      r.suma > 0 &&
      r.client &&
      r.inregistrare &&
      r.curs_id &&
      r.luna
    )
      items.push({
        icon: '💸',
        label: 'Mută la alt client',
        title: 'Plata dispare de la acest client și apare la clientul corect',
        onClick: () => setMutaRow(r),
      })
    if (canEdit)
      items.push({
        icon: '✏️',
        label: 'Editează sau șterge',
        title: 'Sumă, dată, observații sau ștergere — cu motiv și audit',
        separatorBefore: items.length > 0,
        onClick: () => setEditId(r.id),
      })
    return items
  }

  const columns: Column<PlataRow>[] = [
    {
      header: 'Data',
      cell: (r) => formatDate(r.data),
      className: 'w-28',
      sortValue: (r) => r.data,
      defaultDir: 'desc',
    },
    {
      header: 'Client',
      cell: (r) =>
        r.client ? (
          <Link
            to={`/clienti/${r.client}`}
            className="font-medium text-quasar-black hover:underline"
          >
            {r.client_nume ?? '—'}
          </Link>
        ) : (
          <span className="text-quasar-gray">—</span>
        ),
      sortValue: (r) => r.client_nume?.toLowerCase(),
    },
    {
      header: 'Pentru',
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-ink">
            {r.detalii ?? (r.categorie ? categorieIncasareLabel[r.categorie] : null) ?? '—'}
          </p>
          <p className="text-xs text-quasar-gray">{pentruSecundar(r)}</p>
          {r.observatii && (
            <p className="max-w-xs truncate text-xs italic text-quasar-gray" title={r.observatii}>
              {r.observatii}
            </p>
          )}
        </div>
      ),
      sortValue: (r) => (r.detalii ?? r.categorie ?? '').toLowerCase(),
    },
    {
      header: 'Locație',
      cell: (r) => r.locatie_nume ?? '—',
      className: 'w-40',
      sortValue: (r) => r.locatie_nume?.toLowerCase(),
    },
    {
      header: 'Metodă',
      cell: (r) =>
        r.metoda ? (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${metodaTone(r.metoda)}`}
          >
            {r.metoda}
          </span>
        ) : (
          '—'
        ),
      className: 'w-24',
      sortValue: (r) => r.metoda,
    },
    {
      header: 'Sumă',
      cell: (r) => (
        <span className={r.suma < 0 ? 'font-semibold text-red-600' : 'font-semibold text-ink'}>
          {formatRON(r.suma)}
        </span>
      ),
      className: 'w-28 text-right',
      sortValue: (r) => r.suma,
      defaultDir: 'desc',
    },
    {
      header: '',
      cell: (r) => <KebabMenu items={actiuni(r)} ariaLabel="Acțiuni plată" />,
      className: 'w-12 text-right',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Plăți"
        subtitle="Toate încasările: abonamente, bilete, audiții, închirieri, merch"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={onExport}
              disabled={!listQ.data?.rows.length || exporting}
            >
              {exporting ? 'Se exportă…' : '⬇ Export CSV'}
            </Button>
            <Button onClick={() => setPlataOpen(true)}>＄ Plată</Button>
          </>
        }
      />

      <PlatiFiltreBar
        search={searchInput}
        onSearch={setSearchInput}
        perioada={perioada}
        onPerioada={cuReset(setPerioada)}
        interval={interval}
        onInterval={cuReset(setIntervalAles)}
        locatieId={locatieId}
        onLocatie={cuReset(setLocatieAleasa)}
        locatiiOptions={locatiiQ.data ?? []}
        categorie={categorie}
        onCategorie={cuReset(setCategorie)}
        metoda={metoda}
        onMetoda={cuReset(setMetoda)}
      />

      {sumarQ.isError ? (
        <p className="mb-4 text-sm text-red-600">
          Totalurile nu s-au putut calcula: {humanizeError(sumarQ.error)}
        </p>
      ) : (
        <SumarPlatiBar sumar={sumarQ.data} loading={sumarQ.isPlaceholderData} />
      )}

      {listQ.isLoading ? (
        <Spinner />
      ) : listQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {humanizeError(listQ.error)}
        </p>
      ) : (
        <>
          <div
            className={`transition-opacity ${listQ.isPlaceholderData ? 'opacity-50' : ''}`}
            aria-busy={listQ.isPlaceholderData}
          >
            <DataTable
              columns={columns}
              rows={listQ.data?.rows ?? []}
              rowKey={(r) => r.id}
              emptyMessage="Nicio plată pentru filtrele alese."
            />
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-quasar-gray">
            <span>
              {listQ.data?.total ?? 0} plăți · pagina {page + 1} din {totalPages}
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

      {plataOpen && <PlataNouaModal open onClose={() => setPlataOpen(false)} />}
      {corectId && (
        <CorecteazaMetodaModal open incasareId={corectId} onClose={() => setCorectId(null)} />
      )}
      {editId && (
        <IncasareEditModal open incasareId={editId} onClose={() => setEditId(null)} />
      )}
      {mutaRow && (
        <MutaIncasareModal
          open
          clientId={mutaRow.client!}
          clientNume={mutaRow.client_nume ?? ''}
          incasareId={mutaRow.id}
          luna={{
            id_enrollment: mutaRow.inregistrare!,
            data_incepere: mutaRow.luna!,
            id_curs: mutaRow.curs_id!,
            nume_curs: mutaRow.curs_nume ?? '',
          }}
          onClose={() => setMutaRow(null)}
        />
      )}
    </div>
  )
}
