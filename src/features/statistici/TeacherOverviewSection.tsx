import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Field, Select, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { teacheriOptions } from '@/lib/lookups'
import { getTeacherOverview } from './api'

const COLORS = [
  '#FFD600',
  '#111827',
  '#9ca3af',
  '#3b82f6',
  '#10b981',
  '#a855f7',
  '#f97316',
  '#ec4899',
]

export function TeacherOverviewSection() {
  const teacheriQ = useQuery({
    queryKey: ['lookup', 'teacheri', 'all'],
    queryFn: () => teacheriOptions(),
  })
  const [teacherId, setTeacherId] = useState('')

  // Pre-selectează primul instructor odată ce lista s-a încărcat.
  useEffect(() => {
    if (!teacherId && teacheriQ.data && teacheriQ.data.length > 0) {
      setTeacherId(teacheriQ.data[0].value)
    }
  }, [teacherId, teacheriQ.data])

  const overviewQ = useQuery({
    queryKey: ['stat', 'teacher-overview', teacherId],
    queryFn: () => getTeacherOverview(teacherId),
    enabled: !!teacherId,
  })

  const rows = overviewQ.data ?? []
  const total = useMemo(() => rows.reduce((s, r) => s + r.activi, 0), [rows])
  const donutRows = useMemo(() => rows.filter((r) => r.activi > 0), [rows])

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-quasar-black">
            Privire pe instructor
          </h2>
          <p className="text-xs text-quasar-gray">
            Clienți activi luna asta, pe grupe — cu prezențe și datorii.
          </p>
        </div>
        <div className="w-64">
          <Field label="Instructor" htmlFor="stat-overview-teacher">
            <Select
              id="stat-overview-teacher"
              placeholder="Alege instructor"
              options={teacheriQ.data ?? []}
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {overviewQ.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white py-8 text-center text-sm text-quasar-gray shadow-sm">
          Niciun curs asociat instructorului în sezonul activ.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Donut: total clienți activi în centru, un slice per grupă */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-quasar-black">
              Clienți activi pe grupe
            </h3>
            {donutRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-quasar-gray">
                Niciun client activ luna asta.
              </p>
            ) : (
              <div className="relative h-72">
                <div className="pointer-events-none absolute inset-0 -mt-6 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl font-bold text-quasar-black">
                    {total}
                  </span>
                  <span className="text-xs text-quasar-gray">
                    activi luna asta
                  </span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutRows}
                      dataKey="activi"
                      nameKey="curs_nume"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={104}
                      paddingAngle={2}
                      label={({ value }) => `${value}`}
                      labelLine={false}
                    >
                      {donutRows.map((r, i) => (
                        <Cell key={r.curs_id} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, n) => [`${v} activi`, n as string]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Situația fiecărei grupe: studenți, prezențe, datorii */}
          <div className="flex flex-col gap-3">
            {rows.map((r) => {
              const rataPct =
                r.posibile > 0
                  ? Math.round((100 * r.prezenti) / r.posibile)
                  : null
              return (
                <div
                  key={r.curs_id}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-quasar-black">
                      {r.curs_nume}
                    </span>
                    {r.facultativ && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-quasar-gray">
                        facultativ
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="font-display text-xl font-bold text-quasar-black">
                        {r.activi}
                      </div>
                      <div className="text-[11px] text-quasar-gray">studenți</div>
                    </div>
                    <div>
                      <div className="font-display text-xl font-bold text-quasar-black">
                        {r.posibile > 0
                          ? `${r.prezenti}/${r.posibile}`
                          : r.prezenti}
                      </div>
                      <div className="text-[11px] text-quasar-gray">
                        prezențe{rataPct !== null ? ` · ${rataPct}%` : ''}
                      </div>
                    </div>
                    <div>
                      <div
                        className={`font-display text-xl font-bold ${
                          r.datorie > 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {formatRON(r.datorie)}
                      </div>
                      <div className="text-[11px] text-quasar-gray">datorii</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
