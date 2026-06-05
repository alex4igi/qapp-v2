import { Button, Field, Modal, TextInput } from '@/components/ui'
import type { UserRow } from '../../utilizatoriApi'

type Props = {
  user: UserRow
  pwdValue: string
  isPending: boolean
  error: string | null
  onChange: (pwd: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function ResetPasswordModal({
  user,
  pwdValue,
  isPending,
  error,
  onChange,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open
      title="Resetează parola"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button disabled={isPending} onClick={onConfirm}>
            {isPending ? 'Se salvează…' : 'Salvează parola'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-quasar-gray">
          Cont: <strong className="text-quasar-black">{user.email}</strong>
        </p>
        <Field label="Parolă nouă (min. 8 caractere)" htmlFor="reset-pwd">
          <TextInput
            id="reset-pwd"
            type="password"
            autoComplete="new-password"
            value={pwdValue}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
        <p className="text-xs text-quasar-gray">
          Userul va folosi această parolă la următorul login. Comunic-o
          în siguranță.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
