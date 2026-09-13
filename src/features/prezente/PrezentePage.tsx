import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Field, Select, DateInput, Spinner } from '@/components/ui'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { cursActivInLuna } from '@/features/cursuri/api'
import { sezoaneOptions, sezonActivId } from '@/lib/lookups'
import type { StatusPrezenta } from '@/types/db'
import {
  getCursRoster,
  getPrezente,
  upsertPrezenta,
  type RosterRow,
} from './api'

const STATUSES: { value: StatusPrezenta; label: string; active: string }[] = [
  { value: 'Prezent', label: 'Prezent', active: 'bg-green-600 text-white' },
  { value: 'Absent', label: 'Absent', active: 'bg-red-600 text-white' },
  { value: 'Motivat', label: 'Motivat', active: 'bg-amber-500 text-white' },
]

function StatusToggle({
  current,
  pending,
  onPick,
}: {
  current: StatusPrezenta | null
  pending: boolean
  onPick: (status: StatusPrezenta) => void
}) {
  return (
    <div className="flex gap-1">
      {STATUSES.map((s) => {
        const isActive = current === s.value
        return (
          <button
            key={s.value}
            type="button"
            disabled={pending}
            onClick={() => onPick(s.value)}
            className={[
              'rounded-md border px-2.5 py-1 text-sm transition-colors disabled:opacity-50',
              isActive
                ? `border-transparent ${s.active}`
                : 'border-quasar-gray-light bg-white text-quasar-gray hover:bg-quasar-gray-light',
            ].join(' ')}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

export function PrezentePage() {
  const queryClient = useQueryClient()
  const [cursId, setCursId] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [sezonFilter, setSezonFilter] = useState('')
  const [sezonInit, setSezonInit] = useState(false)

  const sezoaneQ = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
  })
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })

  // Default = sezonul activ; userul poate comuta pe un sezon vechi pentru
  // consultarea/corectarea prezențelor istorice.
  useEffect(() => {
    if (!sezonInit && sezonActivQ.isSuccess) {
      setSezonFilter(sezonActivQ.data ?? '')
      setSezonInit(true)
    }
  }, [sezonInit, sezonActivQ.isSuccess, sezonActivQ.data])

  const cursuri = useCursuriOptions({
    enabled: sezonInit,
    sezonId: sezonFilter || null,
  })

  // Prezențele se marchează doar pe lunile în care grupa chiar s-a ținut: o lună
  // de suspendare n-a existat, iar prezențele din ea ar intra în KPI și în
  // modelele de salariu pe prezență.
  const activInLuna = useQuery({
    queryKey: ['curs', cursId, 'activ-in-luna', data?.slice(0, 7)],
    queryFn: () => cursActivInLuna(cursId, data),
    enabled: Boolean(cursId) && Boolean(data),
  })
  const lunaSuspendata = activInLuna.data === false

  const roster = useQuery({
    queryKey: ['prezente', 'roster', cursId, data],
    queryFn: () => getCursRoster(cursId, data),
    enabled: Boolean(cursId) && Boolean(data) && activInLuna.data === true,
  })

  const enrollmentIds = useMemo(
    () => (roster.data ?? []).map((r) => r.enrollmentId),
    [roster.data],
  )

  const prezente = useQuery({
    queryKey: ['prezente', 'records', cursId, data],
    queryFn: () => getPrezente(enrollmentIds, data),
    enabled: Boolean(cursId) && enrollmentIds.length > 0 && Boolean(data),
  })

  const statusByEnrollment = useMemo(() => {
    const map = new Map<string, StatusPrezenta>()
    for (const p of prezente.data ?? []) {
      if (p.enrollment && p.status) map.set(p.enrollment, p.status)
    }
    return map
  }, [prezente.data])

  const mutation = useMutation({
    mutationFn: upsertPrezenta,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['prezente', 'records', cursId, data],
      })
    },
  })

  const mark = (row: RosterRow, status: StatusPrezenta) => {
    mutation.mutate({
      enrollmentId: row.enrollmentId,
      clientId: row.clientId,
      data,
      status,
    })
  }

  return (
    <div>
      <PageHeader title="Prezențe" subtitle="Marchează prezența pe ședință" />

      <div className="mb-5 flex flex-wrap gap-4">
        <div className="w-56">
          <Field label="Sezon" htmlFor="sezon">
            <Select
              id="sezon"
              placeholder="Toate sezoanele"
              options={sezoaneQ.data ?? []}
              value={sezonFilter}
              onChange={(e) => {
                setSezonFilter(e.target.value)
                setCursId('')
              }}
            />
          </Field>
        </div>
        <div className="w-64">
          <Field label="Curs" htmlFor="curs">
            <Select
              id="curs"
              placeholder="— alege curs —"
              options={cursuri.data ?? []}
              value={cursId}
              onChange={(e) => setCursId(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Data ședinței" htmlFor="data">
            <DateInput
              id="data"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {!cursId ? (
        <p className="text-sm text-quasar-gray">
          Alege un curs pentru a marca prezențele.
        </p>
      ) : lunaSuspendata ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⏸ Grupa e suspendată în luna asta — nu se marchează prezențe pe ea.
          Alege o dată dintr-o lună dinaintea suspendării, sau re-activează grupa
          din fișa cursului.
        </p>
      ) : roster.isLoading || activInLuna.isLoading ? (
        <Spinner />
      ) : (roster.data ?? []).length === 0 ? (
        <p className="text-sm text-quasar-gray">
          Niciun client înscris activ la acest curs.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-quasar-gray-light bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-quasar-gray-light bg-quasar-gray-light/60 text-left">
                <th className="px-3 py-2.5 font-semibold text-quasar-black">
                  Client
                </th>
                <th className="px-3 py-2.5 font-semibold text-quasar-black">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.data!.map((row) => (
                <tr
                  key={row.enrollmentId}
                  className="border-b border-quasar-gray-light last:border-0"
                >
                  <td className="px-3 py-2.5 font-medium text-quasar-black">
                    {row.nume} {row.prenume ?? ''}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusToggle
                      current={
                        statusByEnrollment.get(row.enrollmentId) ?? null
                      }
                      pending={
                        mutation.isPending &&
                        mutation.variables?.enrollmentId === row.enrollmentId
                      }
                      onPick={(status) => mark(row, status)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
