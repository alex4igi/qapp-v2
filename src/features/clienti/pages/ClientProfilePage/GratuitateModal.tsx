import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, Select, TextArea } from '@/components/ui'
import { seteazaGratuitate, type ClientInrolareSezon, type TipGratuitate } from '../../api'
import { formatLuna } from './helpers'

type Props = {
  clientId: string
  row: ClientInrolareSezon
  onClose: () => void
}

const OPTIUNI = [
  { value: 'angajat', label: 'Voucher de angajat (300 lei/lună)' },
  { value: 'special', label: 'Gratuitate specială (acoperă tot)' },
  { value: 'fara', label: 'Fără — omul plătește' },
]

export function GratuitateModal({ clientId, row, onClose }: Props) {
  const queryClient = useQueryClient()
  const [tip, setTip] = useState<string>(row.gratuitate ?? 'angajat')
  const [motiv, setMotiv] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      seteazaGratuitate({
        clientId,
        cursId: row.id_curs,
        deLa: row.data_incepere,
        tip: tip === 'fara' ? null : (tip as TipGratuitate),
        motiv,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['client-credit', clientId] })
      void queryClient.invalidateQueries({ queryKey: ['plati-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard'] })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if ((row.gratuitate ?? 'fara') === tip) {
      setError('Rata are deja această variantă.')
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
      open
      title="Voucher angajat / gratuitate"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="gratuitate-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="gratuitate-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm">
          <strong className="text-quasar-black">{row.nume_curs}</strong>
          <span className="text-quasar-gray">
            {' '}
            — de la {formatLuna(row.data_incepere)} până la sfârșitul seriei
          </span>
        </p>

        <Field label="Cine plătește" required htmlFor="gratuitate-tip">
          <Select
            id="gratuitate-tip"
            options={OPTIUNI}
            value={tip}
            onChange={(e) => setTip(e.target.value)}
          />
        </Field>

        <Field label="Motiv" required htmlFor="gratuitate-motiv">
          <TextArea
            id="gratuitate-motiv"
            rows={2}
            placeholder="Ex: instructor Quasar, folosește voucherul la trupă."
            value={motiv}
            onChange={(e) => setMotiv(e.target.value)}
          />
        </Field>

        <p className="text-xs text-quasar-gray">
          Rata acoperită nu se mai plătește, dar omul se numără la grupă ca loc plătit (salariul
          instructorului, ocuparea). Voucherul de angajat are 300 lei pe lună: ce rămâne se
          folosește la a doua grupă din aceeași lună, peste 300 se plătește. Banii deja încasați
          pe o rată acoperită rămân credit, de restituit din „Folosește credit”.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
