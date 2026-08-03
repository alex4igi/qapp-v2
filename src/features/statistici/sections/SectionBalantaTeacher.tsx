import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import { useTeacheriOptions } from '@/hooks/useTeacheriOptions'
import { getBalantaTeacher, type Interval } from '../api'
import { BalantaChart } from '../BalantaChart'
import { STAT_QO } from './shared'

export function SectionBalantaTeacher({ interval }: { interval: Interval }) {
  const [teacherBalId, setTeacherBalId] = useState('')

  const teacheriQ = useTeacheriOptions({ locatieId: null })

  const balTeacherQ = useQuery({
    queryKey: ['stat', 'bal-teacher', interval, teacherBalId],
    queryFn: () => getBalantaTeacher(interval, teacherBalId || null),
    ...STAT_QO,
  })

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-quasar-black">
          Balanță teacher
        </h2>
        <div className="w-64">
          <Field label="Instructor" htmlFor="stat-teacher-bal">
            <Select
              id="stat-teacher-bal"
              placeholder="Toți instructorii"
              options={teacheriQ.data ?? []}
              value={teacherBalId}
              onChange={(e) => setTeacherBalId(e.target.value)}
            />
          </Field>
        </div>
      </div>
      {balTeacherQ.isLoading ? (
        <Spinner />
      ) : (
        <BalantaChart
          title={
            teacherBalId
              ? teacheriQ.data?.find((o) => o.value === teacherBalId)
                  ?.label ?? 'Instructorul selectat'
              : 'Toți instructorii'
          }
          rows={balTeacherQ.data ?? []}
          baseColor="#15803d"
          topColor="#bbf7d0"
        />
      )}
    </div>
  )
}
