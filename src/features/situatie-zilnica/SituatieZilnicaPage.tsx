import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Field,
  TextInput,
  Select,
  Spinner,
  DataTable,
  type Column,
} from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import {
  getIncasariZi,
  sumarFromRows,
  type IncasareRow,
} from './api'
import { ReconciliereCashCard } from './ReconciliereCashCard'

function todayIso(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

const columns: Column<IncasareRow>[] = [
  {
    header: 'Client',
    cell: (r) => (
      <span className="font-medium">{r.client_nume ?? '—'}</span>
    ),
    sortValue: (r) => r.client_nume?.toLowerCase(),
  },
  {
    header: 'Categorie',
    cell: (r) => r.categorie ?? '—',
    className: 'w-28',
    sortValue: (r) => r.categorie?.toLowerCase(),
  },
  {
    header: 'Detalii',
    cell: (r) => r.detalii ?? '—',
    sortValue: (r) => r.detalii?.toLowerCase(),
  },
  {
    header: 'Locație',
    cell: (r) => r.locatie_nume ?? '—',
    className: 'w-40',
    sortValue: (r) => r.locatie_nume?.toLowerCase(),
  },
  {
    header: 'Sumă',
    cell: (r) => (
      <span className="font-semibold">{formatRON(r.suma)}</span>
    ),
    className: 'w-28 text-right',
    sortValue: (r) => r.suma ?? 0,
  },
  {
    header: 'Metodă',
    cell: (r) => r.metoda ?? '—',
    className: 'w-24',
    sortValue: (r) => r.metoda?.toLowerCase(),
  },
  {
    header: 'Observații',
    cell: (r) => r.observatii ?? '—',
    className: 'text-xs text-quasar-gray',
    sortValue: (r) => r.observatii?.toLowerCase(),
  },
]

function SumarStrip({
  total, cash, card, transfer, revolut,
}: {
  total: number
  cash: number
  card: number
  transfer: number
  revolut: number
}) {
  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-4 text-sm">
        <span>
          Total ziua:{' '}
          <span className="text-base font-bold text-quasar-black">
            {formatRON(total)}
          </span>
        </span>
        <span className="text-quasar-gray">|</span>
        <span>Cash: <span className="font-semibold">{formatRON(cash)}</span></span>
        <span>Card: <span className="font-semibold">{formatRON(card)}</span></span>
        <span>Transfer: <span className="font-semibold">{formatRON(transfer)}</span></span>
        <span>Revolut: <span className="font-semibold">{formatRON(revolut)}</span></span>
      </div>
    </div>
  )
}

export function SituatieZilnicaPage() {
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const [ziua, setZiua] = useState(todayIso())
  // Default la locația globală; userul poate override pe pagină
  const [locatieId, setLocatieId] = useState(globalLocatieId ?? '')

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const incasariQ = useQuery({
    queryKey: ['situatie-zi', ziua, locatieId],
    queryFn: () => getIncasariZi(ziua, locatieId || null),
  })

  const sumar = useMemo(
    () => sumarFromRows(incasariQ.data ?? []),
    [incasariQ.data],
  )

  const locatieNume = locatiiQ.data?.find((o) => o.value === locatieId)?.label

  return (
    <div>
      <PageHeader
        title="Situație zilnică"
        actions={
          <div className="flex items-end gap-3">
            <div className="w-44">
              <Field label="Ziua" htmlFor="sz-data">
                <TextInput
                  id="sz-data"
                  type="date"
                  value={ziua}
                  onChange={(e) => setZiua(e.target.value || todayIso())}
                />
              </Field>
            </div>
            <div className="w-60">
              <Field label="Locația" htmlFor="sz-loc">
                <Select
                  id="sz-loc"
                  placeholder="Toate locațiile"
                  options={locatiiQ.data ?? []}
                  value={locatieId}
                  onChange={(e) => setLocatieId(e.target.value)}
                />
              </Field>
            </div>
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        <SumarStrip {...sumar} />

        <div className="rounded-lg border border-quasar-gray-light bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-quasar-black">
            Încasări — {ziua}
            {locatieNume ? ` · ${locatieNume}` : ''}
          </h2>
          {incasariQ.isLoading ? (
            <Spinner />
          ) : (
            <DataTable
              columns={columns}
              rows={incasariQ.data ?? []}
              rowKey={(r) => r.id}
              emptyMessage="Nicio încasare în această zi."
            />
          )}
        </div>

        {locatieId && locatieNume ? (
          <ReconciliereCashCard
            data={ziua}
            locatieId={locatieId}
            locatieNume={locatieNume}
            cashSistem={sumar.cash}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-quasar-gray-light bg-quasar-gray-light/30 p-6 text-center text-sm text-quasar-gray">
            Selectează o locație pentru a face reconcilierea cash zilnică.
          </div>
        )}
      </div>
    </div>
  )
}
