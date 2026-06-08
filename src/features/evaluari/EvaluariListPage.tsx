import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  Select,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { teacheriOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { useAuth } from '@/hooks/useAuth'
import type { Evaluare } from '@/types/db'
import { EvaluareForm } from './EvaluareForm'
import {
  listEvaluari,
  cursuriByTeacher,
  getCurrentTeacherId,
  PAGE_SIZE,
  type EvaluareWithRefs,
} from './api'
import { skills } from './skills'

function avgScore(e: EvaluareWithRefs): string {
  const vals = skills
    .map((s) => e[s.key] as number | null)
    .filter((v): v is number => v != null)
  if (vals.length === 0) return '—'
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return `${avg.toFixed(1)} / 5`
}

export function EvaluariListPage() {
  const { role } = useAuth()
  const isTeacher = role === 'teacher'

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [cursId, setCursId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Evaluare | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Pentru teacher: filtrăm automat pe teacher_id-ul lui.
  const teacherIdQ = useQuery({
    queryKey: ['evaluari', 'current-teacher-id'],
    queryFn: getCurrentTeacherId,
    enabled: isTeacher,
  })

  const effectiveTeacherId = isTeacher
    ? (teacherIdQ.data ?? '')
    : teacherId

  const teacheriQ = useQuery({
    queryKey: ['lookup', 'teacheri'],
    queryFn: teacheriOptions,
    enabled: !isTeacher,
  })

  const cursuriAllQ = useCursuriOptions({ enabled: !isTeacher && !teacherId })

  const cursuriForTeacherQ = useQuery({
    queryKey: ['lookup', 'cursuri-by-teacher', effectiveTeacherId],
    queryFn: () => cursuriByTeacher(effectiveTeacherId),
    enabled: Boolean(effectiveTeacherId),
  })

  const cursuriOpts = effectiveTeacherId
    ? (cursuriForTeacherQ.data ?? [])
    : (cursuriAllQ.data ?? [])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['evaluari', { search, cursId, teacherId: effectiveTeacherId, page }],
    queryFn: () =>
      listEvaluari({
        search,
        cursId,
        teacherId: effectiveTeacherId,
        page,
      }),
    placeholderData: keepPreviousData,
    enabled: !isTeacher || Boolean(teacherIdQ.data),
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  const columns: Column<EvaluareWithRefs>[] = [
    {
      header: 'Cursant',
      cell: (e) => (
        <span className="font-medium">
          {[e.client_row?.nume, e.client_row?.prenume]
            .filter(Boolean)
            .join(' ') || '—'}
        </span>
      ),
    },
    { header: 'Curs', cell: (e) => e.curs_row?.numele ?? '—' },
    {
      header: 'Profesor',
      cell: (e) =>
        [e.teacher_row?.nume, e.teacher_row?.prenume]
          .filter(Boolean)
          .join(' ') || '—',
      className: 'w-40',
    },
    {
      header: 'Data',
      cell: (e) => e.data_evaluarii,
      className: 'w-28',
    },
    {
      header: 'Scor mediu',
      cell: (e) => (
        <span className="font-medium text-quasar-black">{avgScore(e)}</span>
      ),
      className: 'w-28',
    },
  ]

  // Pentru teacher fără auth_user_id link → mesaj de eroare.
  if (isTeacher && teacherIdQ.isSuccess && !teacherIdQ.data) {
    return (
      <div>
        <PageHeader title="Evaluări" />
        <p className="text-sm text-red-600">
          Contul tău nu este legat de un profesor în baza de date. Contactează
          administratorul.
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Evaluări"
        subtitle={data ? `${data.total} evaluări` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Evaluare nouă</Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-64">
          <TextInput
            placeholder="Caută cursant…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        {!isTeacher && (
          <div className="w-52">
            <Select
              placeholder="Toți profesorii"
              options={teacheriQ.data ?? []}
              value={teacherId}
              onChange={(e) => {
                setTeacherId(e.target.value)
                setCursId('')
                setPage(0)
              }}
            />
          </div>
        )}
        <div className="w-52">
          <Select
            placeholder="Toate cursurile"
            options={cursuriOpts}
            value={cursId}
            onChange={(e) => {
              setCursId(e.target.value)
              setPage(0)
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {error instanceof Error ? error.message : ''}
        </p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.rows ?? []}
            rowKey={(e) => e.id}
            onRowClick={(e) => setEditing(e)}
            emptyMessage="Nicio evaluare."
          />

          <div className="mt-4 flex items-center justify-between text-sm text-quasar-gray">
            <span>
              Pagina {page + 1} din {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Următor →
              </Button>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <EvaluareForm open onClose={() => setFormOpen(false)} />
      )}
      {editing && (
        <EvaluareForm
          open
          evaluare={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
