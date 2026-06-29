import { humanizeError } from '@/lib/errorMessage'
import { useState, useEffect, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, Select, Button } from '@/components/ui'
import type { Lead, GrupaLead } from '@/types/db'
import { prependObservatie, INTERESE, GRUPE, GRUPA_LABELS } from './constants'
import { updateLead, type LeadForm } from './api'

type Props = {
  open: boolean
  lead: Lead | null
  onClose: () => void
}

export function WaitingListModal({ open, lead, onClose }: Props) {
  const queryClient = useQueryClient()
  const [interes, setInteres] = useState('')
  const [grupa, setGrupa] = useState('')
  const [detalii, setDetalii] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setInteres(lead?.interes ?? '')
    setGrupa(lead?.grupa_varsta ?? '')
    setDetalii('')
    setError(null)
  }, [open, lead])

  const mutation = useMutation({
    mutationFn: () => {
      const form: Partial<LeadForm> = { status: 'waiting_list' }
      // Notăm interesul (direcție + grupă) pe lead, ca să putem grupa
      // lista de așteptare pe ce-și doresc.
      if (interes) form.interes = interes
      if (grupa) form.grupa_varsta = grupa
      const notaInteres = [
        interes || null,
        grupa ? GRUPA_LABELS[grupa as GrupaLead] : null,
      ]
        .filter(Boolean)
        .join(' · ')
      const notaFinala = [notaInteres || null, detalii.trim() || null]
        .filter(Boolean)
        .join(' — ')
      if (notaFinala)
        form.observatii = prependObservatie(
          'Waiting list',
          notaFinala,
          lead!.observatii,
        )
      return updateLead(lead!.id, form)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title="Adaugă pe lista de așteptare"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="waiting-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Adaugă în waiting list'}
          </Button>
        </>
      }
    >
      <form id="waiting-form" onSubmit={handleSubmit} className="space-y-3">
        {lead && (
          <p className="text-sm text-quasar-gray">
            Pe lista de așteptare:{' '}
            <span className="font-medium text-quasar-black">
              {[lead.prenume, lead.nume].filter(Boolean).join(' ')}
            </span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Interes (direcție)" htmlFor="waiting-interes">
            <Select
              id="waiting-interes"
              placeholder="— alege —"
              options={INTERESE.map((i) => ({ label: i, value: i }))}
              value={interes}
              onChange={(e) => setInteres(e.target.value)}
            />
          </Field>
          <Field label="Grupă dorită" htmlFor="waiting-grupa">
            <Select
              id="waiting-grupa"
              placeholder="— alege —"
              options={GRUPE.map((g) => ({ label: GRUPA_LABELS[g], value: g }))}
              value={grupa}
              onChange={(e) => setGrupa(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Detalii așteptare (opțional)" htmlFor="waiting-detalii">
          <TextArea
            id="waiting-detalii"
            rows={2}
            value={detalii}
            onChange={(e) => setDetalii(e.target.value)}
            placeholder="Ex: vrea și vinerea, doar la Nicolina…"
          />
        </Field>
        <p className="text-xs text-quasar-gray">
          Interesul se salvează pe lead (pentru grupare). Lead-ul primește un SMS
          de confirmare.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
