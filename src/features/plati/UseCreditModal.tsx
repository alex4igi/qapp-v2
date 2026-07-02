import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, Select, TextInput, Spinner } from '@/components/ui'
import {
  getClientCredit,
  getClientOutstandingCharges,
  useClientCredit,
} from './api'

type Props = {
  clientId: string
  clientNume?: string | null
  open: boolean
  onClose: () => void
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function UseCreditModal({ clientId, clientNume, open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [action, setAction] = useState<'allocate' | 'refund'>('allocate')
  const [targetKey, setTargetKey] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const creditQ = useQuery({
    queryKey: ['client-credit', clientId],
    queryFn: () => getClientCredit(clientId),
    enabled: open,
  })
  const targetsQ = useQuery({
    queryKey: ['surplus-targets', clientId],
    queryFn: () => getClientOutstandingCharges({ clientId }),
    enabled: open,
  })

  const credit = creditQ.data ?? 0
  const targets = targetsQ.data ?? []
  const selectedTarget = targets.find((t) => `${t.type}:${t.id}` === targetKey)

  const amt = Number(amount)
  const cap =
    action === 'allocate'
      ? Math.min(amt, credit, selectedTarget?.rest ?? 0)
      : Math.min(amt, credit)
  const willUse = Number.isFinite(cap) && cap > 0 ? round2(cap) : 0

  useEffect(() => {
    if (!open) {
      setAction('allocate')
      setTargetKey('')
      setAmount('')
      setError(null)
    }
  }, [open])

  // Sumă implicită = tot creditul disponibil.
  useEffect(() => {
    if (open && credit > 0 && !amount) setAmount(String(credit))
  }, [open, credit, amount])

  useEffect(() => {
    if (targets.length > 0 && !targetKey) {
      setTargetKey(`${targets[0].type}:${targets[0].id}`)
    }
  }, [targets, targetKey])

  useEffect(() => {
    if (
      action === 'allocate' &&
      !targetsQ.isLoading &&
      targets.length === 0
    ) {
      setAction('refund')
    }
  }, [action, targetsQ.isLoading, targets.length])

  const save = useMutation({
    mutationFn: () =>
      useClientCredit({
        clientId,
        amount: amt,
        action,
        targetType: action === 'allocate' ? selectedTarget?.type : null,
        targetId: action === 'allocate' ? selectedTarget?.id : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client'] })
      void queryClient.invalidateQueries({ queryKey: ['client-inrolari-sezon'] })
      void queryClient.invalidateQueries({ queryKey: ['client-credit'] })
      void queryClient.invalidateQueries({ queryKey: ['surplus-targets'] })
      void queryClient.invalidateQueries({ queryKey: ['plati-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({ queryKey: ['datorii'] })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Sumă invalidă.')
      return
    }
    if (amt > credit + 0.004) {
      setError(`Creditul disponibil e ${credit} RON.`)
      return
    }
    if (action === 'allocate' && !selectedTarget) {
      setError('Alege înrolarea/datoria unde aloci creditul.')
      return
    }
    save.mutate()
  }

  const radio = (value: 'allocate' | 'refund') => ({
    type: 'radio' as const,
    name: 'use-credit-action',
    checked: action === value,
    onChange: () => setAction(value),
    className: 'mt-0.5',
  })

  return (
    <Modal
      open={open}
      title="Folosește credit"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="use-credit-form"
            disabled={save.isPending || creditQ.isLoading || credit <= 0}
          >
            {save.isPending ? 'Se salvează…' : 'Confirmă'}
          </Button>
        </>
      }
    >
      {creditQ.isLoading ? (
        <Spinner />
      ) : (
        <form id="use-credit-form" onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm">
            <span className="text-quasar-gray">Client:</span>{' '}
            <strong className="text-quasar-black">{clientNume ?? '—'}</strong>
          </p>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            💳 Credit disponibil: <strong>{credit} RON</strong>
          </div>

          {credit <= 0 ? (
            <p className="text-sm text-quasar-gray">
              Clientul nu are credit disponibil.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input {...radio('allocate')} disabled={targets.length === 0} />
                  <span className="flex-1 font-medium text-quasar-black">
                    Alocă la o datorie a clientului
                    {targets.length === 0 && (
                      <span className="block text-xs font-normal text-quasar-gray">
                        Clientul nu are datorii neachitate.
                      </span>
                    )}
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input {...radio('refund')} />
                  <span className="flex-1 font-medium text-quasar-black">
                    Restituie creditul
                  </span>
                </label>
              </div>

              {action === 'allocate' && targets.length > 0 && (
                <Field label="Unde aloci" htmlFor="use-credit-target">
                  <Select
                    id="use-credit-target"
                    options={targets.map((t) => ({
                      label: t.label,
                      value: `${t.type}:${t.id}`,
                    }))}
                    value={targetKey}
                    onChange={(e) => setTargetKey(e.target.value)}
                  />
                </Field>
              )}

              <Field label="Sumă (RON)" required htmlFor="use-credit-amount">
                <TextInput
                  id="use-credit-amount"
                  type="number"
                  min={0}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              <p className="text-xs text-quasar-gray">
                {action === 'allocate'
                  ? `Se folosesc ${willUse} RON din credit${
                      selectedTarget ? ` pentru „${selectedTarget.label}"` : ''
                    }.`
                  : `Se restituie ${willUse} RON.`}
              </p>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}
