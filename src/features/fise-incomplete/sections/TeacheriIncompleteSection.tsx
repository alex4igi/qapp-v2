import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Spinner, type Column } from '@/components/ui'
import { ChecklistBadge } from '@/components/checklist'
import { humanizeError } from '@/lib/errorMessage'
import { evalueazaChecklist, type Rezultat } from '@/lib/checklist'
import { TEACHER_CHECKLIST } from '@/lib/checklist/specs/teacher'
import { listTeacheriPentruChecklist, type TeacherChecklistRow } from '../api'
import { Chips, Contor } from './ui'

type Rand = { teacher: TeacherChecklistRow; rez: Rezultat }

const numeComplet = (t: TeacherChecklistRow) =>
  `${t.nume} ${t.prenume ?? ''}`.trim()

export function TeacheriIncompleteSection() {
  const navigate = useNavigate()

  const teacheriQ = useQuery({
    queryKey: ['fise-incomplete', 'teacheri'],
    queryFn: listTeacheriPentruChecklist,
  })

  // Cei cu esențiale lipsă întâi; la egalitate, cei cu mai multe recomandate.
  const randuri = useMemo<Rand[]>(() => {
    return (teacheriQ.data ?? [])
      .map((teacher) => ({
        teacher,
        rez: evalueazaChecklist(TEACHER_CHECKLIST, teacher),
      }))
      .filter((r) => !r.rez.completa)
      .sort(
        (a, b) =>
          b.rez.lipsaEsentiale.length - a.rez.lipsaEsentiale.length ||
          b.rez.lipsaRecomandate.length - a.rez.lipsaRecomandate.length ||
          numeComplet(a.teacher).localeCompare(numeComplet(b.teacher), 'ro'),
      )
  }, [teacheriQ.data])

  const total = (teacheriQ.data ?? []).length
  const cuEsentiale = randuri.filter((r) => r.rez.lipsaEsentiale.length > 0).length
  const doarRecomandate = randuri.length - cuEsentiale

  const columns: Column<Rand>[] = [
    {
      header: 'Instructor',
      cell: (r) => <span className="font-medium">{numeComplet(r.teacher)}</span>,
      sortValue: (r) => numeComplet(r.teacher).toLowerCase(),
    },
    {
      header: 'Telefon',
      cell: (r) => r.teacher.telefon ?? '—',
      sortValue: (r) => r.teacher.telefon ?? '',
    },
    {
      header: 'Email',
      cell: (r) => r.teacher.email ?? '—',
      sortValue: (r) => r.teacher.email ?? '',
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

  if (teacheriQ.isLoading) return <Spinner />
  if (teacheriQ.isError) {
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcare: {humanizeError(teacheriQ.error)}
      </p>
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-3">
        <Contor
          valoare={cuEsentiale}
          eticheta="instructori cu câmpuri esențiale lipsă"
          tone="danger"
        />
        <Contor
          valoare={doarRecomandate}
          eticheta="instructori cu doar recomandate lipsă"
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
        rowKey={(r) => r.teacher.id}
        onRowClick={(r) => navigate(`/teacheri/${r.teacher.id}`)}
        emptyMessage="Toți instructorii au fișa completă. 🎉"
      />
    </section>
  )
}
