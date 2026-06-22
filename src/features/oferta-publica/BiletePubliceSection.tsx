import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Spinner, type Column } from '@/components/ui'
import type { BiletPublic } from '@/types/db'
import { listBiletePublice } from './api'

// Preview read-only. `bilete_publice` e un VIEW peste `evenimente` — sursa unică de
// editare e modulul Evenimente (evenimentele cu „Afișează biletul pe portal" bifat,
// viitoare și neanulate).
export function BiletePubliceSection() {
  const bileteQuery = useQuery({ queryKey: ['bilete_publice'], queryFn: listBiletePublice })

  const columns: Column<BiletPublic>[] = [
    {
      header: 'Data',
      cell: (b) => b.data ?? '—',
      className: 'w-32 text-quasar-gray',
      sortValue: (b) => b.data,
    },
    {
      header: 'Eveniment',
      cell: (b) => (
        <span className="font-medium">
          {b.nume}
          {b.descriere ? (
            <span className="block text-xs font-normal text-quasar-gray">{b.descriere}</span>
          ) : null}
        </span>
      ),
      sortValue: (b) => b.nume?.toLowerCase(),
    },
    {
      header: 'Locație',
      cell: (b) => b.locatie ?? '—',
      sortValue: (b) => b.locatie?.toLowerCase(),
    },
    {
      header: 'Preț bilet',
      cell: (b) => (b.pret_bilet != null ? `${b.pret_bilet} lei` : '—'),
      className: 'w-28',
      sortValue: (b) => b.pret_bilet ?? 0,
    },
  ]

  return (
    <section>
      <h2 className="mb-1 text-lg font-bold text-quasar-black">Bilete evenimente (din Evenimente)</h2>
      <p className="mb-3 text-sm text-quasar-gray">
        Lista derivă automat din evenimentele viitoare marcate „Afișează biletul pe portal" și apare
        pe portalul de membri (pagina „Servicii și prețuri"). Editezi din{' '}
        <Link to="/evenimente" className="font-medium text-quasar-black underline">
          Evenimente →
        </Link>
      </p>

      {bileteQuery.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={bileteQuery.data ?? []}
          rowKey={(b) => b.id ?? ''}
          emptyMessage="Niciun bilet afișat pe portal."
        />
      )}
    </section>
  )
}
