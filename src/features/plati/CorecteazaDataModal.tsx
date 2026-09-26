import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DateInput,
  Field,
  Modal,
  Spinner,
  TextArea,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { corecteazaDataInrolare } from './api'

type Props = {
  enrollmentId: string
  open: boolean
  onClose: () => void
}

type CurrentInfo = {
  data_incepere: string | null
  tip_plata: string | null
  nume_curs: string | null
  nume_client: string | null
}

async function fetchCurrentInfo(id: string): Promise<CurrentInfo> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('data_incepere, tip_plata, cursul_rel:cursuri(numele), client(nume, prenume)')
    .eq('id', id)
    .single()
  if (error) throw error
  const row = data as unknown as {
    data_incepere: string | null
    tip_plata: string | null
    cursul_rel: { numele: string | null } | null
    client: { nume: string | null; prenume: string | null } | null
  }
  return {
    data_incepere: row.data_incepere,
    tip_plata: row.tip_plata,
    nume_curs: row.cursul_rel?.numele ?? null,
    nume_client: row.client
      ? `${row.client.nume ?? ''} ${row.client.prenume ?? ''}`.trim()
      : null,
  }
}

function formatData(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function CorecteazaDataModal({ enrollmentId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [dataNoua, setDataNoua] = useState('')
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)

  const infoQ = useQuery({
    queryKey: ['enrollment-current-info', enrollmentId],
    queryFn: () => fetchCurrentInfo(enrollmentId),
    enabled: open,
  })

  useEffect(() => {
    if (!open) {
      setDataNoua('')
      setMotiv('')
      setError(null)
    }
  }, [open])

  const perLuna = infoQ.data?.tip_plata === 'Per luna'

  const save = useMutation({
    mutationFn: () =>
      corecteazaDataInrolare({ enrollmentId, dataNoua, motiv }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['plati-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['enrollment-current-info', enrollmentId] })
      // Rosterul + ocuparea grupei depind de data înrolării.
      void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['prezente'] })
      // La OPEN „Per ședință" RPC-ul mută și rezervarea pe sesiunea zilei noi.
      void queryClient.invalidateQueries({ queryKey: ['open-sesiune'] })
      void queryClient.invalidateQueries({ queryKey: ['open-sesiuni'] })
      void queryClient.invalidateQueries({ queryKey: ['open-rezervari'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la corectarea datei.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!dataNoua) {
      setError('Alege data nouă.')
      return
    }
    if (dataNoua === infoQ.data?.data_incepere) {
      setError('Data nouă e identică cu cea curentă.')
      return
    }
    if (!motiv.trim()) {
      setError('Motivul e obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title="Corectează data înrolării"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="corecteaza-data-form"
            disabled={save.isPending || infoQ.isLoading}
          >
            {save.isPending ? 'Se corectează…' : 'Corectează'}
          </Button>
        </>
      }
    >
      {infoQ.isLoading ? (
        <Spinner />
      ) : infoQ.isError ? (
        <p className="text-sm text-red-600">
          {humanizeError(infoQ.error, 'Eroare la încărcare.')}
        </p>
      ) : (
        <form id="corecteaza-data-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-quasar-gray">Cursant:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.nume_client ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Curs:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.nume_curs ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Data curentă:</span>{' '}
              <strong className="text-quasar-black">
                {formatData(infoQ.data?.data_incepere ?? null)}
              </strong>{' '}
              <span className="text-quasar-gray">({infoQ.data?.tip_plata ?? '—'})</span>
            </p>
          </div>

          <Field label="Data corectă" required htmlFor="corecteaza-data">
            <DateInput
              id="corecteaza-data"
              value={dataNoua}
              onChange={(e) => setDataNoua(e.target.value)}
            />
          </Field>

          <Field label="Motiv corectare" required htmlFor="corecteaza-motiv">
            <TextArea
              id="corecteaza-motiv"
              rows={3}
              placeholder="Ex: ședința a fost înregistrată din greșeală pe altă zi."
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
            />
          </Field>

          <p className="text-xs text-quasar-gray">
            {perLuna
              ? 'Abonament lunar: corectarea mută luna întreagă (1 → ultima zi a lunii alese).'
              : 'Se mută doar data ședinței.'}{' '}
            Încasările nu se modifică — banii rămân pe data reală a plății.
            Corectarea se înregistrează în jurnalul de audit.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
