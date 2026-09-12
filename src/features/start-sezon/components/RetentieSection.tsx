import { DataTable, type Column } from '@/components/ui'
import type { StartSezonRetentieRow } from '../api'
import { Section } from './Section'

function procent(r: StartSezonRetentieRow): number {
  return r.total === 0 ? 0 : Math.round((r.reveniti / r.total) * 100)
}

export function RetentieSection({ rows }: { rows: StartSezonRetentieRow[] }) {
  const columns: Column<StartSezonRetentieRow>[] = [
    {
      header: 'Grupa din sezonul trecut',
      cell: (r) => <span className="font-medium text-ink">{r.curs_nume}</span>,
      sortValue: (r) => r.curs_nume,
    },
    {
      header: 'Locație',
      cell: (r) => <span className="text-muted-2">{r.locatie_nume}</span>,
      sortValue: (r) => r.locatie_nume,
    },
    {
      header: 'Erau',
      cell: (r) => <span className="fnum">{r.total}</span>,
      className: 'text-right',
      sortValue: (r) => r.total,
      defaultDir: 'desc',
    },
    {
      header: 'S-au întors',
      cell: (r) => <span className="fnum">{r.reveniti}</span>,
      className: 'text-right',
      sortValue: (r) => r.reveniti,
      defaultDir: 'desc',
    },
    {
      header: 'Retenție',
      cell: (r) => {
        const p = procent(r)
        return (
          <div className="flex items-center justify-end gap-2">
            <span className="fnum w-10 text-right">{p}%</span>
            <div className="h-2 w-20 overflow-hidden rounded-sm bg-line">
              <i
                className="block h-full"
                style={{
                  width: `${p}%`,
                  background:
                    p >= 60
                      ? 'var(--color-success)'
                      : p >= 35
                        ? 'var(--color-warn)'
                        : 'var(--color-danger)',
                }}
              />
            </div>
          </div>
        )
      },
      className: 'text-right',
      sortValue: (r) => procent(r),
      defaultDir: 'desc',
    },
  ]

  return (
    <Section
      title="Retenția pe grupa din sezonul trecut"
      note="Câți oameni din fiecare grupă de anul trecut au revenit undeva în sezonul nou — nu neapărat în aceeași grupă. Grupele de tip drop-in (Open Class) nu se citesc ca abonamentele: pe acolo trec oameni care n-au avut niciodată abonament de sezon."
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.curs_id}
        defaultSort={{ idx: 2, dir: 'desc' }}
        emptyMessage="Nimic de arătat pentru sezonul selectat."
      />
    </Section>
  )
}
