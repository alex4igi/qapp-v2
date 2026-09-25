import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextInput, Select, Button } from '@/components/ui'
import { locatiiOptions } from '@/lib/lookups'
import type { TeacherComplet as Teacher } from './api'
import { createTeacherAccount } from './api'

type Props = {
  open: boolean
  teacher: Teacher
  onClose: () => void
}

function generatePassword(): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZ' +
    'abcdefghjkmnpqrstuvwxyz' +
    '23456789' +
    '!#$%&*+-?'
  const bytes = new Uint32Array(14)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function TeacherAccountDialog({ open, teacher, onClose }: Props) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState(teacher.email ?? '')
  const [password, setPassword] = useState(() => generatePassword())
  const [locatieId, setLocatieId] = useState('')
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const credentials = useMemo(
    () => (created ? `${created.email}\n${created.password}` : ''),
    [created],
  )

  const submit = useMutation({
    mutationFn: () =>
      createTeacherAccount({
        teacherId: teacher.id,
        email: email.trim(),
        password,
        locatieId: locatieId || null,
      }),
    onSuccess: (res) => {
      setCreated({ email: res.user.email, password })
      void queryClient.invalidateQueries({ queryKey: ['teacher', teacher.id] })
      void queryClient.invalidateQueries({ queryKey: ['utilizatori'] })
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la creare cont.')),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !email.includes('@')) {
      setError('Introdu un email valid.')
      return
    }
    if (password.length < 8) {
      setError('Parola trebuie să aibă cel puțin 8 caractere.')
      return
    }
    submit.mutate()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credentials)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <Modal
      open={open}
      title="Creează cont login pentru instructor"
      onClose={onClose}
      footer={
        created ? (
          <Button onClick={onClose}>Închide</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Anulează
            </Button>
            <Button
              type="submit"
              form="teacher-account-form"
              disabled={submit.isPending}
            >
              {submit.isPending ? 'Se creează…' : 'Creează cont'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-3">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ⚠️ Salvează aceste credențiale acum — parola NU mai poate fi
            recuperată. Trimite-le instructorului prin canalul potrivit.
          </p>
          <Field label="Email">
            <TextInput value={created.email} readOnly />
          </Field>
          <Field label="Parolă">
            <TextInput value={created.password} readOnly />
          </Field>
          <Button variant="secondary" type="button" onClick={() => void copy()}>
            {copied ? 'Copiat ✓' : 'Copiază email + parolă'}
          </Button>
        </div>
      ) : (
        <form
          id="teacher-account-form"
          onSubmit={onSubmit}
          className="space-y-3"
        >
          <p className="text-sm text-quasar-gray">
            Se va crea un cont cu rolul „teacher" și se va lega de acest
            instructor. Parola este generată automat (poți regenera).
          </p>
          <Field label="Email" required>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: bianca@quasardance.ro"
            />
          </Field>
          <Field label="Parolă generată" required>
            <div className="flex gap-2">
              <TextInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPassword(generatePassword())}
              >
                Regenerează
              </Button>
            </div>
          </Field>
          <Field
            label="Locație principală (opțional)"
            htmlFor="teacher-account-locatie"
          >
            <Select
              id="teacher-account-locatie"
              placeholder="— predă la mai multe locații —"
              options={locatiiQ.data ?? []}
              value={locatieId}
              onChange={(e) => setLocatieId(e.target.value)}
            />
          </Field>
          <p className="text-xs text-quasar-gray">
            Dacă instructorul predă <strong>la o singură locație</strong>,
            alege-o aici — UI-ul îi va fi fixat acolo. Dacă predă{' '}
            <strong>la mai multe locații</strong>, lasă gol — va putea bascula
            între ele din bara de sus.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
