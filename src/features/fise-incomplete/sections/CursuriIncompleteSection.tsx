import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Spinner, type Column, type SelectOption } from '@/components/ui'
import { ChecklistBadge } from '@/components/checklist'
import { humanizeError } from '@/lib/errorMessage'
import { evalueazaChecklist, type Rezultat } from '@/lib/checklist'
import { CURS_CHECKLIST } from '@/lib/checklist/specs/curs'
import { locatiiOptions, teacheriOptions } from '@/lib/lookups'
import { listCursuriPentruChecklist, type CursChecklistRow } from '../api'

type Props = {
  sezonId: string | null
  locatieId: string | null
}

type Rand = { curs: CursChecklistRow; rez: Rezultat }

const labelOf = (opts: SelectOption[] | undefined, id: string | null) =>
  (id && opts?.find((o) => o.value === id)?.label) || '—'

function Contor({
  valoare,
  eticheta,
  tone,
}: {
  valoare: number
  eticheta: string
  tone: 'danger' | 'warn' | 'success'
}) {
  const culoare =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warn'
        ? 'text-warn'
        : 'text-success'
  return (
    <div className="flex-1 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <p className={`font-display text-2xl font-bold ${culoare}`}>{valoare}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-2">{eticheta}</p>
    </div>
  )
}

function Chips({ rez }: { rez: Rezultat }) {
  const lipsa = [...rez.lipsaEsentiale, ...rez.lipsaRecomandate]
  return (
    <div className="flex flex-wrap gap-1">
      {lipsa.map((s) => (
        <span
          key={s.id}
          title={s.motiv}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            s.severitate === 'esential'
              ? 'bg-danger-bg text-danger'
              : 'bg-warn-bg text-warn'
          }`}
        >
          {s.eticheta}
        </span>
      ))}
    </div>
  )
}

export function CursuriIncompleteSection({ sezonId, locatieId }: Props) {
  const navigate = useNavigate()

  const cursuriQ = useQuery({
    queryKey: ['fise-incomplete', 'cursuri', sezonId],
    queryFn: () => listCursuriPentruChecklist({ sezonId }),
  })
  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri'],
    queryFn: () => teacheriOptions(),
  })
  const locatii = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  // Locația se filtrează AICI, nu în query: cursurile fără locație rămân
  // vizibile în orice locație de lucru — lipsa locației e ea însăși un defect
  // pe care pagina trebuie să-l arate, nu un motiv să ascundă rândul.
  const inLocatie = (c: CursChecklistRow) =>
    !locatieId || c.locatie == null || c.locatie === locatieId

  // Cele cu esențiale lipsă întâi; la egalitate, cele cu mai multe recomandate.
  const randuri = useMemo<Rand[]>(() => {
    return (cursuriQ.data ?? [])
      .filter(inLocatie)
      .map((curs) => ({ curs, rez: evalueazaChecklist(CURS_CHECKLIST, curs) }))
      .filter((r) => !r.rez.completa)
      .sort(
        (a, b) =>
          b.rez.lipsaEsentiale.length - a.rez.lipsaEsentiale.length ||
          b.rez.lipsaRecomandate.length - a.rez.lipsaRecomandate.length ||
          a.curs.numele.localeCompare(b.curs.numele, 'ro'),
      )
  }, [cursuriQ.data, locatieId])

  const total = (cursuriQ.data ?? []).filter(inLocatie).length
  const cuEsentiale = randuri.filter((r) => r.rez.lipsaEsentiale.length > 0).length
  const doarRecomandate = randuri.length - cuEsentiale

  const columns: Column<Rand>[] = [
    {
      header: 'Curs',
      cell: (r) => <span className="font-medium">{r.curs.numele}</span>,
      sortValue: (r) => r.curs.numele?.toLowerCase(),
    },
    {
      header: 'Locație',
      cell: (r) => labelOf(locatii.data, r.curs.locatie),
      sortValue: (r) => labelOf(locatii.data, r.curs.locatie),
    },
    {
      header: 'Teacher',
      cell: (r) => labelOf(teacheri.data, r.curs.teacher),
      sortValue: (r) => labelOf(teacheri.data, r.curs.teacher),
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

  if (cursuriQ.isLoading) return <Spinner />
  if (cursuriQ.isError) {
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcare: {humanizeError(cursuriQ.error)}
      </p>
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap gap-3">
        <Contor
          valoare={cuEsentiale}
          eticheta="grupe cu câmpuri esențiale lipsă"
          tone="danger"
        />
        <Contor
          valoare={doarRecomandate}
          eticheta="grupe cu doar recomandate lipsă"
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
        rowKey={(r) => r.curs.id}
        onRowClick={(r) => navigate(`/cursuri/${r.curs.id}`)}
        emptyMessage="Toate grupele au fișa completă. 🎉"
      />
    </section>
  )
}
