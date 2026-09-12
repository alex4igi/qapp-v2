import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  Field,
  Modal,
  Select,
  Spinner,
  TextArea,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { sezonActivId } from '@/lib/lookups'
import {
  listCursuriPentruInrolare,
  moveEnrollmentToCurs,
  previewMoveEnrollment,
} from './api'

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
  const [aplicaTarif, setAplicaTarif] = useState(true)
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

  // Preview server-side: aceleași garduri ca mutarea reală (dublură pe cursul
  // nou, sezon, tarif lipsă), deci un preview în eroare = mutare imposibilă.
  const previewQ = useQuery({
    queryKey: ['move-enrollment-preview', enrollmentId, newCursId, aplicaTarif],
    queryFn: () =>
      previewMoveEnrollment({
        enrollmentId,
        newCursId,
        aplicaTarifNou: aplicaTarif,
      }),
    enabled: open && !!newCursId,
    retry: false,
  })

  useEffect(() => {
    if (!open) {
      setNewCursId('')
      setMotiv('')
      setAplicaTarif(true)
      setError(null)
    }
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      moveEnrollmentToCurs({
        enrollmentId,
        newCursId,
        motiv,
        aplicaTarifNou: aplicaTarif,
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

  const preview = previewQ.data
  const luni = preview?.luni ?? []
  const perioada =
    luni.length > 1 ? `${luni[0]} → ${luni[luni.length - 1]}` : (luni[0] ?? '—')

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
            disabled={save.isPending || infoQ.isLoading || previewQ.isError}
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

          <Checkbox
            id="move-tarif"
            checked={aplicaTarif}
            onChange={(e) => setAplicaTarif(e.target.checked)}
            label="Aplică tariful noului curs pe lunile viitoare neplătite"
          />

          {newCursId && previewQ.isLoading && (
            <p className="text-xs text-quasar-gray">Se verifică mutarea…</p>
          )}
          {previewQ.isError && (
            <p className="text-sm text-red-600">
              {humanizeError(previewQ.error, 'Mutarea nu e posibilă.')}
            </p>
          )}
          {preview && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-quasar-black">
              <p>
                Se mută <strong>{preview.mutate}</strong>{' '}
                {preview.mutate === 1 ? 'înrolare' : 'înrolări'} ({perioada}).
              </p>
              {preview.repretuite > 0 && (
                <p className="text-quasar-gray">
                  {preview.repretuite}{' '}
                  {preview.repretuite === 1 ? 'lună trece' : 'luni trec'} pe tariful
                  cursului nou.
                </p>
              )}
              {preview.platite > 0 && (
                <p className="text-quasar-gray">
                  {preview.platite}{' '}
                  {preview.platite === 1 ? 'lună rămâne' : 'luni rămân'} la prețul
                  actual (au deja încasări).
                </p>
              )}
              {preview.promo_pierdut && (
                <p className="mt-1 font-medium text-amber-700">
                  Trupele nu au preț de reînscriere: promo-ul se pierde.{' '}
                  {preview.promo_luni > 0 ? (
                    <>
                      {preview.promo_luni}{' '}
                      {preview.promo_luni === 1 ? 'lună trece' : 'luni trec'} pe
                      tariful trupei ({preview.tarif} lei).
                    </>
                  ) : (
                    <>Nicio lună neplătită de repreţuit.</>
                  )}
                  {preview.promo_platite > 0 && (
                    <>
                      {' '}
                      {preview.promo_platite}{' '}
                      {preview.promo_platite === 1
                        ? 'lună rămâne'
                        : 'luni rămân'}{' '}
                      la prețul promo (plătite sau din trecut) — diferența nu se
                      cere automat.
                    </>
                  )}
                </p>
              )}
            </div>
          )}

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
            Mutarea ia toată seria: luna aleasă + toate lunile ulterioare de pe cursul
            vechi. Lunile anterioare rămân în istoric, iar încasările nu se mișcă.
            Mutarea se înregistrează în jurnalul de audit.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
