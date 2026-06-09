import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { PageHeader, Field, Select, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getRestanteWorklist, type WorklistRow } from './api'
import { RecuperareWorklistTable } from './RecuperareWorklistTable'
import { LogRecuperareModal, type RecuperareTarget } from './LogRecuperareModal'

export function RecuperarePage() {
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const [locatieId, setLocatieId] = useState(globalLocatieId ?? '')
  const [target, setTarget] = useState<RecuperareTarget | null>(null)

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })
  const worklistQ = useQuery({
    queryKey: ['restante-worklist', locatieId],
    queryFn: () => getRestanteWorklist(locatieId || null),
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
        subtitle="Datornici activi cu 2+ rate neachitate — de sunat"
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
      </div>

      {worklistQ.isLoading ? (
        <Spinner />
      ) : worklistQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {worklistQ.error instanceof Error ? worklistQ.error.message : ''}
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
