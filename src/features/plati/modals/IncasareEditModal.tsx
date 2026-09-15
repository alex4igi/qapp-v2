import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DateInput,
  Field,
  Modal,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from '@/components/ui'
import {
  getIncasareForEdit,
  updateIncasareWithAudit,
  deleteIncasareWithAudit,
} from '../api/incasare-edit'

type Props = {
  incasareId: string
  open: boolean
  onClose: () => void
}

const METODA_OPTIONS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Card', label: 'Card' },
  { value: 'Transfer', label: 'Transfer' },
  { value: 'Revolut', label: 'Revolut' },
  { value: 'Online', label: 'Online' },
]

export function IncasareEditModal({ incasareId, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [data, setData] = useState('')
  const [suma, setSuma] = useState('')
  const [metoda, setMetoda] = useState<string>('')
  const [observatii, setObservatii] = useState('')
  const [motiv, setMotiv] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const infoQ = useQuery({
    queryKey: ['incasare-edit', incasareId],
    queryFn: () => getIncasareForEdit(incasareId),
    enabled: open,
  })

  useEffect(() => {
    if (open && infoQ.data) {
      setData(infoQ.data.data ?? '')
      setSuma(String(infoQ.data.suma ?? ''))
      setMetoda(infoQ.data.metoda ?? '')
      setObservatii(infoQ.data.observatii ?? '')
    }
    if (!open) {
      setMotiv('')
      setError(null)
      setConfirmDelete(false)
    }
  }, [open, infoQ.data])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['incasari'] })
    void queryClient.invalidateQueries({ queryKey: ['incasare-edit', incasareId] })
  }

  const save = useMutation({
    mutationFn: () =>
      updateIncasareWithAudit({
        id: incasareId,
        patch: {
          data: data || null,
          suma: Number(suma),
          metoda: metoda || null,
          observatii: observatii || null,
        },
        motiv,
      }),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const remove = useMutation({
    mutationFn: () => deleteIncasareWithAudit({ id: incasareId, motiv }),
    onSuccess: () => {
      invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la ștergere.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!motiv.trim()) {
      setError('Motivul e obligatoriu.')
      return
    }
    const n = Number(suma)
    if (!Number.isFinite(n) || n < 0) {
      setError('Sumă invalidă.')
      return
    }
    save.mutate()
  }

  const handleDelete = () => {
    setError(null)
    if (!motiv.trim()) {
      setError('Motivul e obligatoriu.')
      return
    }
    remove.mutate()
  }

  return (
    <Modal
      open={open}
      title="Editează / Anulează încasare"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          {confirmDelete ? (
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Renunță la ștergere
              </Button>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={handleDelete}
              >
                {remove.isPending ? 'Se șterge…' : 'Confirmă ștergerea'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="danger"
                disabled={save.isPending || remove.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                🗑 Șterge
              </Button>
              <Button
                type="submit"
                form="incasare-edit-form"
                disabled={save.isPending || infoQ.isLoading}
              >
                {save.isPending ? 'Se salvează…' : 'Salvează'}
              </Button>
            </>
          )}
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
        <form id="incasare-edit-form" onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-quasar-gray">Client:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.client_nume ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Categorie:</span>{' '}
              {infoQ.data?.categorie ?? '—'}
              {infoQ.data?.detalii ? ` · ${infoQ.data.detalii}` : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Data" htmlFor="inc-data">
              <DateInput
                id="inc-data"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </Field>
            <Field label="Sumă (RON)" required htmlFor="inc-suma">
              <TextInput
                id="inc-suma"
                type="number"
                min={0}
                step="1"
                value={suma}
                onChange={(e) => setSuma(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Metodă plată" htmlFor="inc-metoda">
            <Select
              id="inc-metoda"
              placeholder="—"
              options={METODA_OPTIONS}
              value={metoda}
              onChange={(e) => setMetoda(e.target.value)}
            />
          </Field>

          <Field label="Observații" htmlFor="inc-obs">
            <TextArea
              id="inc-obs"
              rows={2}
              value={observatii}
              onChange={(e) => setObservatii(e.target.value)}
            />
          </Field>

          <Field
            label={
              confirmDelete
                ? 'Motiv ștergere (obligatoriu)'
                : 'Motiv modificare (obligatoriu)'
            }
            required
            htmlFor="inc-motiv"
          >
            <TextArea
              id="inc-motiv"
              rows={2}
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
              placeholder="Ex: Eroare la încasare; suma corectă era…"
            />
          </Field>

          <p className="text-xs text-quasar-gray">
            Modificarea/ștergerea se înregistrează în jurnalul de audit cu valorile
            vechi și noi.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
