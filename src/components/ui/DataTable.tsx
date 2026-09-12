import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useIsMobile } from '@/hooks/useIsMobile'

type SortDir = 'asc' | 'desc'

export type Column<T> = {
  header: string
  cell: (row: T) => ReactNode
  className?: string
  // Dacă e setat, headerul devine sortabil (click → asc/desc) pe valoarea returnată.
  sortValue?: (row: T) => string | number | null | undefined
  // Direcția la PRIMUL click pe antet. Implicit 'asc'; pune 'desc' unde util e
  // capătul mare (date — cele mai noi primele), ca să nu ceară două click-uri.
  defaultDir?: SortDir
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyMessage?: string
  // Plafon de randare, aplicat DUPĂ sortare. Apelanții care taie ei lista înainte
  // (`rows.slice(0, N)`) sortează doar felia vizibilă — un click pe „Nume" peste
  // 6000 de rânduri ar da atunci primul rând greșit.
  maxRows?: number
  // Evidențiere per rând (ex: „sunat azi"); nu se poate exprima prin
  // Column.className, care nu vede rândul.
  rowClassName?: (row: T) => string | undefined
  // Sortarea activă la prima randare. Preferă asta în locul pre-sortării
  // rândurilor de către apelant: acolo tabelul nu știe după ce e ordonat, deci
  // niciun antet nu se aprinde și criteriul devine invizibil pentru utilizator.
  defaultSort?: { idx: number; dir?: SortDir }
  // Cardul de pe telefon, când stivuirea implicită a coloanelor nu e destul.
  mobileCard?: (row: T) => ReactNode
  // Înălțime maximă a tabelului (ex: 460). Peste ea, tabelul își face propriul
  // scroll și antetul rămâne lipit sus. Pentru pagini de raport cu mai multe liste
  // lungi una sub alta, unde altfel a treia secțiune ajunge la doi metri de derulare.
  maxHeight?: number | string
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  // Valorile lipsă merg mereu la coadă, indiferent de direcție.
  const aEmpty = a == null || a === ''
  const bEmpty = b == null || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'ro', { numeric: true })
}

