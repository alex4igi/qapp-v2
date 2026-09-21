import { Tooltip } from '@/components/ui'

export type SituatieRow = {
  locatieId: string | null
  nume: string
  inscrisi: number
  activi: number
  ocupate: number | null
  capacitate: number | null
  procent: number | null
}

type Props = {
  rows: SituatieRow[]
  total: SituatieRow
  /** Locația selectată din header — rândul ei e evidențiat, restul rămân vizibili. */
  activeLocatieId: string | null
}

const NOTA_TOTAL = (
  <>
    <p className="font-semibold">De ce totalul nu e suma coloanei</p>
    <p className="mt-1">
      Oamenii se numără o singură dată pe tot clubul: un cursant înscris la două
      locații apare pe ambele rânduri, dar o dată în total.
    </p>
    <p className="mt-1.5">
      Locurile, în schimb, se adună — ocuparea pe club e suma locurilor ocupate
      împărțită la suma capacităților.
    </p>
  </>
)

function Ocupare({ row }: { row: SituatieRow }) {
  if (row.procent == null || !row.capacitate) {
    return <span className="text-muted">—</span>
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="fnum whitespace-nowrap font-medium">
        {row.procent.toLocaleString('ro-RO')}%
      </span>
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-quasar-yellow"
          style={{ width: `${Math.min(100, row.procent)}%` }}
        />
      </div>
    </div>
  )
}

export function SituatieLocatiiTable({ rows, total, activeLocatieId }: Props) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold text-ink">Situație pe locații</h3>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Nicio locație cu cursuri în sezonul activ.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 text-left font-semibold">Locație</th>
              <th className="py-2 text-right font-semibold">Înscriși</th>
              <th className="py-2 text-right font-semibold">Vin efectiv</th>
              <th className="py-2 text-right font-semibold">Ocupare</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.locatieId ?? r.nume}
                className={`border-b border-line-2 ${
                  r.locatieId === activeLocatieId ? 'bg-rowhover font-medium' : ''
                }`}
              >
                <td className="py-2.5 pr-2 text-ink">{r.nume}</td>
                <td className="fnum py-2.5 text-right text-ink">{r.inscrisi}</td>
                <td className="fnum py-2.5 text-right text-ink">{r.activi}</td>
                <td className="py-2.5 text-right text-ink">
                  <Ocupare row={r} />
                </td>
              </tr>
            ))}
            <tr className="font-semibold text-ink">
              <td className="py-2.5 pr-2">
                <Tooltip content={NOTA_TOTAL} width={300} className="inline-flex items-center gap-1.5">
                  <span>{total.nume}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="De ce totalul nu e suma coloanei"
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-muted text-[10px] font-bold leading-none text-muted"
                  >
                    i
                  </span>
                </Tooltip>
              </td>
              <td className="fnum py-2.5 text-right">{total.inscrisi}</td>
              <td className="fnum py-2.5 text-right">{total.activi}</td>
              <td className="py-2.5 text-right">
                <Ocupare row={total} />
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

// Varianta de telefon: patru cifre pe rând nu încap la 375px.
export function SituatieLocatiiList({ rows, total, activeLocatieId }: Props) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">Situație pe locații</h3>
      <ul className="space-y-3">
        {[...rows, total].map((r) => (
          <li
            key={r.locatieId ?? r.nume}
            className={`border-b border-line-2 pb-3 last:border-0 last:pb-0 ${
              r.locatieId === activeLocatieId ? 'font-medium' : ''
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-ink">{r.nume}</span>
              <span className="fnum shrink-0 text-xs text-muted-2">
                {r.inscrisi} înscriși · {r.activi} vin
              </span>
            </div>
            {r.procent != null && r.capacitate ? (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-quasar-yellow"
                    style={{ width: `${Math.min(100, r.procent)}%` }}
                  />
                </div>
                <span className="fnum text-xs text-muted-2">
                  {r.procent.toLocaleString('ro-RO')}%
                </span>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
