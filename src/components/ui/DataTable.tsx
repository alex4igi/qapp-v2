import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Column<T> = {
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyMessage?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'Niciun rezultat.',
}: Props<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-quasar-gray-light bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-quasar-gray-light bg-quasar-gray-light/60 text-left">
            {columns.map((col) => (
              <th
                key={col.header}
                className={cn(
                  'px-3 py-2.5 font-semibold text-quasar-black',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-quasar-gray"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-quasar-gray-light last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-quasar-gray-light/50',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.header}
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
