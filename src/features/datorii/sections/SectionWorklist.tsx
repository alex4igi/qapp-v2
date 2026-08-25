import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Field, Select, MonthPicker, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { sezoaneOptions, sezonActivId } from '@/lib/lookups'
import { getRestanteWorklist, type WorklistRow } from '../api'
import { WorklistTable } from '../WorklistTable'

// Worklist-ul de sunat (fostul /recuperare) + top datornici. Locația vine din
// scopul global al paginii (📍), sezonul e presetat pe cel activ.
export function SectionWorklist({
  locatieId,
  onLog,
  onPlata,
}: {
  locatieId: string | null
  onLog: (row: WorklistRow) => void
  onPlata: (row: WorklistRow) => void
}) {
  const [sezonId, setSezonId] = useState('')
  const [luna, setLuna] = useState('')

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

  const rows = worklistQ.data ?? []
  const totalRest = useMemo(
    () => rows.reduce((a, r) => a + Number(r.rest_total ?? 0), 0),
    [rows],
  )
  const top = useMemo(
    () => [...rows].sort((a, b) => b.rest_total - a.rest_total).slice(0, 5),
    [rows],
  )

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">Datornici de sunat</h3>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
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

          <WorklistTable rows={rows} onLog={onLog} onPlata={onPlata} />
        </>
      )}
    </div>
  )
}
