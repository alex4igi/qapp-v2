import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { PageHeader, Field, Select, MonthPicker, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions, sezoaneOptions, sezonActivId } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getRestanteWorklist, type WorklistRow } from './api'
import { RecuperareWorklistTable } from './RecuperareWorklistTable'
import { LogRecuperareModal, type RecuperareTarget } from './LogRecuperareModal'

export function RecuperarePage() {
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const [locatieId, setLocatieId] = useState(globalLocatieId ?? '')
  const [sezonId, setSezonId] = useState('')
  const [luna, setLuna] = useState('')
  const [target, setTarget] = useState<RecuperareTarget | null>(null)

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
    queryKey: ['restante-worklist', locatieId, sezonId, luna],
    queryFn: () => getRestanteWorklist(locatieId || null, sezonId || null, luna || null),
    placeholderData: keepPreviousData,
  })

  const rows = worklistQ.data ?? []
  const totalRest = useMemo(
    () => rows.reduce((a, r) => a + Number(r.rest_total ?? 0), 0),
    [rows],
  )

  const onLog = (r: WorklistRow) =>
    setTarget({
      clientId: r.client_id,
      nume: `${r.nume} ${r.prenume ?? ''}`.trim(),
      rest: r.rest_total,
    })

  return (
    <div>
      <PageHeader
        title="Recuperare restanțe"
        subtitle="Datornici activi cu rate depășite — de sunat"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Locație" htmlFor="rec-loc">
            <Select
              id="rec-loc"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={locatieId}
              onChange={(e) => setLocatieId(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Sezon" htmlFor="rec-sez">
            <Select
              id="rec-sez"
              placeholder="Toate"
              options={sezoaneQ.data ?? []}
              value={sezonId}
              onChange={(e) => setSezonId(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Are rată din luna" htmlFor="rec-luna">
            <div className="flex items-center gap-1">
              <MonthPicker id="rec-luna" value={luna} onChange={setLuna} />
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
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {humanizeError(worklistQ.error)}
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            <strong>{rows.length}</strong> datornici de sunat · rest total{' '}
            <span className="font-semibold text-red-600">
              {formatRON(totalRest)}
            </span>
          </p>
          <RecuperareWorklistTable rows={rows} onLog={onLog} />
        </>
      )}

      {target && (
        <LogRecuperareModal
          open
          target={target}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  )
}
