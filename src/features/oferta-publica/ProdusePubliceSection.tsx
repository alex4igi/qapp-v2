import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Spinner, type Column } from '@/components/ui'
import type { ProdusPublic } from '@/types/db'
import { listProdusePublice } from './api'

// Preview read-only. `produse_publice` e un VIEW peste `inventar` — sursa unică de
// editare e Inventarul (articolele cu „Afișează pe portal" bifat).
export function ProdusePubliceSection() {
  const produseQuery = useQuery({ queryKey: ['produse_publice'], queryFn: listProdusePublice })

  const columns: Column<ProdusPublic>[] = [
    {
      header: 'Ordine',
      cell: (p) => p.ordine,
      className: 'w-16 text-quasar-gray',
    },
    {
      header: 'Produs',
      cell: (p) => (
        <span className="font-medium">
          {p.nume}
          {p.descriere ? (
            <span className="block text-xs font-normal text-quasar-gray">{p.descriere}</span>
          ) : null}
        </span>
      ),
    },
    { header: 'Preț', cell: (p) => p.pret },
  ]

  return (
    <section>
      <h2 className="mb-1 text-lg font-bold text-quasar-black">Produse publice (din Inventar)</h2>
      <p className="mb-3 text-sm text-quasar-gray">
        Lista derivă automat din articolele marcate „Afișează pe portal" în Inventar și apare pe
        portalul de membri (pagina „Servicii și prețuri"). Editezi din{' '}
        <Link to="/inventar" className="font-medium text-quasar-black underline">
          Inventar →
        </Link>
      </p>

      {produseQuery.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={produseQuery.data ?? []}
          rowKey={(p) => p.id ?? ''}
          emptyMessage="Niciun produs afișat pe portal."
        />
      )}
    </section>
  )
}
