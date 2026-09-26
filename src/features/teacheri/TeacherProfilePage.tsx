import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, Tabs, Badge } from '@/components/ui'
import { ProfileScaffold } from '@/components/layout/ProfileScaffold'
import { ChecklistBadge, ChecklistCard } from '@/components/checklist'
import { evalueazaChecklist, type StareItem } from '@/lib/checklist'
import {
  TEACHER_CHECKLIST,
  type SectiuneTeacher,
} from '@/lib/checklist/specs/teacher'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher, isManagerOrHigher } from '@/lib/rolesMatrix'
import { getTeacher, toggleTeacherArchived, deleteTeacher } from './api'
import { TeacherForm } from './TeacherForm'
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
  const { role, teacherId: ownTeacherId } = useAuth()
  const [searchParams] = useSearchParams()
  // Pagina de salarizare deschide profilul direct pe „Detalii salarii".
  const [tab, setTab] = useState<'cursuri' | 'salarii' | 'personale' | 'evaluari'>(
    () => (searchParams.get('tab') === 'salarii' ? 'salarii' : 'cursuri'),
  )
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [focusSection, setFocusSection] = useState<SectiuneTeacher | undefined>()

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

  // Salariile: adminului (oricare profil) + oricui pe PROPRIUL profil de instructor.
  // Un manager care predă își vede salariul lui, dar nu pe al colegilor.
  const canSeeSalarii = isAdminOrHigher(role) || teacher.id === ownTeacherId
  const canEditPersonale = isManagerOrHigher(role)
  const canArchive = isManagerOrHigher(role)
  const canDelete = isAdminOrHigher(role)
  // Evaluările profesorului sunt private pentru management (owner/admin/manager).
  const canSeeEvaluari = isManagerOrHigher(role)
  // Checklistul e igienă de HR (contract, dată naștere, cont) — îl vede doar
  // managementul, nu orice coleg care deschide fișa.
  const canSeeChecklist = isManagerOrHigher(role)

  // Derivat din rândul teacherului — fără query suplimentar.
  const checklist = evalueazaChecklist(TEACHER_CHECKLIST, teacher)

  // Contul de aplicație nu se leagă din formular, ci din tab-ul „Detalii
  // personale" — deci itemul lui deschide tab-ul, nu modalul.
  const onFixChecklist = (item: StareItem) => {
    if (item.sectiune === 'cont') {
      setTab('personale')
      return
    }
    setFocusSection(item.sectiune as SectiuneTeacher | undefined)
    setEditOpen(true)
  }

  const tabs = [
    { id: 'cursuri', label: 'Detalii cursuri' },
    ...(canSeeSalarii ? [{ id: 'salarii', label: 'Detalii salarii' }] : []),
    { id: 'personale', label: 'Detalii personale' },
    ...(canSeeEvaluari ? [{ id: 'evaluari', label: 'Evaluări' }] : []),
  ]

  return (
    <>
      <ProfileScaffold
        section="Teacheri"
        backTo="/teacheri"
        title={fullName}
        actions={
          <>
            {canSeeChecklist && <ChecklistBadge rezultat={checklist} />}
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
        sidebar={
          <div className="space-y-4">
            <aside className="rounded-2xl border border-line bg-card p-5 text-center shadow-sm">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-quasar-yellow font-display text-3xl font-bold text-ink">
                {initials(teacher.nume, teacher.prenume)}
              </div>
              <p className="mt-4 font-display text-lg font-bold tracking-tight text-ink">
                {fullName}
              </p>
              {teacher.nivelul && (
                <div className="mt-2 flex justify-center">
                  <Badge tone="warn">{teacher.nivelul}</Badge>
                </div>
              )}
              {teacher.email && (
                <p className="mt-3 break-all text-xs text-muted">
                  {teacher.email}
                </p>
              )}
            </aside>

            {canSeeChecklist && (
              <ChecklistCard
                rezultat={checklist}
                onFix={canEditPersonale ? onFixChecklist : undefined}
              />
            )}
          </div>
        }
      >
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
      </ProfileScaffold>

      {editOpen && (
        <TeacherForm
          open
          teacher={teacher}
          focusSection={focusSection}
          onClose={() => {
            setEditOpen(false)
            setFocusSection(undefined)
          }}
        />
      )}

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
          onConfirm={async (force) => {
            await deleteTeacher(teacher.id, force)
            await queryClient.invalidateQueries({ queryKey: ['teacheri'] })
            navigate('/teacheri')
          }}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </>
  )
}
