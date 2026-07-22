import { Button, Field, Modal, Select, type SelectOption } from '@/components/ui'
import { roleLabel } from '@/lib/rolesMatrix'
import { type UserRow } from '../../utilizatoriApi'

type Props = {
  user: UserRow
  locatieValue: string
  locatii: SelectOption[]
  isPending: boolean
  mutationError: string | null
  validationError: string | null
  onChange: (locatieId: string) => void
  onConfirm: () => void
  onClose: () => void
}

// Setează locația implicită a unui utilizator.
//   - Front Desk: opțional (gol = lucrează la mai multe locații, basculează liber);
//     cu locație = fix pe ea, nu o poate schimba din bara de sus
//   - Teacher: opțional (gol = predă la mai multe locații, alege liber)
//   - Admin/Manager: opțional, default pt sesiune (poate schimba liber)
export function EditLocatieModal({
  user,
  locatieValue,
  locatii,
  isPending,
  mutationError,
  validationError,
  onChange,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open
      title="Locație implicită"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button disabled={isPending} onClick={onConfirm}>
            {isPending ? 'Se salvează…' : 'Salvează'}
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
        <Field label="Locație implicită" htmlFor="edit-locatie">
          <Select
            id="edit-locatie"
            placeholder={
              user.role === 'front_desk'
                ? '— lucrează la mai multe locații —'
                : user.role === 'teacher'
                  ? '— predă la mai multe locații —'
                  : '— niciuna (alege liber din bara de sus) —'
            }
            options={locatii}
            value={locatieValue}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
        {user.role === 'front_desk' && (
          <p className="text-xs text-quasar-gray">
            Dacă lucrează la o singură locație, alege-o aici — va fi fix pe ea și
            nu o poate schimba. Dacă lucrează la mai multe, lasă gol — va putea
            bascula liber între ele din bara de sus.
          </p>
        )}
        {user.role === 'teacher' && (
          <p className="text-xs text-quasar-gray">
            Pentru instructor: dacă predă la o singură locație, alege-o aici.
            Dacă predă la mai multe, lasă gol — va putea bascula liber între
            ele din bara de sus.
          </p>
        )}
        {validationError && <p className="text-sm text-red-600">{validationError}</p>}
        {mutationError && <p className="text-sm text-red-600">{mutationError}</p>}
      </div>
    </Modal>
  )
}
