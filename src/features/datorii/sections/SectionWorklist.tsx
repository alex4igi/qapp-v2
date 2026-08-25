import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Select, MonthPicker, Spinner, TextInput } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { downloadCsv } from '@/lib/csv'
import { sezoaneOptions, sezonActivId } from '@/lib/lookups'
import {
  getRestanteWorklist,
  queueSmsRestanta,
  setSuspendareDatornic,
  statusColectare,
  STATUS_COLECTARE_LABEL,
  type StatusColectare,
  type WorklistRow,
} from '../api'
import { WorklistTable } from '../WorklistTable'

const STATUS_OPTIONS = (
  Object.entries(STATUS_COLECTARE_LABEL) as [StatusColectare, string][]
).map(([value, label]) => ({ value, label }))

// Worklist-ul de sunat (fostul /recuperare) + top datornici. Locația vine din
// scopul global al paginii (📍) sau din click-ul pe o locație în comparativ;
// sezonul e presetat pe cel activ.
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
  onLog: (row: WorklistRow) => void
  onPlata: (row: WorklistRow) => void
}) {
  const queryClient = useQueryClient()
  const [sezonId, setSezonId] = useState('')
  const [luna, setLuna] = useState('')
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

  // Presetează sezonul activ (o singură dată) — aliniat cu compozitorul SMS:
  // nu chemăm/sunăm oameni din sezoane vechi. Operatorul poate trece pe „Toate".
  const [sezonInit, setSezonInit] = useState(false)
  useEffect(() => {
    if (!sezonInit && sezonActivQ.data) {
      setSezonId(sezonActivQ.data)
      setSezonInit(true)
    }
  }, [sezonInit, sezonActivQ.data])

  const worklistQ = useQuery({
    queryKey: ['restante-worklist', locatieId ?? '', sezonId, luna],
    queryFn: () => getRestanteWorklist(locatieId, sezonId || null, luna || null),
    placeholderData: keepPreviousData,
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
    },
    onError: (e: unknown) => setActionError(humanizeError(e, 'Eroare la suspendare.')),
  })

  const onSuspend = (r: WorklistRow) => {
    const msg = r.suspendat
      ? `Reactivezi accesul la clase pentru ${r.nume} ${r.prenume ?? ''}?`
      : `Suspenzi accesul la clase pentru ${r.nume} ${r.prenume ?? ''} (rest ${formatRON(r.rest_total)})? Nu va mai putea fi marcat prezent și nu va putea rezerva până la achitare.`
    if (window.confirm(msg)) suspendM.mutate(r)
  }

  const allRows = worklistQ.data ?? []
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows.filter((r) => {
      if (status && statusColectare(r) !== status) return false
      if (q) {
        const haystack = `${r.nume} ${r.prenume ?? ''} ${r.telefon ?? ''} ${r.cursuri ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [allRows, search, status])

  const totalRest = useMemo(
    () => rows.reduce((a, r) => a + Number(r.rest_total ?? 0), 0),
    [rows],
  )
  const top = useMemo(
    () => [...rows].sort((a, b) => b.rest_total - a.rest_total).slice(0, 5),
    [rows],
  )

  const exportCsv = () =>
    downloadCsv(
      `datornici-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Client', 'Status client', 'Telefon', 'Locatie', 'Ce datoreaza', 'Rate', 'Rest RON', 'Zile intarziere', 'Status', 'Promisiune'],
      rows.map((r) => [
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="m-0 text-sm font-semibold text-quasar-black">Datornici de sunat</h3>
        <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
          ⬇ Export CSV
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Field label="Caută" htmlFor="dat-cauta">
            <TextInput
              id="dat-cauta"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="client, telefon, curs…"
            />
          </Field>
        </div>
        <div className="w-48">
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
        <div className="w-44">
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
        <div className="w-44">
          <Field label="Are rată din luna" htmlFor="dat-luna">
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

      {worklistQ.isLoading ? (
        <Spinner />
      ) : worklistQ.isError ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(worklistQ.error)}</p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            <strong>{rows.length}</strong> datornici de sunat · rest total{' '}
            <span className="font-semibold text-red-600">{formatRON(totalRest)}</span>
          </p>

          {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

          {top.length > 1 && (
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
                  {r.zile_depasire != null && (
                    <span className="text-quasar-gray"> · {r.zile_depasire}z</span>
                  )}
                </Link>
              ))}
            </div>
          )}

          <WorklistTable
            rows={rows}
            onLog={onLog}
            onPlata={onPlata}
            onSms={(r) => smsM.mutate(r)}
            smsQueuedIds={smsQueuedIds}
            canSuspend={canSuspend}
            onSuspend={onSuspend}
          />
        </>
      )}
    </div>
  )
}
