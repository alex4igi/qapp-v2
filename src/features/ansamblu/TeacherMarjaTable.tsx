import { formatRON } from '@/lib/format'
import type { ProfitabilitateTeacherRow } from './api'

export function TeacherMarjaTable({
  rows,
}: {
  rows: ProfitabilitateTeacherRow[]
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Nicio dată de încasări/salarii pentru teacheri în interval.
      </p>
    )
  }
  const faraSalarii = rows.every((r) => Number(r.salariu) === 0)
  return (
    <div className="overflow-x-auto rounded-lg border border-quasar-gray-light bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-quasar-gray-light text-left text-xs uppercase tracking-wide text-quasar-gray">
            <th className="px-3 py-2 font-medium">Instructor</th>
            <th className="px-3 py-2 text-right font-medium">Încasări</th>
            <th className="px-3 py-2 text-right font-medium">Salariu</th>
            <th className="px-3 py-2 text-right font-medium">Marjă</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.teacher_id}
              className="border-b border-quasar-gray-light last:border-0"
            >
              <td className="px-3 py-2 font-medium text-quasar-black">
                {r.teacher_nume}
              </td>
              <td className="px-3 py-2 text-right text-quasar-black">
                {formatRON(Number(r.incasari))}
              </td>
              <td className="px-3 py-2 text-right text-quasar-gray">
                {formatRON(Number(r.salariu))}
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold ${
                  Number(r.marja) < 0 ? 'text-red-600' : 'text-green-700'
                }`}
              >
                {formatRON(Number(r.marja))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {faraSalarii && (
        <p className="border-t border-quasar-gray-light px-3 py-2 text-xs text-quasar-gray">
          Salariile nu sunt încă calculate în interval — marja reflectă doar
          încasările.
        </p>
      )}
    </div>
  )
}
