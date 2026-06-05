import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Tabs,
  Spinner,
  DataTable,
  Button,
  type Column,
} from '@/components/ui'
import { formatRON } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import {
  getStatisticaLunara,
  getRestanteTeacher,
  getRestanteLocatie,
  type StatLunara,
  type RestantaTeacher,
  type RestantaLocatie,
} from './api'

const subTabs = [
  { id: 'totale',   label: 'Totale' },
  { id: 'teacher',  label: 'Pe teacher' },
  { id: 'locatie',  label: 'Pe locație' },
]

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2 w-full rounded-full bg-quasar-gray-light">
      <div
        className="h-2 rounded-full bg-quasar-yellow"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function TotaleSubTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['stat', 'lunara'],
    queryFn: getStatisticaLunara,
  })

  const maxTotal = useMemo(
    () => Math.max(1, ...(data ?? []).map((r) => r.total ?? 0)),
    [data],
  )

  if (isLoading) return <Spinner />

  const columns: Column<StatLunara>[] = [
    { header: 'Luna', cell: (r) => r.id ?? '—', className: 'w-24' },
    {
      header: 'De încasat',
      cell: (r) => formatRON(r.total),
      className: 'w-32 text-right',
    },
    {
      header: 'Încasat',
      cell: (r) => formatRON(r.incasat),
      className: 'w-32 text-right',
    },
    {
      header: 'Rest',
      cell: (r) => {
        const rest = (r.total ?? 0) - (r.incasat ?? 0)
        return (
          <span className={rest > 0 ? 'font-semibold text-red-600' : ''}>
            {formatRON(rest)}
          </span>
        )
      },
      className: 'w-32 text-right',
    },
    {
      header: 'Volum',
      cell: (r) => <Bar value={r.total ?? 0} max={maxTotal} />,
    },
  ]

  const onExport = () => {
    downloadCsv(
      `evolutie-totala-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Luna', 'De încasat (RON)', 'Încasat (RON)', 'Rest (RON)'],
      (data ?? []).map((r) => [
        r.id ?? '',
        Number(r.total ?? 0),
        Number(r.incasat ?? 0),
        Number(r.total ?? 0) - Number(r.incasat ?? 0),
      ]),
    )
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" onClick={onExport} disabled={!data?.length}>
          ⬇ Export CSV
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id ?? Math.random().toString()}
        emptyMessage="Nicio dată."
      />
    </div>
  )
}

function TeacherSubTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['stat', 'teacher'],
    queryFn: getRestanteTeacher,
  })
  if (isLoading) return <Spinner />

  const columns: Column<RestantaTeacher>[] = [
    { header: 'Luna', cell: (r) => r.luna ?? '—', className: 'w-24' },
    {
      header: 'Teacher',
      cell: (r) => (
        <span className="font-medium">{r.nume_teacher ?? '—'}</span>
      ),
    },
    {
      header: 'De încasat',
      cell: (r) => formatRON(r.total_de_incasat),
      className: 'w-32 text-right',
    },
    {
      header: 'Încasat',
      cell: (r) => formatRON(r.total_incasat),
      className: 'w-32 text-right',
    },
  ]

  const onExport = () => {
    downloadCsv(
      `evolutie-teacher-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Luna', 'Teacher', 'De încasat (RON)', 'Încasat (RON)'],
      (data ?? []).map((r) => [
        r.luna ?? '',
        r.nume_teacher ?? '',
        Number(r.total_de_incasat ?? 0),
        Number(r.total_incasat ?? 0),
      ]),
    )
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" onClick={onExport} disabled={!data?.length}>
          ⬇ Export CSV
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => String(r.id)}
        emptyMessage="Nicio dată."
      />
    </div>
  )
}

function LocatieSubTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['stat', 'locatie'],
    queryFn: getRestanteLocatie,
  })
  if (isLoading) return <Spinner />

  const columns: Column<RestantaLocatie>[] = [
    { header: 'Luna', cell: (r) => r.luna ?? '—', className: 'w-24' },
    {
      header: 'Locație',
      cell: (r) => (
        <span className="font-medium">{r.nume_locatie ?? '—'}</span>
      ),
    },
    {
      header: 'De încasat',
      cell: (r) => formatRON(r.total_de_incasat),
      className: 'w-32 text-right',
    },
    {
      header: 'Încasat',
      cell: (r) => formatRON(r.total_incasat),
      className: 'w-32 text-right',
    },
  ]

  const onExport = () => {
    downloadCsv(
      `evolutie-locatie-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Luna', 'Locație', 'De încasat (RON)', 'Încasat (RON)'],
      (data ?? []).map((r) => [
        r.luna ?? '',
        r.nume_locatie ?? '',
        Number(r.total_de_incasat ?? 0),
        Number(r.total_incasat ?? 0),
      ]),
    )
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" onClick={onExport} disabled={!data?.length}>
          ⬇ Export CSV
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => String(r.id)}
        emptyMessage="Nicio dată."
      />
    </div>
  )
}

export function EvolutieLunaraTab() {
  const [sub, setSub] = useState('totale')
  return (
    <div>
      <Tabs tabs={subTabs} active={sub} onChange={setSub} />
      {sub === 'totale' && <TotaleSubTab />}
      {sub === 'teacher' && <TeacherSubTab />}
      {sub === 'locatie' && <LocatieSubTab />}
    </div>
  )
}
