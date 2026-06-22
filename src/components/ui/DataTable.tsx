import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Column<T> = {
  header: string
  cell: (row: T) => ReactNode
  className?: string
  // Dacă e setat, headerul devine sortabil (click → asc/desc) pe valoarea returnată.
  sortValue?: (row: T) => string | number | null | undefined
}

type SortDir = 'asc' | 'desc'

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyMessage?: string
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

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'Niciun rezultat.',
}: Props<T>) {
  const [sortIdx, setSortIdx] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(idx: number) {
    if (sortIdx === idx) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortIdx(idx)
      setSortDir('asc')
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

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
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
                    'px-3 py-2.5 font-semibold text-quasar-black',
                    col.className,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(idx)}
                      className={cn(
                        'inline-flex items-center gap-1 font-semibold hover:text-quasar-black/70',
                        col.className?.includes('text-right') && 'flex-row-reverse',
                      )}
                    >
                      {col.header}
                      <span className="text-xs text-quasar-gray">
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
          {sortedRows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-quasar-gray"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-gray-100 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-gray-50',
                )}
              >
                {columns.map((col, idx) => (
                  <td
                    key={col.header || idx}
                    className={cn('px-3 py-2.5 text-quasar-black', col.className)}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
