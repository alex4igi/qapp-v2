import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Field,
  DateInput,
  Select,
  Spinner,
  DataTable,
  type Column,
} from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions } from '@/lib/lookups'
import { useTodayOnly } from '@/hooks/useTodayOnly'
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

function SumarCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        highlight
          ? 'border-quasar-yellow ring-1 ring-quasar-yellow'
          : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-quasar-yellow text-lg">
          {icon}
        </div>
        <span className="text-sm font-medium text-quasar-gray">{label}</span>
      </div>
      <div className="mt-3 font-display text-2xl font-bold text-quasar-black">
        {value}
      </div>
    </div>
  )
}

function SumarStrip({
  total, cash, card, transfer, revolut, online,
}: {
  total: number
  cash: number
  card: number
  transfer: number
  revolut: number
  online: number
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <SumarCard icon="💵" label="Total ziua" value={formatRON(total)} highlight />
      <SumarCard icon="💶" label="Cash" value={formatRON(cash)} />
      <SumarCard icon="💳" label="Card" value={formatRON(card)} />
      <SumarCard icon="🔁" label="Transfer" value={formatRON(transfer)} />
      <SumarCard icon="🟣" label="Revolut" value={formatRON(revolut)} />
      <SumarCard icon="🌐" label="Online" value={formatRON(online)} />
    </div>
  )
}

export function SituatieZilnicaPage() {
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const { active: todayOnly } = useTodayOnly()
  const [ziuaAleasa, setZiua] = useState(todayIso())
  const ziua = todayOnly ? todayIso() : ziuaAleasa
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
          <div className="flex flex-wrap items-end gap-3 max-md:w-full">
            {!todayOnly && (
              <div className="w-44 max-md:w-full">
                <Field label="Ziua" htmlFor="sz-data">
                  <DateInput
                    id="sz-data"
                    value={ziua}
                    onChange={(e) => setZiua(e.target.value || todayIso())}
                  />
                </Field>
              </div>
            )}
            <div className="w-60 max-md:w-full">
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

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-quasar-black">
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
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-quasar-gray">
            Selectează o locație pentru a face reconcilierea cash zilnică.
          </div>
        )}
      </div>
    </div>
  )
}
