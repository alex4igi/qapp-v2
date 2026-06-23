import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Button, Spinner, Tabs } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher, isManagerOrHigher } from '@/lib/rolesMatrix'
import { getTeacher, toggleTeacherArchived, deleteTeacher } from './api'
import { TeacherTabCursuri } from './TeacherTabCursuri'
import { TeacherTabSalarii } from './TeacherTabSalarii'
import { TeacherTabPersonale } from './TeacherTabPersonale'
import { TeacherTabEvaluari } from './TeacherTabEvaluari'
import { ArchiveConfirmModal } from '@/features/shared/ArchiveConfirmModal'
import { DeleteConfirmModal } from '@/features/shared/DeleteConfirmModal'

function initials(nume: string, prenume: string | null) {
  const n = nume?.[0] ?? ''
  const p = prenume?.[0] ?? ''
  return (n + p).toUpperCase() || '?'
}

export function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const [tab, setTab] = useState<'cursuri' | 'salarii' | 'personale' | 'evaluari'>(
    'cursuri',
  )
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const teacherQuery = useQuery({
    queryKey: ['teacher', id],
    queryFn: () => getTeacher(id!),
    enabled: Boolean(id),
  })

  if (teacherQuery.isLoading) return <Spinner />
  if (teacherQuery.isError || !teacherQuery.data) {
    return (
      <div>
        <p className="text-sm text-red-600">Teacher-ul nu a fost găsit.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => navigate('/teacheri')}
        >
          ← Înapoi la teacheri
        </Button>
      </div>
    )
  }

  const teacher = teacherQuery.data
  const fullName = `${teacher.nume} ${teacher.prenume ?? ''}`.trim()

  // Salariile: vizibile doar adminului și (în viitor) teacher-ului logat pe profilul lui.
  // Manager + Front desk → tab Salarii ascuns.
  const canSeeSalarii = isAdminOrHigher(role) || role === 'teacher'
  const canEditPersonale = isManagerOrHigher(role)
  const canArchive = isManagerOrHigher(role)
  const canDelete = isAdminOrHigher(role)
  // Evaluările profesorului sunt private pentru management (owner/admin/manager).
  const canSeeEvaluari = isManagerOrHigher(role)

  const tabs = [
    { id: 'cursuri', label: 'Detalii cursuri' },
    ...(canSeeSalarii ? [{ id: 'salarii', label: 'Detalii salarii' }] : []),
    { id: 'personale', label: 'Detalii personale' },
    ...(canSeeEvaluari ? [{ id: 'evaluari', label: 'Evaluări' }] : []),
  ]

  return (
    <div>
      <PageHeader
        title={fullName}
        subtitle={teacher.nivelul ?? undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/teacheri')}>
              ← Înapoi
            </Button>
            {canArchive && (
              <Button
                variant={teacher.arhivat ? 'secondary' : 'ghost'}
                onClick={() => setArchiveOpen(true)}
                title={teacher.arhivat ? 'Dezarhivează instructorul' : 'Arhivează instructorul'}
              >
                {teacher.arhivat ? '↩ Dezarhivează' : '📦 Arhivează'}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                title="Șterge definitiv instructorul"
              >
                🗑 Șterge
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Avatar lateral */}
        <aside className="md:w-56">
          <div className="flex flex-col items-center rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-quasar-yellow text-4xl font-bold text-quasar-black">
              {initials(teacher.nume, teacher.prenume)}
            </div>
            <p className="mt-4 font-display text-lg font-bold text-quasar-black">
              {fullName}
            </p>
            {teacher.nivelul && (
              <span className="mt-1.5 rounded-full bg-quasar-yellow/40 px-2 py-0.5 text-xs font-medium text-quasar-black">
                {teacher.nivelul}
              </span>
            )}
            {teacher.email && (
              <p className="mt-3 break-all text-xs text-quasar-gray">
                {teacher.email}
              </p>
            )}
          </div>
        </aside>

        {/* Tabs */}
        <div className="flex-1 min-w-0">
          <Tabs tabs={tabs} active={tab} onChange={(t) => setTab(t as typeof tab)} />

          {tab === 'cursuri' && <TeacherTabCursuri teacherId={teacher.id} />}
          {tab === 'salarii' && canSeeSalarii && (
            <TeacherTabSalarii teacherId={teacher.id} />
          )}
          {tab === 'personale' && (
            <TeacherTabPersonale teacher={teacher} canEdit={canEditPersonale} />
          )}
          {tab === 'evaluari' && canSeeEvaluari && (
            <TeacherTabEvaluari teacherId={teacher.id} />
          )}
        </div>
      </div>

      {archiveOpen && (
        <ArchiveConfirmModal
          open
          title={teacher.arhivat ? 'Dezarhivează instructor' : 'Arhivează instructor'}
          entityLabel={fullName}
          archive={!teacher.arhivat}
          onConfirm={async (motiv) => {
            await toggleTeacherArchived({
              teacherId: teacher.id,
              archive: !teacher.arhivat,
              motiv,
            })
            await queryClient.invalidateQueries({ queryKey: ['teacher', teacher.id] })
            await queryClient.invalidateQueries({ queryKey: ['teacheri'] })
          }}
          onClose={() => setArchiveOpen(false)}
        />
      )}

      {deleteOpen && (
        <DeleteConfirmModal
          open
          title="Șterge definitiv instructor"
          entityLabel={fullName}
          noun="instructorul"
          onConfirm={async () => {
            await deleteTeacher(teacher.id)
            await queryClient.invalidateQueries({ queryKey: ['teacheri'] })
            navigate('/teacheri')
          }}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  )
}
