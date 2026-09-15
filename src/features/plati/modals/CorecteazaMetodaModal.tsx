import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, Select, Spinner, TextArea } from '@/components/ui'
import { metodaPlataOptions } from '@/lib/enums'
import { formatRON } from '@/lib/format'
import {
  getIncasareForEdit,
  updateIncasareWithAudit,
} from '../api/incasare-edit'

type Props = {
  incasareId: string
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

// Corectare focusată doar pe metoda de plată (ex: încasat card, salvat greșit cash).
// Reutilizează fluxul cu motiv obligatoriu + audit din Financiar, dar fără sumă/ștergere
// — corectarea metodei e o acțiune de front-desk.
export function CorecteazaMetodaModal({ incasareId, open, onClose, onSaved }: Props) {
  const queryClient = useQueryClient()
  const [metoda, setMetoda] = useState<string>('')
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)

  const infoQ = useQuery({
    queryKey: ['incasare-edit', incasareId],
    queryFn: () => getIncasareForEdit(incasareId),
    enabled: open,
  })

  useEffect(() => {
    if (open && infoQ.data) {
      setMetoda(infoQ.data.metoda ?? '')
    }
    if (!open) {
      setMotiv('')
      setError(null)
    }
  }, [open, infoQ.data])

  const save = useMutation({
    mutationFn: () =>
      updateIncasareWithAudit({
        id: incasareId,
        patch: { metoda: metoda || null },
        motiv,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plati-metode'] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['incasari'] })
      void queryClient.invalidateQueries({ queryKey: ['incasare-edit', incasareId] })
      onSaved?.()
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!metoda) {
      setError('Alege metoda de plată.')
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
      title="Corectează forma de plată"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="corecteaza-metoda-form"
            disabled={save.isPending || infoQ.isLoading}
          >
            {save.isPending ? 'Se salvează…' : 'Salvează'}
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
        <form
          id="corecteaza-metoda-form"
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-quasar-gray">Client:</span>{' '}
              <strong className="text-quasar-black">
                {infoQ.data?.client_nume ?? '—'}
              </strong>
            </p>
            <p>
              <span className="text-quasar-gray">Detalii:</span>{' '}
              {infoQ.data?.categorie ?? '—'}
              {infoQ.data?.detalii ? ` · ${infoQ.data.detalii}` : ''}
            </p>
            <p>
              <span className="text-quasar-gray">Sumă:</span>{' '}
              {formatRON(infoQ.data?.suma ?? 0)}
              {infoQ.data?.data ? ` · ${infoQ.data.data}` : ''}
            </p>
          </div>

          <Field label="Metodă plată" required htmlFor="corect-metoda">
            <Select
              id="corect-metoda"
              placeholder="—"
              options={metodaPlataOptions}
              value={metoda}
              onChange={(e) => setMetoda(e.target.value)}
            />
          </Field>

          <Field label="Motiv corectare (obligatoriu)" required htmlFor="corect-motiv">
            <TextArea
              id="corect-motiv"
              rows={2}
              value={motiv}
              onChange={(e) => setMotiv(e.target.value)}
              placeholder="Ex: încasat pe card, înregistrat greșit cash."
            />
          </Field>

          <p className="text-xs text-quasar-gray">
            Corectarea se înregistrează în jurnalul de audit cu valorile veche și nouă.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