/** Sortarea pe telefon: un select nativ în locul antetelor de tabel. */
function MobileSortBar<T>({
  columns,
  sortIdx,
  sortDir,
  onPick,
  onFlip,
}: {
  columns: Column<T>[]
  sortIdx: number | null
  sortDir: SortDir
  onPick: (idx: number | null) => void
  onFlip: () => void
}) {
  const sortable = columns
    .map((col, idx) => ({ col, idx }))
    .filter((c) => !!c.col.sortValue)
  if (sortable.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 text-sm text-ink">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
          Sortare
        </span>
        <select
          value={sortIdx ?? ''}
          onChange={(e) => onPick(e.target.value === '' ? null : Number(e.target.value))}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
        >
          <option value="">Implicită</option>
          {sortable.map(({ col, idx }) => (
            <option key={col.header || idx} value={idx}>
              {col.header}
            </option>
          ))}
        </select>
      </label>
      {sortIdx != null && (
        <button
          type="button"
          onClick={onFlip}
          aria-label={sortDir === 'asc' ? 'Crescător' : 'Descrescător'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-sm text-muted-2"
        >
          {sortDir === 'asc' ? '▲' : '▼'}
        </button>
      )}
    </div>
  )
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'Niciun rezultat.',
  maxRows,
  rowClassName,
  defaultSort,
  mobileCard,
  maxHeight,
}: Props<T>) {
  const isMobile = useIsMobile()
  const [sortIdx, setSortIdx] = useState<number | null>(defaultSort?.idx ?? null)
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort?.dir ?? 'asc')

  function toggleSort(idx: number) {
    if (sortIdx === idx) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortIdx(idx)
      setSortDir(columns[idx]?.defaultDir ?? 'asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (sortIdx == null) return rows
    const col = columns[sortIdx]
    if (!col?.sortValue) return rows
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort(
      (a, b) => compareValues(col.sortValue!(a), col.sortValue!(b)) * dir,
    )
  }, [rows, columns, sortIdx, sortDir])

  const visibleRows =
    maxRows != null && sortedRows.length > maxRows
      ? sortedRows.slice(0, maxRows)
      : sortedRows
  const taiate = sortedRows.length - visibleRows.length

  // Pe telefon un tabel de 8-10 coloane s-ar citi doar trăgându-l lateral, așa că
  // fiecare rând devine card. Coloanele fără antet (acțiuni, bulinele de status)
  // se adună jos, ca să nu apară etichete goale.
  if (isMobile) {
    const titleCol = columns.find((c) => c.header)
    const bodyCols = columns.filter((c) => c.header && c !== titleCol)
    const trailingCols = columns.filter((c) => !c.header)

    return (
      <div className="flex flex-col gap-2">
        <MobileSortBar
          columns={columns}
          sortIdx={sortIdx}
          sortDir={sortDir}
          onPick={(idx) => {
            setSortIdx(idx)
            if (idx != null) setSortDir(columns[idx]?.defaultDir ?? 'asc')
          }}
          onFlip={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        />

        {visibleRows.length === 0 ? (
          <p className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
            {emptyMessage}
          </p>
        ) : (
          visibleRows.map((row) => (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'rounded-2xl border border-line bg-card p-3.5 shadow-sm',
                onRowClick && 'active:bg-rowhover',
                rowClassName?.(row),
              )}
            >
              {mobileCard ? (
                mobileCard(row)
              ) : (
                <>
                  {titleCol && (
                    <div className="text-sm font-semibold text-ink">
                      {titleCol.cell(row)}
                    </div>
                  )}
                  {bodyCols.length > 0 && (
                    <dl className="mt-2 grid grid-cols-[minmax(0,38%)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                      {bodyCols.map((col, idx) => (
                        <Fragment key={col.header || idx}>
                          <dt className="text-[11px] uppercase tracking-wide text-muted">
                            {col.header}
                          </dt>
                          <dd className="min-w-0 text-ink">{col.cell(row)}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  )}
                  {trailingCols.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                      {trailingCols.map((col, idx) => (
                        <Fragment key={idx}>{col.cell(row)}</Fragment>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}

        {taiate > 0 && (
          <p className="px-1 py-1 text-center text-xs text-muted">
            Afișate primele {visibleRows.length} din {sortedRows.length} — restrânge
            filtrele sau exportă lista completă.
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-2xl border border-line bg-card shadow-sm',
        maxHeight != null && 'overflow-y-auto',
      )}
      style={maxHeight != null ? { maxHeight } : undefined}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface text-left">
            {columns.map((col, idx) => {
              const sortable = !!col.sortValue
              const active = sortIdx === idx
              return (
                <th
                  key={col.header || idx}
                  aria-sort={
                    active
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cn(
                    'px-3 py-2.5 font-semibold text-ink',
                    // Lipit sus doar când tabelul are scroll propriu; `bg-surface` se
                    // repetă pe celulă pentru că fundalul de pe <tr> nu acoperă la sticky.
                    maxHeight != null && 'sticky top-0 z-10 bg-surface',
                    col.className,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(idx)}
                      className={cn(
                        'inline-flex items-center gap-1 font-semibold hover:text-ink/70',
                        col.className?.includes('text-right') && 'flex-row-reverse',
                      )}
                    >
                      {col.header}
                      <span className="text-xs text-muted">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            visibleRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-line-2 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-rowhover',
                  rowClassName?.(row),
                )}
              >
                {columns.map((col, idx) => (
                  <td
                    key={col.header || idx}
                    className={cn('px-3 py-2.5 text-ink', col.className)}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {taiate > 0 && (
          <tfoot>
            <tr>
              <td
                colSpan={columns.length}
                className="border-t border-line bg-surface px-3 py-2 text-center text-xs text-muted"
              >
                Afișate primele {visibleRows.length} din {sortedRows.length} —
                restrânge filtrele sau exportă lista completă.
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
