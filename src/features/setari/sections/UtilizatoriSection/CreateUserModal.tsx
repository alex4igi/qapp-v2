import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Button,
  Field,
  Modal,
  Select,
  TextInput,
  type SelectOption,
} from '@/components/ui'
import { teacheriOptions } from '@/lib/lookups'
import { createUser, type UserRole } from '../../utilizatoriApi'

type Props = {
  open: boolean
  roleOptions: { value: UserRole; label: string }[]
  locatii: SelectOption[]
  onClose: () => void
  onSuccess: () => void
}

export function CreateUserModal({ open, roleOptions, locatii, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('front_desk')
  const [teacherId, setTeacherId] = useState('')
  const [locatieId, setLocatieId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const teacheriQ = useQuery({
    queryKey: ['lookup', 'teacheri'],
    queryFn: teacheriOptions,
    enabled: role === 'teacher',
  })

  const create = useMutation({
    mutationFn: () =>
      createUser({
        email: email.trim(),
        password,
        role,
        teacherId: role === 'teacher' ? teacherId || null : null,
        locatieId: locatieId || null,
      }),
    onSuccess: () => {
      setEmail('')
      setPassword('')
      setRole('front_desk')
      setTeacherId('')
      setLocatieId('')
      onSuccess()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la creare.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim()) return setError('Email obligatoriu.')
    if (password.length < 8) return setError('Parola: minim 8 caractere.')
    if (role === 'front_desk' && !locatieId) {
      return setError('Pentru rolul Front Desk locația e obligatorie.')
    }
    create.mutate()
  }

  return (
    <Modal
      open={open}
      title="Utilizator nou"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="user-form" disabled={create.isPending}>
            {create.isPending ? 'Se creează…' : 'Creează cont'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Email" required htmlFor="u-email">
          <TextInput
            id="u-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Parolă (min. 8 caractere)" required htmlFor="u-pwd">
          <TextInput
            id="u-pwd"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Rol" required htmlFor="u-role">
          <Select
            id="u-role"
            options={roleOptions}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          />
        </Field>
        {role === 'teacher' && (
          <Field label="Leagă de profesor (opțional)" htmlFor="u-teacher">
            <Select
              id="u-teacher"
              placeholder="— niciunul —"
              options={teacheriQ.data ?? []}
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            />
          </Field>
        )}
        <Field
          label={
            role === 'front_desk'
              ? 'Locație (obligatoriu — userul nu o poate schimba)'
              : role === 'teacher'
                ? 'Locație principală (opțional — gol = predă la mai multe locații)'
                : 'Locație implicită (opțional)'
          }
          required={role === 'front_desk'}
          htmlFor="u-locatie"
        >
          <Select
            id="u-locatie"
            placeholder={
              role === 'front_desk'
                ? '— alege locația —'
                : role === 'teacher'
                  ? '— predă la mai multe locații —'
                  : '— niciuna —'
            }
            options={locatii}
            value={locatieId}
            onChange={(e) => setLocatieId(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
