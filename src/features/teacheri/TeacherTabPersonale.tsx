import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal, Field, TextInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/format'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import {
  listUsers,
  resetUserPassword,
  deleteUser,
} from '@/features/setari/utilizatoriApi'
import type { Teacher } from '@/types/db'
import { TeacherForm } from './TeacherForm'
import { TeacherAccountDialog } from './TeacherAccountDialog'
import { LinkTeacherAccountDialog } from './LinkTeacherAccountDialog'

type Props = {
  teacher: Teacher
  canEdit: boolean
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-quasar-gray">{label}</dt>
      <dd className="text-sm text-quasar-black">{value || '—'}</dd>
    </div>
  )
}

const formatLastLogin = (d: string | null) =>
  d ? formatDateTime(d) : 'niciodată'

export function TeacherTabPersonale({ teacher, canEdit }: Props) {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = isAdminOrHigher(role)
  const [editOpen, setEditOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [resetPwdOpen, setResetPwdOpen] = useState(false)
  const [resetPwdValue, setResetPwdValue] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Fetch users doar când avem un auth_user_id de căutat, și doar pentru admin
  const usersQ = useQuery({
    queryKey: ['utilizatori'],
    queryFn: listUsers,
    enabled: isAdmin && Boolean(teacher.auth_user_id),
  })

  const userRow = useMemo(
    () =>
      usersQ.data?.find((u) => u.id === teacher.auth_user_id) ?? null,
    [usersQ.data, teacher.auth_user_id],
  )

  const resetPwd = useMutation({
    mutationFn: () =>
      resetUserPassword(teacher.auth_user_id!, resetPwdValue),
    onSuccess: () => {
      setResetPwdOpen(false)
      setResetPwdValue('')
      setActionError(null)
      void queryClient.invalidateQueries({ queryKey: ['utilizatori'] })
    },
    onError: (e: unknown) =>
      setActionError(
        humanizeError(e, 'Eroare la resetarea parolei.'),
      ),
  })

  const removeAccount = useMutation({
    mutationFn: () => deleteUser(teacher.auth_user_id!),
    onSuccess: () => {
      setDeleteOpen(false)
      setActionError(null)
      void queryClient.invalidateQueries({ queryKey: ['utilizatori'] })
      void queryClient.invalidateQueries({ queryKey: ['teacher', teacher.id] })
    },
    onError: (e: unknown) =>
      setActionError(
        humanizeError(e, 'Eroare la ștergerea contului.'),
      ),
  })

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-quasar-black">Bio</h3>
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Editează
            </Button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Row label="Nume" value={teacher.nume} />
          <Row label="Prenume" value={teacher.prenume ?? ''} />
          <Row label="Data nașterii" value={teacher.data_nasterii ?? ''} />
          <Row label="Mărime tricou" value={teacher.marime_tricou ?? ''} />
          <Row label="Nivelul" value={teacher.nivelul ?? ''} />
        </dl>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-quasar-black">Contact</h3>
        <dl className="grid grid-cols-2 gap-4">
          <Row label="Email" value={teacher.email ?? ''} />
          <Row label="Telefon" value={teacher.telefon ?? ''} />
        </dl>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-quasar-black">Altele</h3>
        <dl className="space-y-3">
          <Row label="Link contract" value={teacher.link_contract ?? ''} />
          {teacher.observatii && (
            <div>
              <dt className="text-xs font-medium text-quasar-gray">
                Observații
              </dt>
              <dd className="text-sm whitespace-pre-wrap text-quasar-black">
                {teacher.observatii}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {isAdmin && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-quasar-black">
              Cont aplicație
            </h3>
            {!teacher.auth_user_id && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setLinkOpen(true)}>
                  Leagă cont existent
                </Button>
                <Button variant="secondary" onClick={() => setAccountOpen(true)}>
                  Creează cont login
                </Button>
              </div>
            )}
          </div>

          {!teacher.auth_user_id ? (
            <p className="text-sm text-quasar-gray">
              Nu există încă un cont de autentificare. <strong>Creează-l</strong>{' '}
              dacă instructorul n-are cont, sau <strong>leagă</strong> un cont
              deja existent — ca să poată folosi evaluările, salariul propriu și
              situația grupelor.
            </p>
          ) : usersQ.isLoading ? (
            <p className="text-sm text-quasar-gray">Se încarcă datele contului…</p>
          ) : !userRow ? (
            <p className="text-sm text-quasar-gray">
              ✓ Cont activ. Detaliile contului nu sunt vizibile (probabil n-ai
              permisiunea să le accesezi de aici).
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4">
                <Row label="Email" value={userRow.email ?? ''} />
                <Row
                  label="Ultima logare"
                  value={formatLastLogin(userRow.last_sign_in_at)}
                />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setResetPwdValue('')
                    setActionError(null)
                    setResetPwdOpen(true)
                  }}
                >
                  Resetează parolă
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setActionError(null)
                    setDeleteOpen(true)
                  }}
                >
                  Șterge cont
                </Button>
              </div>
              <p className="mt-3 text-xs text-quasar-gray">
                Gestiune extinsă (schimbare rol, locație implicită):{' '}
                <a
                  href="/setari"
                  className="text-blue-600 underline"
                >
                  Setări → Utilizatori
                </a>
                .
              </p>
            </>
          )}
        </section>
      )}

      {editOpen && (
        <TeacherForm
          open
          teacher={teacher}
          onClose={() => setEditOpen(false)}
        />
      )}
      {accountOpen && (
        <TeacherAccountDialog
          open
          teacher={teacher}
          onClose={() => setAccountOpen(false)}
        />
      )}
      {linkOpen && (
        <LinkTeacherAccountDialog
          open
          teacher={teacher}
          onClose={() => setLinkOpen(false)}
        />
      )}

      {resetPwdOpen && userRow && (
        <Modal
          open
          title="Resetează parola"
          onClose={() => setResetPwdOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setResetPwdOpen(false)}>
                Anulează
              </Button>
              <Button
                disabled={resetPwd.isPending}
                onClick={() => {
                  if (resetPwdValue.length < 8) {
                    setActionError('Parola: minim 8 caractere.')
                    return
                  }
                  resetPwd.mutate()
                }}
              >
                {resetPwd.isPending ? 'Se salvează…' : 'Salvează parola'}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-quasar-gray">
              Cont:{' '}
              <strong className="text-quasar-black">{userRow.email}</strong>
            </p>
            <Field label="Parolă nouă (min. 8 caractere)" htmlFor="reset-pwd">
              <TextInput
                id="reset-pwd"
                type="password"
                autoComplete="new-password"
                value={resetPwdValue}
                onChange={(e) => setResetPwdValue(e.target.value)}
              />
            </Field>
            <p className="text-xs text-quasar-gray">
              Instructorul va folosi această parolă la următorul login.
              Comunic-o în siguranță.
            </p>
            {actionError && (
              <p className="text-sm text-red-600">{actionError}</p>
            )}
          </div>
        </Modal>
      )}

      {deleteOpen && userRow && (
        <Modal
          open
          title="Ștergi contul?"
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
                Anulează
              </Button>
              <Button
                variant="danger"
                disabled={removeAccount.isPending}
                onClick={() => removeAccount.mutate()}
              >
                {removeAccount.isPending ? 'Se șterge…' : 'Șterge cont'}
              </Button>
            </>
          }
        >
          <div className="space-y-2">
            <p className="text-sm">
              Ștergi contul <strong>{userRow.email}</strong>. Instructorul nu se
              va mai putea autentifica. Acțiunea nu poate fi anulată.
            </p>
            <p className="text-xs text-quasar-gray">
              Rândul „teacher" (datele, salariile, cursurile asociate) NU se
              șterge — doar contul de login.
            </p>
            {actionError && (
              <p className="text-sm text-red-600">{actionError}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
