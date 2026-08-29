import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Spinner, type Column } from '@/components/ui'
import { ChecklistBadge } from '@/components/checklist'
import { humanizeError } from '@/lib/errorMessage'
import { evalueazaChecklist, type Rezultat } from '@/lib/checklist'
import { FAMILIE_CHECKLIST } from '@/lib/checklist/specs/familie'
import { listFamiliiPentruChecklist, type FamilieChecklistRow } from '../api'
import { Chips, Contor } from './ui'

type Rand = { familie: FamilieChecklistRow; rez: Rezultat }

export function FamiliiIncompleteSection() {
  const navigate = useNavigate()

  const familiiQ = useQuery({
    queryKey: ['fise-incomplete', 'familii'],
    queryFn: listFamiliiPentruChecklist,
  })

  const randuri = useMemo<Rand[]>(() => {
    return (familiiQ.data ?? [])
      .map((familie) => ({
        familie,
        rez: evalueazaChecklist(FAMILIE_CHECKLIST, familie),
      }))
      .filter((r) => !r.rez.completa)
      .sort(
        (a, b) =>
          b.rez.lipsaEsentiale.length - a.rez.lipsaEsentiale.length ||
          b.rez.lipsaRecomandate.length - a.rez.lipsaRecomandate.length ||
          a.familie.nume_familie.localeCompare(b.familie.nume_familie, 'ro'),
      )
  }, [familiiQ.data])

  const total = (familiiQ.data ?? []).length
  const cuEsentiale = randuri.filter((r) => r.rez.lipsaEsentiale.length > 0).length
  const doarRecomandate = randuri.length - cuEsentiale

  const columns: Column<Rand>[] = [
    {
      header: 'Familie',
      cell: (r) => <span className="font-medium">{r.familie.nume_familie}</span>,
      sortValue: (r) => r.familie.nume_familie?.toLowerCase(),
    },
    {
      header: 'Reprezentant',
      cell: (r) =>
        [r.familie.nume_reprezentant, r.familie.prenume_reprezentant]
          .filter(Boolean)
          .join(' ') || '—',
      sortValue: (r) =>
        [r.familie.nume_reprezentant, r.familie.prenume_reprezentant]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
    },
    {
      header: 'Telefon',
      cell: (r) => r.familie.telefon ?? '—',
      sortValue: (r) => r.familie.telefon ?? '',
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

  if (familiiQ.isLoading) return <Spinner />
  if (familiiQ.isError) {
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcare: {humanizeError(familiiQ.error)}
      </p>
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-3">
        <Contor
          valoare={cuEsentiale}
          eticheta="familii cu câmpuri esențiale lipsă"
          tone="danger"
        />
        <Contor
          valoare={doarRecomandate}
          eticheta="familii cu doar recomandate lipsă"
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
        rowKey={(r) => r.familie.id}
        onRowClick={(r) => navigate(`/familii/${r.familie.id}`)}
        emptyMessage="Toate familiile active au fișa completă. 🎉"
      />
    </section>
  )
}
