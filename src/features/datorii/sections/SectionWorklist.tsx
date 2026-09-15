import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  Field,
  MonthPicker,
  Pills,
  Select,
  Spinner,
  TextInput,
} from '@/components/ui'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { formatDate, formatMonth, formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { downloadCsv } from '@/lib/csv'
import { sezoaneOptions, sezonActivId } from '@/lib/lookups'
import {
  getRestanteRate,
  getRestanteWorklist,
  queueSmsRestanta,
  setSuspendareDatornic,
  statusColectare,
  STATUS_COLECTARE_LABEL,
  type RateRow,
  type StatusColectare,
  type WorklistFilters,
  type WorklistRow,
} from '../api'
import type { RecuperareTarget } from '../LogRecuperareModal'
import { WorklistTable } from '../WorklistTable'
import { RateTable } from '../RateTable'

const STATUS_OPTIONS = (
  Object.entries(STATUS_COLECTARE_LABEL) as [StatusColectare, string][]
).map(([value, label]) => ({ value, label }))

type Vedere = 'client' | 'rate'
const VEDERE_OPTIONS: { value: Vedere; label: string }[] = [
  { value: 'client', label: 'Pe client' },
  { value: 'rate', label: 'Pe rate' },
]

const azi = () => new Date().toISOString().slice(0, 10)

// Lista de datornici, în două vederi pe ACEEAȘI bază și aceleași filtre:
// „Pe client" = worklist-ul de sunat (un rând = un client, cu toate ratele lui);
// „Pe rate" = un rând = o rată (lună × curs), fostul tab Restanțe din /financiar.
// Locația vine din scopul global al paginii (📍) sau din click-ul pe o locație în
// comparativ; sezonul e presetat pe cel activ.
export function SectionWorklist({
  locatieId,
  filterLocatieNume,
  onClearLocatie,
  canSuspend,
  onLog,
  onPlata,
}: {
  locatieId: string | null
  filterLocatieNume?: string | null
  onClearLocatie?: () => void
  canSuspend: boolean
  onLog: (target: RecuperareTarget) => void
  /** Lipsește pe telefon: încasarea trece prin modalul de la recepție. */
  onPlata?: (clientId: string) => void
}) {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  // Pe telefon filtrele ocupă un ecran întreg înaintea listei — le ținem
  // pliate până le cere cineva.
  const [filtreDeschise, setFiltreDeschise] = useState(false)
  const [vedere, setVedere] = useState<Vedere>('client')
  const [sezonId, setSezonId] = useState('')
  const [luna, setLuna] = useState('')
  const [cursId, setCursId] = useState('')
  // Implicit doar ratele chiar depășite (lista de sunat). Bifat: și ratele cu rest
  // neajunse la scadență — ex. luna curentă înainte de 15, pentru reminderul
  // dinaintea termenului.
  const [toateRatele, setToateRatele] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [smsQueuedIds, setSmsQueuedIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const sezoaneQ = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
  })
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })
  const cursuriQ = useCursuriOptions({ locatieId, sezonId: sezonId || null })

  // Presetează sezonul activ (o singură dată) — aliniat cu compozitorul SMS:
  // nu chemăm/sunăm oameni din sezoane vechi. Operatorul poate trece pe „Toate".
  const [sezonInit, setSezonInit] = useState(false)
  useEffect(() => {
    if (!sezonInit && sezonActivQ.data) {
      setSezonId(sezonActivQ.data)
      setSezonInit(true)
    }
  }, [sezonInit, sezonActivQ.data])

  // Cursul ales poate să nu mai existe în alt sezon / altă locație.
  useEffect(() => {
    if (cursId && cursuriQ.data && !cursuriQ.data.some((c) => c.value === cursId)) setCursId('')
  }, [cursId, cursuriQ.data])

  const filters: WorklistFilters = {
    locatieId,
    sezonId: sezonId || null,
    luna: luna || null,
    cursId: cursId || null,
    doarDepasite: !toateRatele,
  }
  const filterKey = [locatieId ?? '', sezonId, luna, cursId, toateRatele]

  const worklistQ = useQuery({
    queryKey: ['restante-worklist', ...filterKey],
    queryFn: () => getRestanteWorklist(filters),
    placeholderData: keepPreviousData,
    enabled: vedere === 'client',
  })
  const rateQ = useQuery({
    queryKey: ['restante-rate', ...filterKey],
    queryFn: () => getRestanteRate(filters),
    placeholderData: keepPreviousData,
    enabled: vedere === 'rate',
  })

  const smsM = useMutation({
    mutationFn: queueSmsRestanta,
    onSuccess: (_d, row) => {
      setActionError(null)
      setSmsQueuedIds((prev) => new Set(prev).add(row.client_id))
    },
    onError: (e: unknown) => setActionError(humanizeError(e, 'Eroare la trimiterea SMS-ului.')),
  })
  const suspendM = useMutation({
    mutationFn: (row: WorklistRow) => setSuspendareDatornic(row.client_id, !row.suspendat),
    onSuccess: () => {
      setActionError(null)
      void queryClient.invalidateQueries({ queryKey: ['restante-worklist'] })
      void queryClient.invalidateQueries({ queryKey: ['restante-rate'] })
    },
    onError: (e: unknown) => setActionError(humanizeError(e, 'Eroare la suspendare.')),
  })

  const onSuspend = (r: WorklistRow) => {
    const msg = r.suspendat
      ? `Reactivezi accesul la clase pentru ${r.nume} ${r.prenume ?? ''}?`
      : `Suspenzi accesul la clase pentru ${r.nume} ${r.prenume ?? ''} (rest ${formatRON(r.rest_total)})? Nu va mai putea fi marcat prezent și nu va putea rezerva până la achitare.`
    if (window.confirm(msg)) suspendM.mutate(r)
  }

  const logClient = (r: WorklistRow) =>
    onLog({ clientId: r.client_id, nume: `${r.nume} ${r.prenume ?? ''}`.trim(), rest: r.rest_total })
  const logRata = (r: RateRow) =>
    onLog({
      clientId: r.client_id,
      nume: `${r.nume} ${r.prenume ?? ''}`.trim(),
      rest: r.rest,
      curs: r.nume_curs,
    })

  const q = search.trim().toLowerCase()
  const clientRows = useMemo(() => {
    const all = worklistQ.data ?? []
    return all.filter((r) => {
      if (status && statusColectare(r) !== status) return false
      if (q) {
        const haystack = `${r.nume} ${r.prenume ?? ''} ${r.telefon ?? ''} ${r.cursuri ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [worklistQ.data, q, status])
  const rateRows = useMemo(() => {
    const all = rateQ.data ?? []
    if (!q) return all
    return all.filter((r) =>
      `${r.nume} ${r.prenume ?? ''} ${r.telefon ?? ''} ${r.nume_curs ?? ''}`.toLowerCase().includes(q),
    )
  }, [rateQ.data, q])

  const totalRestClienti = useMemo(
    () => clientRows.reduce((a, r) => a + Number(r.rest_total ?? 0), 0),
    [clientRows],
  )
  const totalRestRate = useMemo(() => rateRows.reduce((a, r) => a + r.rest, 0), [rateRows])
  const nrClientiRate = useMemo(() => new Set(rateRows.map((r) => r.client_id)).size, [rateRows])
  const top = useMemo(
    () => [...clientRows].sort((a, b) => b.rest_total - a.rest_total).slice(0, 5),
    [clientRows],
  )

  const exportCsv = () =>
    vedere === 'client'
      ? downloadCsv(
          `datornici-${azi()}.csv`,
          ['Client', 'Status client', 'Telefon', 'Locatie', 'Ce datoreaza', 'Rate', 'Rest RON', 'Zile intarziere', 'Status', 'Promisiune'],
          clientRows.map((r) => [
            `${r.nume} ${r.prenume ?? ''}`.trim(),
            r.status_client ?? '',
            r.telefon ?? '',
            r.nume_locatie ?? '',
            r.cursuri ?? '',
            r.nr_rate_neachitate,
            Math.round(r.rest_total),
            r.zile_depasire ?? '',
            STATUS_COLECTARE_LABEL[statusColectare(r)],
            r.promisiune_data ?? '',
          ]),
        )
      : downloadCsv(
          `restante-rate-${azi()}.csv`,
          ['Client', 'Status client', 'Telefon', 'Locatie', 'Curs', 'Luna', 'Scadenta', 'Zile intarziere', 'Total RON', 'Platit RON', 'Rest RON'],
          rateRows.map((r) => [
            `${r.nume} ${r.prenume ?? ''}`.trim(),
            r.status_client ?? '',
            r.telefon ?? '',
            r.nume_locatie ?? '',
            r.nume_curs ?? '',
            formatMonth(r.data_incepere),
            formatDate(r.scadenta),
            r.zile_depasire,
            Math.round(r.total_de_plata),
            Math.round(r.platit),
            Math.round(r.rest),
          ]),
        )

  const activeQ = vedere === 'client' ? worklistQ : rateQ
  const nrRanduri = vedere === 'client' ? clientRows.length : rateRows.length
  const vederePills = (
    <Pills
      aria-label="Vedere"
      options={VEDERE_OPTIONS}
      value={vedere}
      onChange={(v) => setVedere((v || 'client') as Vedere)}
      clearable={false}
    />
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-sm font-semibold text-quasar-black">
          {vedere === 'client' ? 'Datornici de sunat' : 'Restanțe pe rate'}
        </h3>
        {isMobile ? (
          <Button variant="secondary" onClick={() => setFiltreDeschise((v) => !v)}>
            {filtreDeschise ? 'Ascunde filtrele' : '⚙ Filtre'}
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            {vederePills}
            <Button variant="secondary" onClick={exportCsv} disabled={nrRanduri === 0}>
              ⬇ Export CSV
            </Button>
          </div>
        )}
      </div>

      <div
        className="mb-4 flex flex-wrap items-end gap-3"
        hidden={isMobile && !filtreDeschise}
      >
        {isMobile && <div className="w-full">{vederePills}</div>}
        <div className="w-52 max-md:w-full">
          <Field label="Caută" htmlFor="dat-cauta">
            <TextInput
              id="dat-cauta"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="client, telefon, curs…"
            />
          </Field>
        </div>
        <div className="w-44 max-md:w-full">
          <Field label="Sezon" htmlFor="dat-sez">
            <Select
              id="dat-sez"
              placeholder="Toate"
              options={sezoaneQ.data ?? []}
              value={sezonId}
              onChange={(e) => setSezonId(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-56 max-md:w-full">
          <Field label="Curs" htmlFor="dat-curs">
            <Select
              id="dat-curs"
              placeholder="Toate cursurile"
              options={cursuriQ.data ?? []}
              value={cursId}
              onChange={(e) => setCursId(e.target.value)}
            />
          </Field>
        </div>
        {vedere === 'client' && (
          <div className="w-44 max-md:w-full">
            <Field label="Status" htmlFor="dat-status">
              <Select
                id="dat-status"
                placeholder="Toate"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="w-44 max-md:w-full">
          <Field label={vedere === 'client' ? 'Are rată din luna' : 'Luna'} htmlFor="dat-luna">
            <div className="flex items-center gap-1">
              <MonthPicker id="dat-luna" value={luna} onChange={setLuna} />
              {luna && (
                <button
                  type="button"
                  onClick={() => setLuna('')}
                  title="Toate lunile"
                  className="shrink-0 rounded-md border border-quasar-gray-light px-2 py-2 text-xs text-quasar-gray hover:border-quasar-yellow"
                >
                  ✕
                </button>
              )}
            </div>
          </Field>
        </div>
        <div className="pb-2.5 max-md:w-full">
          <Checkbox
            id="dat-toate"
            label="și ratele neajunse la scadență"
            checked={toateRatele}
            onChange={(e) => setToateRatele(e.target.checked)}
          />
        </div>
        {filterLocatieNume && (
          <div className="flex items-center gap-2 pb-1">
            <button
              type="button"
              onClick={onClearLocatie}
              className="inline-flex items-center gap-1.5 rounded-full bg-quasar-yellow/20 px-3 py-1 text-xs font-medium text-quasar-black hover:bg-quasar-yellow/40"
            >
              📍 {filterLocatieNume} ✕
            </button>
          </div>
        )}
      </div>

      {activeQ.isLoading ? (
        <Spinner />
      ) : activeQ.isError ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(activeQ.error)}</p>
      ) : (
        <>
          {vedere === 'client' ? (
            <p className="mb-3 text-sm">
              <strong>{clientRows.length}</strong>{' '}
              {toateRatele ? 'clienți cu rest' : 'datornici de sunat'} · rest total{' '}
              <span className="font-semibold text-red-600">{formatRON(totalRestClienti)}</span>
              <span className="text-quasar-gray"> (toate ratele lor restante)</span>
            </p>
          ) : (
            <p className="mb-3 text-sm">
              <strong>{rateRows.length}</strong> rate {toateRatele ? 'cu rest' : 'depășite'} ·{' '}
              <strong>{nrClientiRate}</strong> clienți · de recuperat{' '}
              <span className="font-semibold text-red-600">{formatRON(totalRestRate)}</span>
            </p>
          )}

          {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

          {vedere === 'client' && top.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {top.map((r, i) => (
                <Link
                  key={r.client_id}
                  to={`/clienti/${r.client_id}`}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm hover:border-quasar-yellow"
                >
                  <span className="text-quasar-gray">#{i + 1}</span>{' '}
                  <span className="font-medium">
                    {r.nume} {r.prenume ?? ''}
                  </span>{' '}
                  <span className="font-semibold text-red-600">
                    {formatRON(r.rest_total)}
                  </span>
                  {r.zile_depasire != null && r.zile_depasire > 0 && (
                    <span className="text-quasar-gray"> · {r.zile_depasire}z</span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {vedere === 'client' ? (
            <WorklistTable
              rows={clientRows}
              onLog={logClient}
              onPlata={onPlata ? (r) => onPlata(r.client_id) : undefined}
              onSms={(r) => smsM.mutate(r)}
              smsQueuedIds={smsQueuedIds}
              canSuspend={canSuspend}
              onSuspend={onSuspend}
              emptyMessage={
                toateRatele ? 'Niciun client cu rest. 🎉' : 'Niciun datornic cu rate depășite. 🎉'
              }
            />
          ) : (
            <RateTable
              rows={rateRows}
              showLocatie={locatieId === null}
              onLog={logRata}
              onPlata={onPlata ? (r) => onPlata(r.client_id) : undefined}
              emptyMessage={toateRatele ? 'Nicio rată cu rest. 🎉' : 'Nicio rată depășită. 🎉'}
            />
          )}
        </>
      )}
    </div>
  )
}
