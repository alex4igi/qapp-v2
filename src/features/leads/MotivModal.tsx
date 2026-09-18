import { humanizeError } from '@/lib/errorMessage'
import { useState, useEffect, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, TextArea, Button } from '@/components/ui'
import type { Lead } from '@/types/db'
import { MOTIVE_NURTURE, MOTIVE_PIERDUT, type ModMotiv } from './constants'
import { moveToNurture, updateLead } from './api'

type Props = {
  open: boolean
  lead: Lead | null
  /** Coloana pe care s-a tras cardul — doar sugerează grupul, nu-l impune. */
  mod: ModMotiv
  onClose: () => void
}

// Motivul ales decide și DESTINAȚIA, nu doar eticheta. Asta e toată ideea:
// până acum recepția alegea întâi coloana și abia apoi motivul, iar în „Pierdut"
// ajungeau oameni care spuseseră doar „nu acum" (24 de carduri, zero opt-out
// real). Aici alegi ce a spus omul, iar aplicația știe unde îi e locul.
export function MotivModal({ open, lead, mod, onClose }: Props) {
  const queryClient = useQueryClient()
  const [categorie, setCategorie] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCategorie(lead?.motiv_categorie ?? null)
    setNota(lead?.motiv_pierdut ?? '')
    setError(null)
  }, [open, lead])

  const estePierdut = MOTIVE_PIERDUT.some((m) => m.value === categorie)

  const mutation = useMutation({
    mutationFn: async () => {
      if (estePierdut) {
        await updateLead(lead!.id, {
          status: 'pierdut',
          motiv_categorie: categorie!,
          motiv_pierdut: nota.trim(),
        })
      } else {
        await moveToNurture(lead!.id, categorie!, nota)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!categorie) {
      setError('Alege un motiv.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  const grup = (titlu: string, explicatie: string, optiuni: typeof MOTIVE_PIERDUT, ton: 'rosu' | 'roz') => (
    <div>
      <div className="flex items-baseline gap-2">
        <span className={`text-sm font-semibold ${ton === 'rosu' ? 'text-red-700' : 'text-pink-700'}`}>
          {titlu}
        </span>
        <span className="text-xs text-quasar-gray">{explicatie}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {optiuni.map((m) => {
          const activ = categorie === m.value
          return (
            <button
              key={m.value}
              type="button"
              title={m.ajutor}
              onClick={() => {
                setCategorie(m.value)
                setError(null)
              }}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                activ
                  ? ton === 'rosu'
                    ? 'border-red-300 bg-red-100 font-medium text-red-700'
                    : 'border-pink-300 bg-pink-100 font-medium text-pink-700'
                  : 'border-quasar-gray-light bg-white text-quasar-gray hover:border-quasar-gray'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  const aleseleImplicit = mod === 'pierdut'

  return (
    <Modal
      open={open}
      title="De ce pleacă din pipeline?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="motiv-form"
            variant={estePierdut ? 'danger' : 'primary'}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Se salvează…'
              : estePierdut
                ? 'Marchează pierdut'
                : 'Mută în Nurture'}
          </Button>
        </>
      }
    >
      <form id="motiv-form" onSubmit={handleSubmit} className="space-y-4">
        {lead && (
          <p className="text-sm text-quasar-gray">
            Ce a spus{' '}
            <span className="font-medium text-quasar-black">
              {[lead.prenume, lead.nume].filter(Boolean).join(' ')}
            </span>
            ? Motivul ales decide și unde ajunge cardul.
          </p>
        )}

        {aleseleImplicit ? (
          <>
            {grup('Nu mai contactăm', 'cardul rămâne în Pierdut, definitiv', MOTIVE_PIERDUT, 'rosu')}
            {grup('Nu acum', 'merge în Nurture, îl prindem la campanii', MOTIVE_NURTURE, 'roz')}
          </>
        ) : (
          <>
            {grup('Nu acum', 'merge în Nurture, îl prindem la campanii', MOTIVE_NURTURE, 'roz')}
            {grup('Nu mai contactăm', 'cardul rămâne în Pierdut, definitiv', MOTIVE_PIERDUT, 'rosu')}
          </>
        )}

        <TextArea
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Detaliu, dacă e ceva de reținut pentru data viitoare… (opțional)"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
