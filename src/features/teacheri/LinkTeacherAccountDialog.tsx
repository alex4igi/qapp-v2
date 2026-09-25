import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, Select, Button } from '@/components/ui'
import { listUsers, linkTeacherAccount } from '@/features/setari/utilizatoriApi'
import type { TeacherComplet as Teacher } from './api'
import { getLinkedAuthUserIds } from './api'

type Props = {
  open: boolean
  teacher: Teacher
  onClose: () => void
}

// Leagă un cont de autentificare EXISTENT (creat separat) de acest instructor.
// Complementar lui TeacherAccountDialog (care creează un cont nou + leagă).
export function LinkTeacherAccountDialog({ open, teacher, onClose }: Props) {
  const queryClient = useQueryClient()
  const [userId, setUserId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const usersQ = useQuery({ queryKey: ['utilizatori'], queryFn: listUsers })
  const linkedQ = useQuery({
    queryKey: ['teacheri', 'linked-auth-ids'],
    queryFn: getLinkedAuthUserIds,
  })

  // Candidați: conturi care nu sunt deja legate de alt instructor.
  const options = useMemo(() => {
    const linked = new Set(linkedQ.data ?? [])
    return (usersQ.data ?? [])
      .filter((u) => !linked.has(u.id))
      .map((u) => ({
        value: u.id,
        label: `${u.email ?? '(fără email)'} · ${u.role}`,
      }))
  }, [usersQ.data, linkedQ.data])

  const submit = useMutation({
    mutationFn: () => linkTeacherAccount(userId, teacher.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teacher', teacher.id] })
      void queryClient.invalidateQueries({ queryKey: ['utilizatori'] })
      void queryClient.invalidateQueries({
        queryKey: ['teacheri', 'linked-auth-ids'],
      })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la legare.')),
  })

  return (
    <Modal
      open={open}
      title="Leagă un cont existent"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            disabled={submit.isPending || !userId}
            onClick={() => {
              setError(null)
              submit.mutate()
            }}
          >
            {submit.isPending ? 'Se leagă…' : 'Leagă contul'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-quasar-gray">
          Alege un cont deja creat (din Setări → Utilizatori). Va fi setat pe
          rolul „teacher" și legat de <strong>{teacher.nume}</strong>, ca să
          poată folosi evaluările, salariul propriu și situația grupelor.
        </p>
        <Field label="Cont de autentificare" required>
          <Select
            placeholder={
              usersQ.isLoading || linkedQ.isLoading
                ? 'Se încarcă…'
                : options.length === 0
                  ? 'Niciun cont nelegat disponibil'
                  : '— alege cont —'
            }
            options={options}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
