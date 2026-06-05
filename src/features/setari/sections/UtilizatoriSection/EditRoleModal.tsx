import { Button, Field, Modal, Select } from '@/components/ui'
import { ROLE_LABEL, type UserRole, type UserRow } from '../../utilizatoriApi'

type Props = {
  user: UserRow
  roleValue: UserRole
  roleOptions: { value: UserRole; label: string }[]
  isPending: boolean
  error: string | null
  onChange: (role: UserRole) => void
  onConfirm: () => void
  onClose: () => void
}

export function EditRoleModal({
  user,
  roleValue,
  roleOptions,
  isPending,
  error,
  onChange,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open
      title="Schimbă rolul"
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
          {' · '}
          rol actual: <strong className="text-quasar-black">{ROLE_LABEL[user.role]}</strong>
        </p>
        <Field label="Rol nou" htmlFor="edit-role">
          <Select
            id="edit-role"
            options={roleOptions}
            value={roleValue}
            onChange={(e) => onChange(e.target.value as UserRole)}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
