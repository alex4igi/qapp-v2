import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { locatiiOptions } from '@/lib/lookups'
import { useAuth } from '@/hooks/useAuth'
import { canManageRole } from '@/lib/rolesMatrix'
import {
  listUsers,
  deleteUser,
  setUserLocatie,
  updateUserRole,
  resetUserPassword,
  ROLE_LABEL,
  type UserRow,
  type UserRole,
} from '../../utilizatoriApi'
import { ALL_ROLE_OPTIONS, formatDate } from './helpers'
import { CreateUserModal } from './CreateUserModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { EditRoleModal } from './EditRoleModal'
import { ResetPasswordModal } from './ResetPasswordModal'
import { EditLocatieModal } from './EditLocatieModal'

export function UtilizatoriSection() {
  const queryClient = useQueryClient()
  const { role: callerRole } = useAuth()
  const [formOpen, setFormOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null)
  const [editLocatie, setEditLocatie] = useState<UserRow | null>(null)
  const [editLocatieValue, setEditLocatieValue] = useState<string>('')
  const [editRole, setEditRole] = useState<UserRow | null>(null)
  const [editRoleValue, setEditRoleValue] = useState<UserRole>('front_desk')
  const [resetPwd, setResetPwd] = useState<UserRow | null>(null)
  const [resetPwdValue, setResetPwdValue] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [locatieValidationError, setLocatieValidationError] = useState<string | null>(null)

  // Opțiunile de rol filtrate la ce poate manage caller-ul curent.
  const roleOptions = useMemo(
    () => ALL_ROLE_OPTIONS.filter((o) => canManageRole(callerRole, o.value)),
    [callerRole],
  )

  const usersQ = useQuery({ queryKey: ['utilizatori'], queryFn: listUsers })
  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })
  const locatieLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of locatiiQ.data ?? []) map.set(o.value, o.label)
    return map
  }, [locatiiQ.data])

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['utilizatori'] })

  const updateLocatie = useMutation({
    mutationFn: (input: { userId: string; locatieId: string | null }) =>
      setUserLocatie(input.userId, input.locatieId),
    onSuccess: () => {
      setEditLocatie(null)
      setLocatieValidationError(null)
      void invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      setConfirmDelete(null)
      setActionError(null)
      void invalidate()
    },
    onError: (e: unknown) =>
      setActionError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  const updateRole = useMutation({
    mutationFn: (input: { userId: string; role: UserRole }) =>
      updateUserRole(input.userId, input.role),
    onSuccess: () => {
      setEditRole(null)
      setActionError(null)
      void invalidate()
    },
    onError: (e: unknown) =>
      setActionError(
        e instanceof Error ? e.message : 'Eroare la schimbarea rolului.',
      ),
  })

  const resetPassword = useMutation({
    mutationFn: (input: { userId: string; password: string }) =>
      resetUserPassword(input.userId, input.password),
    onSuccess: () => {
      setResetPwd(null)
      setResetPwdValue('')
      setActionError(null)
      void invalidate()
    },
    onError: (e: unknown) =>
      setActionError(
        e instanceof Error ? e.message : 'Eroare la resetarea parolei.',
      ),
  })

  const columns: Column<UserRow>[] = [
    {
      header: 'Email',
      cell: (u) => <span className="font-medium">{u.email ?? '—'}</span>,
      sortValue: (u) => u.email?.toLowerCase(),
    },
    {
      header: 'Rol',
      cell: (u) => ROLE_LABEL[u.role] ?? u.role,
      className: 'w-32',
      sortValue: (u) => (ROLE_LABEL[u.role] ?? u.role)?.toLowerCase(),
    },
    {
      header: 'Locație',
      cell: (u) => {
        const label = u.locatie_id ? locatieLabelById.get(u.locatie_id) : null
        const canHaveLocked = u.role === 'front_desk' || u.role === 'teacher'
        return (
          <button
            type="button"
            className="text-left text-quasar-black hover:underline"
            onClick={() => {
              setEditLocatie(u)
              setEditLocatieValue(u.locatie_id ?? '')
            }}
            title={
              canHaveLocked
                ? 'Setează locația implicită — userul va vedea doar locația aceasta'
                : 'Adminii/managerii pot schimba liber locația din bara de sus'
            }
          >
            {label ?? <span className="text-quasar-gray">—</span>}
          </button>
        )
      },
      className: 'w-44',
      sortValue: (u) =>
        u.locatie_id ? locatieLabelById.get(u.locatie_id)?.toLowerCase() : undefined,
    },
    {
      header: 'Creat',
      cell: (u) => formatDate(u.created_at),
      className: 'w-40',
      sortValue: (u) => u.created_at,
    },
    {
      header: 'Ultima logare',
      cell: (u) => formatDate(u.last_sign_in_at),
      className: 'w-40',
      sortValue: (u) => u.last_sign_in_at,
    },
    {
      header: '',
      cell: (u) => {
        const canManageTarget = canManageRole(callerRole, u.role)
        if (!canManageTarget) {
          return <span className="text-xs text-quasar-gray">—</span>
        }
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              onClick={() => {
                setEditRole(u)
                setEditRoleValue(u.role)
                setActionError(null)
              }}
            >
              Rol
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setResetPwd(u)
                setResetPwdValue('')
                setActionError(null)
              }}
            >
              Parolă
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmDelete(u)
                setActionError(null)
              }}
              disabled={remove.isPending}
            >
              Șterge
            </Button>
          </div>
        )
      },
      className: 'w-56',
    },
  ]

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-quasar-black">Utilizatori</h2>
        <Button onClick={() => setFormOpen(true)}>+ Utilizator</Button>
      </div>

      {usersQ.isLoading ? (
        <Spinner />
      ) : usersQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare:{' '}
          {usersQ.error instanceof Error ? usersQ.error.message : ''}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={usersQ.data ?? []}
          rowKey={(u) => u.id}
          emptyMessage="Niciun utilizator."
        />
      )}

      {formOpen && (
        <CreateUserModal
          open
          roleOptions={roleOptions}
          locatii={locatiiQ.data ?? []}
          onClose={() => setFormOpen(false)}
          onSuccess={() => {
            setFormOpen(false)
            void invalidate()
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          user={confirmDelete}
          isPending={remove.isPending}
          error={actionError}
          onConfirm={() => remove.mutate(confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {editRole && (
        <EditRoleModal
          user={editRole}
          roleValue={editRoleValue}
          roleOptions={roleOptions}
          isPending={updateRole.isPending}
          error={actionError}
          onChange={setEditRoleValue}
          onConfirm={() =>
            updateRole.mutate({ userId: editRole.id, role: editRoleValue })
          }
          onClose={() => setEditRole(null)}
        />
      )}

      {resetPwd && (
        <ResetPasswordModal
          user={resetPwd}
          pwdValue={resetPwdValue}
          isPending={resetPassword.isPending}
          error={actionError}
          onChange={setResetPwdValue}
          onConfirm={() => {
            if (resetPwdValue.length < 8) {
              setActionError('Parola: minim 8 caractere.')
              return
            }
            resetPassword.mutate({
              userId: resetPwd.id,
              password: resetPwdValue,
            })
          }}
          onClose={() => setResetPwd(null)}
        />
      )}

      {editLocatie && (
        <EditLocatieModal
          user={editLocatie}
          locatieValue={editLocatieValue}
          locatii={locatiiQ.data ?? []}
          isPending={updateLocatie.isPending}
          mutationError={
            updateLocatie.isError && updateLocatie.error instanceof Error
              ? updateLocatie.error.message
              : null
          }
          validationError={locatieValidationError}
          onChange={setEditLocatieValue}
          onConfirm={() => {
            const locked = editLocatie.role === 'front_desk'
            if (locked && !editLocatieValue) {
              setLocatieValidationError(
                `${ROLE_LABEL[editLocatie.role]} trebuie să aibă o locație asignată.`,
              )
              return
            }
            setLocatieValidationError(null)
            updateLocatie.mutate({
              userId: editLocatie.id,
              locatieId: editLocatieValue || null,
            })
          }}
          onClose={() => {
            setEditLocatie(null)
            setLocatieValidationError(null)
          }}
        />
      )}
    </section>
  )
}
