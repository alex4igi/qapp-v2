import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Field, Modal, Select } from '@/components/ui'
import { teacheriOptions } from '@/lib/lookups'
import { roleLabel } from '@/lib/rolesMatrix'
import { type UserRow } from '../../utilizatoriApi'

type Props = {
  user: UserRow
  isPending: boolean
  error: string | null
  onLink: (teacherId: string) => void
  onUnlink: () => void
  onClose: () => void
}

// Leagă un cont de un profil din `teacheri`. Ortogonal rolului: rolul dă
// permisiunile, legătura spune că omul predă (grupele lui + salariu de instructor).
// Legarea NU schimbă rolul — un manager care predă rămâne manager.
export function EditTeacherLinkModal({
  user,
  isPending,
  error,
  onLink,
  onUnlink,
  onClose,
}: Props) {
  const [teacherId, setTeacherId] = useState(user.teacher_id ?? '')

  const teacheriQ = useQuery({
    queryKey: ['lookup', 'teacheri', user.teacher_id ?? null],
    queryFn: () => teacheriOptions(null, { includeId: user.teacher_id }),
  })

  const linked = Boolean(user.teacher_id)

  return (
    <Modal
      open
      title="Profil de instructor"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          {linked && (
            <Button variant="danger" disabled={isPending} onClick={onUnlink}>
              Dezleagă
            </Button>
          )}
          <Button
            disabled={isPending || !teacherId || teacherId === user.teacher_id}
            onClick={() => onLink(teacherId)}
          >
            {isPending ? 'Se salvează…' : 'Leagă'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-quasar-gray">
          Cont: <strong className="text-quasar-black">{user.email}</strong>
          {' · '}rol:{' '}
          <strong className="text-quasar-black">
            {roleLabel(user.role, user.teacher_id)}
          </strong>
        </p>

        <Field label="Instructor" htmlFor="edit-teacher-link">
          <Select
            id="edit-teacher-link"
            placeholder="— niciunul —"
            options={teacheriQ.data ?? []}
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          />
        </Field>

        <p className="text-xs text-quasar-gray">
          Legătura nu schimbă rolul contului. Un manager sau o recepționeră care
          predau rămân pe rolul lor și primesc în plus „Grupele mele" și
          „Salariul meu".
        </p>
        {linked && (
          <p className="text-xs text-quasar-gray">
            „Dezleagă" scoate doar accesul contului la datele de instructor —
            profilul, istoricul de salarii și grupele rămân neatinse.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
