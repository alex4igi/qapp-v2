import type { OcupareRow } from './api'

function barColor(procent: number | null): string {
  if (procent == null) return '#d1d5db'
  if (procent >= 100) return '#ef4444' // peste capacitate
  if (procent >= 70) return '#10b981' // bine ocupat
  return '#f59e0b' // loc disponibil
}

export function OcupareList({ rows }: { rows: OcupareRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Niciun curs în sezonul activ.
      </p>
    )
  }
  // Cel mai gol deasupra (procent crescător); cursurile fără capacitate la coadă.
  const sorted = [...rows].sort((a, b) => {
    if (a.procent == null && b.procent == null)
      return a.curs_nume.localeCompare(b.curs_nume)
    if (a.procent == null) return 1
    if (b.procent == null) return -1
    return a.procent - b.procent
  })
  return (
    <div className="max-h-96 overflow-y-auto rounded-lg border border-quasar-gray-light bg-white">
      <table className="w-full text-sm">
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.curs_id}
              className="border-b border-quasar-gray-light last:border-0"
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-quasar-black">
                    {r.curs_nume}
                  </span>
                  {r.facultativ && (
                    <span className="rounded-full bg-quasar-gray-light px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-quasar-gray">
                      facultativ
                    </span>
                  )}
                </div>
                <div className="text-xs text-quasar-gray">
                  {[r.teacher_nume, r.locatie_nume].filter(Boolean).join(' · ')}
                </div>
              </td>
              <td className="w-40 px-3 py-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-quasar-gray-light">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, r.procent ?? 0)}%`,
                      backgroundColor: barColor(r.procent),
                    }}
                  />
                </div>
              </td>
              <td className="w-28 whitespace-nowrap px-3 py-2 text-right">
                <span className="font-semibold text-quasar-black">
                  {r.activi}
                  {r.capacitate != null && (
                    <span className="text-quasar-gray">/{r.capacitate}</span>
                  )}
                </span>
                {r.procent != null && (
                  <span
                    className="ml-1 text-xs"
                    style={{ color: barColor(r.procent) }}
                  >
                    {r.procent}%
                  </span>
                )}
                {r.facultativ && (
                  <div className="text-[10px] leading-tight text-quasar-gray">
                    vârf ședință
                    {r.media != null && (
                      <span> · media {r.media}/{r.capacitate}</span>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
