import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Spinner, type Column } from '@/components/ui'
import { ChecklistBadge } from '@/components/checklist'
import { humanizeError } from '@/lib/errorMessage'
import { evalueazaChecklist, type Rezultat } from '@/lib/checklist'
import { CLIENT_CHECKLIST } from '@/lib/checklist/specs/client'
import { listClientiPentruChecklist, type ClientChecklistRow } from '../api'
import { Chips, Contor } from './ui'

type Rand = { client: ClientChecklistRow; rez: Rezultat }

const numeComplet = (c: ClientChecklistRow) =>
  `${c.nume} ${c.prenume ?? ''}`.trim()

export function ClientiIncompleteSection() {
  const navigate = useNavigate()

  const clientiQ = useQuery({
    queryKey: ['fise-incomplete', 'clienti'],
    queryFn: listClientiPentruChecklist,
  })

  const randuri = useMemo<Rand[]>(() => {
    return (clientiQ.data ?? [])
      .map((client) => ({
        client,
        rez: evalueazaChecklist(CLIENT_CHECKLIST, client),
      }))
      .filter((r) => !r.rez.completa)
      .sort(
        (a, b) =>
          b.rez.lipsaEsentiale.length - a.rez.lipsaEsentiale.length ||
          b.rez.lipsaRecomandate.length - a.rez.lipsaRecomandate.length ||
          numeComplet(a.client).localeCompare(numeComplet(b.client), 'ro'),
      )
  }, [clientiQ.data])

  const total = (clientiQ.data ?? []).length
  const cuEsentiale = randuri.filter((r) => r.rez.lipsaEsentiale.length > 0).length
  const doarRecomandate = randuri.length - cuEsentiale

  const columns: Column<Rand>[] = [
    {
      header: 'Client',
      cell: (r) => <span className="font-medium">{numeComplet(r.client)}</span>,
      sortValue: (r) => numeComplet(r.client).toLowerCase(),
    },
    {
      header: 'Telefon',
      cell: (r) => r.client.telefon ?? '—',
      sortValue: (r) => r.client.telefon ?? '',
    },
    {
      header: 'Fișă',
      cell: (r) => <ChecklistBadge rezultat={r.rez} compact />,
      className: 'w-36',
      sortValue: (r) =>
        r.rez.lipsaEsentiale.length * 100 + r.rez.lipsaRecomandate.length,
    },
    {
      header: 'Lipsesc',
      cell: (r) => <Chips rez={r.rez} />,
    },
  ]

  if (clientiQ.isLoading) return <Spinner />
  if (clientiQ.isError) {
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcare: {humanizeError(clientiQ.error)}
      </p>
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-3">
        <Contor
          valoare={cuEsentiale}
          eticheta="clienți activi cu câmpuri esențiale lipsă"
          tone="danger"
        />
        <Contor
          valoare={doarRecomandate}
          eticheta="clienți activi cu doar recomandate lipsă"
          tone="warn"
        />
        <Contor
          valoare={total - randuri.length}
          eticheta={`fișe complete din ${total}`}
          tone="success"
        />
      </div>

      <DataTable
        columns={columns}
        rows={randuri}
        rowKey={(r) => r.client.id}
        onRowClick={(r) => navigate(`/clienti/${r.client.id}`)}
        emptyMessage="Toți clienții activi au fișa completă. 🎉"
      />
    </section>
  )
}
