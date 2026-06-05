import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Field, Select, TextInput, Spinner } from '@/components/ui'
import { cursuriOptions, cursuriOptionsForCurrentTeacher } from '@/lib/lookups'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isTeacher } from '@/lib/rolesMatrix'
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
  const { role } = useAuth()
  const { locatieId: workingLocatieId } = useWorkingLocatie()
  const teacherMode = isTeacher(role)
  const [cursId, setCursId] = useState('')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))

  const cursuri = useQuery({
    queryKey: ['lookup', 'cursuri', teacherMode ? 'teacher' : workingLocatieId ?? 'all'],
    queryFn: () =>
      teacherMode
        ? cursuriOptionsForCurrentTeacher()
        : cursuriOptions(workingLocatieId),
  })

  const roster = useQuery({
    queryKey: ['prezente', 'roster', cursId],
    queryFn: () => getCursRoster(cursId),
    enabled: Boolean(cursId),
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
            <TextInput
              id="data"
              type="date"
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
      ) : roster.isLoading ? (
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
