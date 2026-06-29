import { humanizeError } from '@/lib/errorMessage'
import { useState, useEffect, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  Select,
  Checkbox,
  Button,
} from '@/components/ui'
import { sexOptions } from '@/lib/enums'
import type { Lead, InsertDto } from '@/types/db'
import { createClient } from '@/features/clienti/api'
import {
  findMatchingClient,
  attachClientToLead,
  getLatestProgramareCurs,
} from './api'

export type ConversieResult = {
  clientId: string
  cursId: string | null
  leadId: string
}

type Props = {
  open: boolean
  lead: Lead | null
  onClose: () => void
  onConverted: (result: ConversieResult) => void
}

type MatchedClient = { id: string; nume: string; prenume: string | null }

export function ConversieModal({ open, lead, onClose, onConverted }: Props) {
  const queryClient = useQueryClient()
  const [nume, setNume] = useState('')
  const [prenume, setPrenume] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [dataNasterii, setDataNasterii] = useState('')
  const [sexul, setSexul] = useState('')
  const [linkContract, setLinkContract] = useState('')
  const [matched, setMatched] = useState<MatchedClient | null>(null)
  const [useMerge, setUseMerge] = useState(false)
  const [cursId, setCursId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !lead) return
    setNume(lead.nume)
    setPrenume(lead.prenume ?? '')
    setTelefon(lead.telefon ?? '')
    setEmail(lead.email ?? '')
    setDataNasterii(lead.data_nasterii ?? '')
    setSexul(lead.sexul ?? '')
    setLinkContract('')
    setMatched(null)
    setUseMerge(false)
    setCursId(null)
    setError(null)
    // detecție duplicat + cursul programat
    void findMatchingClient(lead.telefon, lead.email).then((m) => {
      setMatched(m)
      setUseMerge(Boolean(m))
    })
    void getLatestProgramareCurs(lead.id).then(setCursId)
  }, [open, lead])

  const mutation = useMutation({
    mutationFn: async (): Promise<ConversieResult> => {
      let clientId: string
      if (useMerge && matched) {
        clientId = matched.id
      } else {
        const dto: InsertDto<'clienti'> = {
          nume: nume.trim(),
          prenume: prenume.trim() || null,
          email: email.trim() || null,
          telefon: telefon.trim() || null,
          data_nasterii: dataNasterii || null,
          sexul: (sexul || null) as InsertDto<'clienti'>['sexul'],
          status: 'Activ',
          link_contract: linkContract.trim() || null,
        }
        const client = await createClient(dto)
        clientId = client.id
      }
      await attachClientToLead(lead!.id, clientId)
      return { clientId, cursId, leadId: lead!.id }
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['lookup', 'clienti'] })
      onConverted(result)
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la conversie.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!useMerge && !nume.trim()) {
      setError('Numele este obligatoriu.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title="Finalizare înscriere"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="conversie-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Se salvează…'
              : useMerge
                ? 'Leagă și continuă la înrolare'
                : 'Creează client și continuă'}
          </Button>
        </>
      }
    >
      <form id="conversie-form" onSubmit={handleSubmit} className="space-y-3">
        {matched && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>
              Există deja un client cu acest telefon/email:{' '}
              <strong>
                {[matched.prenume, matched.nume].filter(Boolean).join(' ')}
              </strong>
              .
            </p>
            <Checkbox
              id="conv-merge"
              label="Leagă lead-ul de clientul existent (nu crea unul nou)"
              checked={useMerge}
              onChange={(e) => setUseMerge(e.target.checked)}
            />
          </div>
        )}

        {!useMerge && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prenume" htmlFor="conv-prenume">
                <TextInput
                  id="conv-prenume"
                  value={prenume}
                  onChange={(e) => setPrenume(e.target.value)}
                />
              </Field>
              <Field label="Nume" required htmlFor="conv-nume">
                <TextInput
                  id="conv-nume"
                  value={nume}
                  onChange={(e) => setNume(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefon" htmlFor="conv-telefon">
                <TextInput
                  id="conv-telefon"
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                />
              </Field>
              <Field label="Email" htmlFor="conv-email">
                <TextInput
                  id="conv-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data nașterii" htmlFor="conv-nastere">
                <DateInput
                  id="conv-nastere"
                  value={dataNasterii}
                  onChange={(e) => setDataNasterii(e.target.value)}
                />
              </Field>
              <Field label="Sex" htmlFor="conv-sex">
                <Select
                  id="conv-sex"
                  placeholder="— selectează —"
                  options={sexOptions}
                  value={sexul}
                  onChange={(e) => setSexul(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Link contract" htmlFor="conv-contract">
              <TextInput
                id="conv-contract"
                value={linkContract}
                onChange={(e) => setLinkContract(e.target.value)}
                placeholder="Link esemneaza.ro / drive…"
              />
            </Field>
          </>
        )}

        <p className="text-xs text-quasar-gray">
          După salvare se deschide automat formularul de înrolare
          {cursId ? ', precompletat cu cursul programat' : ''}.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
