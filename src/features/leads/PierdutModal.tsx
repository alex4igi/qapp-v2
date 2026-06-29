import { humanizeError } from '@/lib/errorMessage'
import { useState, useEffect, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, TextArea, Button } from '@/components/ui'
import type { Lead } from '@/types/db'
import { MOTIVE_PIERDUT_RAPIDE } from './constants'
import { updateLead } from './api'

type Props = {
  open: boolean
  lead: Lead | null
  onClose: () => void
}

export function PierdutModal({ open, lead, onClose }: Props) {
  const queryClient = useQueryClient()
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMotiv(lead?.motiv_pierdut ?? '')
    setError(null)
  }, [open, lead])

  const mutation = useMutation({
    mutationFn: () =>
      updateLead(lead!.id, {
        status: 'pierdut',
        motiv_pierdut: motiv.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!motiv.trim()) {
      setError('Adaugă un motiv.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title="Lead pierdut — motiv"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="pierdut-form"
            variant="danger"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Marchează pierdut'}
          </Button>
        </>
      }
    >
      <form id="pierdut-form" onSubmit={handleSubmit} className="space-y-3">
        {lead && (
          <p className="text-sm text-quasar-gray">
            De ce a fost pierdut{' '}
            <span className="font-medium text-quasar-black">
              {[lead.prenume, lead.nume].filter(Boolean).join(' ')}
            </span>
            ?
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {MOTIVE_PIERDUT_RAPIDE.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMotiv(m)
                setError(null)
              }}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                motiv === m
                  ? 'border-red-300 bg-red-100 text-red-700'
                  : 'border-quasar-gray-light bg-white text-quasar-gray hover:border-quasar-gray'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <TextArea
          rows={2}
          value={motiv}
          onChange={(e) => {
            setMotiv(e.target.value)
            setError(null)
          }}
          placeholder="Sau scrie un motiv custom…"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
