import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Field,
  Modal,
  Select,
  Spinner,
  TextArea,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { sezonActivId } from '@/lib/lookups'
import { listCursuriPentruInrolare, moveEnrollmentToCurs } from './api'

type Props = {
  enrollmentId: string
  open: boolean
  onClose: () => void
}

type CurrentInfo = {
  id: string
  curs_id: string | null
  nume_curs_curent: string | null
  nume_client: string | null
}

async function fetchCurrentInfo(id: string): Promise<CurrentInfo> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, cursul, cursul_rel:cursuri(numele), client(nume, prenume)')
    .eq('id', id)
    .single()
  if (error) throw error
  const row = data as unknown as {
    id: string
    cursul: string | null
    cursul_rel: { numele: string | null } | null
    client: { nume: string | null; prenume: string | null } | null
  }
  return {
    id: row.id,
    curs_id: row.cursul,
    nume_curs_curent: row.cursul_rel?.numele ?? null,
    nume_client: row.client
      ? `${row.client.nume ?? ''} ${row.client.prenume ?? ''}`.trim()
      : null,
  }
}

export function MoveEnrollmentModal({ enrollmentId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const { locatieId } = useWorkingLocatie()
  const [newCursId, setNewCursId] = useState('')
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)

  const infoQ = useQuery({
    queryKey: ['enrollment-current-info', enrollmentId],
    queryFn: () => fetchCurrentInfo(enrollmentId),
    enabled: open,
  })

  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
    enabled: open,
  })
  const cursuriQ = useQuery({
    queryKey: ['cursuri-pentru-inrolare', locatieId, sezonActivQ.data ?? null],
    queryFn: () => listCursuriPentruInrolare(locatieId, sezonActivQ.data ?? null),
    enabled: open && sezonActivQ.isSuccess,
  })

  useEffect(() => {
    if (!open) {
      setNewCursId('')
      setMotiv('')
      setError(null)
    }
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      moveEnrollmentToCurs({
        enrollmentId,
        newCursId,
        motiv,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['plati-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['enrollment-current-info', enrollmentId] })
      // Rosterele grupei vechi + noi folosesc alte chei → invalidate explicit,
      // altfel cursantul mutat rămâne afișat din cache în grupa veche.
      void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['prezente'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la mutare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!newCursId) {
      setError('Selectează cursul nou.')
      return
    }
    if (newCursId === infoQ.data?.curs_id) {
      setError('Cursul nou e identic cu cel curent.')
      return
    }
    if (!motiv.trim()) {
      setError('Motivul e obligatoriu.')
      return
    }
    save.mutate()
  }

  const cursOptions = (cursuriQ.data ?? [])
    .filter((c) => c.id !== infoQ.data?.curs_id)
    .map((c) => ({ value: c.id, label: c.numele ?? '—' }))

  return (
    <Modal
      open={open}
      title="Mută înrolarea în alt curs"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="move-enrollment-form"
            disabled={save.isPending || infoQ.isLoading}
          >
            {save.isPending ? 'Se mută…' : 'Mută'}
          </Button>
        </>
      }
    >
      {infoQ.isLoading || cursuriQ.isLoading ? (
        <Spinner />
      ) : infoQ.isError ? (
        <p className="text-sm text-red-600">
          {humanizeError(infoQ.error, 'Eroare la încărcare.')}
        </p>
      ) : (
        <form id="move-enrollment-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-quasar-gray">Cursant:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.nume_client ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Curs curent:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.nume_curs_curent ?? '—'}
              </strong>
            </p>
          </div>

          <Field label="Curs nou" required htmlFor="move-curs">
            <Select
              id="move-curs"
              placeholder="— alege cursul —"
              options={cursOptions}
              value={newCursId}
              onChange={(e) => setNewCursId(e.target.value)}
            />
          </Field>

          <Field label="Motiv mutare" required htmlFor="move-motiv">
            <TextArea
              id="move-motiv"
              rows={3}
              placeholder="Ex: Avansare la grupa următoare; mutat la cererea părintelui; etc."
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
            />
          </Field>

          <p className="text-xs text-quasar-gray">
            Plățile existente rămân la fel (fără prorata). Înrolarea va fi vizibilă
            la noul curs în prezența + roster. Mutarea se înregistrează în jurnalul de audit.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
