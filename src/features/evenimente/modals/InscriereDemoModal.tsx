import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Combobox,
  Field,
  Modal,
  Select,
  Tabs,
  TextInput,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { clientiOptions } from '@/lib/lookups'
import { isPrivileged } from '@/lib/rolesMatrix'
import { useAuth } from '@/hooks/useAuth'
import { enqueueConfirmareProgramare } from '@/features/leads/api'
// Valorile trebuie să rămână sincron cu enumul `interes_lead` din DB — le luăm
// din sursa lor, nu le duplicăm aici.
import { INTERESE } from '@/features/leads/constants'
import {
  creeazaLeadSiInscrie,
  inscrieLaDemo,
  searchLeads,
  type SursaInscriere,
} from '../apiDemo'

type Mode = 'lead' | 'walkin' | 'client'

type Props = {
  open: boolean
  evenimentId: string
  ocupat: number
  capacitate: number | null
  onClose: () => void
}

export function InscriereDemoModal({
  open,
  evenimentId,
  ocupat,
  capacitate,
  onClose,
}: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const [mode, setMode] = useState<Mode>('lead')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [term, setTerm] = useState('')
  const [leadId, setLeadId] = useState('')
  const [clientId, setClientId] = useState('')
  const [adusDe, setAdusDe] = useState('')
  const [walkIn, setWalkIn] = useState({
    nume: '',
    prenume: '',
    telefon: '',
    varsta: '',
    interes: '',
  })

  const plin = capacitate != null && ocupat >= capacitate
  const poateSuprarezerva = isPrivileged(role)

  const clienti = useQuery({ queryKey: ['lookup', 'clienti'], queryFn: clientiOptions })
  const leaduri = useQuery({
    queryKey: ['leads', 'search-demo', term],
    queryFn: () => searchLeads(term),
    enabled: open && term.trim().length >= 2,
  })

  // „Adus de" e provenienta reala a inscrierii: un cursant si-a adus prietenul.
  const sursa = (): SursaInscriere =>
    adusDe ? 'recomandare' : mode === 'walkin' ? 'walk_in' : 'receptie'

  const finish = () => {
    void queryClient.invalidateQueries({ queryKey: ['eveniment-roster', evenimentId] })
    void queryClient.invalidateQueries({ queryKey: ['leads'] })
    onClose()
  }

  const save = useMutation({
    mutationFn: async () => {
      const permiteOverbook = plin && poateSuprarezerva
      if (mode === 'client') {
        if (!clientId) throw new Error('Alege un cursant.')
        await inscrieLaDemo({
          evenimentId,
          clientId,
          sursa: sursa(),
          adusDe: adusDe || null,
          permiteOverbook,
        })
        return
      }
      if (mode === 'lead') {
        if (!leadId) throw new Error('Alege un lead.')
        await inscrieLaDemo({
          evenimentId,
          leadId,
          sursa: sursa(),
          adusDe: adusDe || null,
          permiteOverbook,
        })
        await enqueueConfirmareProgramare(leadId)
        return
      }
      const res = await creeazaLeadSiInscrie({
        evenimentId,
        nume: walkIn.nume.trim(),
        prenume: walkIn.prenume.trim() || null,
        telefon: walkIn.telefon.trim(),
        varsta: walkIn.varsta ? Number(walkIn.varsta) : null,
        interes: walkIn.interes || null,
        adusDe: adusDe || null,
        sursa: sursa(),
        permiteOverbook,
      })
      await enqueueConfirmareProgramare(res.lead_id)
      if (!res.created) {
        setInfo(
          res.deja_inscris
            ? 'Numărul exista deja și era înscris — nu am creat o dublură.'
            : 'Numărul exista deja ca lead — l-am înscris pe acela, fără dublură.',
        )
      }
    },
    onSuccess: () => finish(),
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la înscriere.')),
  })

  return (
    <Modal
      open={open}
      title="Înscrie participant la clasa demo"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            disabled={save.isPending || (plin && !poateSuprarezerva)}
            onClick={() => {
              setError(null)
              setInfo(null)
              save.mutate()
            }}
          >
            {save.isPending
              ? 'Se înscrie…'
              : plin
                ? 'Înscrie peste capacitate'
                : 'Înscrie'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-quasar-gray">
        Locuri:{' '}
        <span className={plin ? 'font-bold text-red-600' : 'font-bold text-ink'}>
          {ocupat}
          {capacitate != null ? ` / ${capacitate}` : ''}
        </span>
        {capacitate == null && ' (capacitate nesetată)'}
      </p>

      <Tabs
        tabs={[
          { id: 'lead', label: 'Lead existent' },
          { id: 'walkin', label: 'Persoană nouă' },
          { id: 'client', label: 'Cursant existent' },
        ]}
        active={mode}
        onChange={(id) => {
          setMode(id as Mode)
          setError(null)
          setInfo(null)
        }}
      />

      {mode === 'lead' && (
        <div className="space-y-3">
          <Field label="Caută lead (nume sau telefon)" htmlFor="demo-lead-q">
            <TextInput
              id="demo-lead-q"
              value={term}
              placeholder="minim 2 caractere…"
              onChange={(e) => setTerm(e.target.value)}
            />
          </Field>
          <div className="max-h-56 overflow-y-auto rounded-md border border-quasar-gray-light">
            {(leaduri.data ?? []).length === 0 ? (
              <p className="p-3 text-sm text-quasar-gray">
                {term.trim().length < 2 ? 'Scrie ca să cauți.' : 'Niciun rezultat.'}
              </p>
            ) : (
              (leaduri.data ?? []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLeadId(l.id)}
                  className={[
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm',
                    l.id === leadId ? 'bg-quasar-yellow/30' : 'hover:bg-quasar-gray-light',
                  ].join(' ')}
                >
                  <span>{[l.nume, l.prenume].filter(Boolean).join(' ')}</span>
                  <span className="text-xs text-quasar-gray">{l.telefon ?? '—'}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {mode === 'walkin' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nume" required htmlFor="wi-nume">
              <TextInput
                id="wi-nume"
                value={walkIn.nume}
                onChange={(e) => setWalkIn((p) => ({ ...p, nume: e.target.value }))}
              />
            </Field>
            <Field label="Prenume" htmlFor="wi-prenume">
              <TextInput
                id="wi-prenume"
                value={walkIn.prenume}
                onChange={(e) => setWalkIn((p) => ({ ...p, prenume: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Telefon" required htmlFor="wi-tel">
              <TextInput
                id="wi-tel"
                value={walkIn.telefon}
                placeholder="07…"
                onChange={(e) => setWalkIn((p) => ({ ...p, telefon: e.target.value }))}
              />
            </Field>
            <Field label="Vârstă" htmlFor="wi-varsta">
              <TextInput
                id="wi-varsta"
                type="number"
                min={0}
                value={walkIn.varsta}
                onChange={(e) => setWalkIn((p) => ({ ...p, varsta: e.target.value }))}
              />
            </Field>
            <Field label="Interes" htmlFor="wi-interes">
              <Select
                id="wi-interes"
                placeholder="—"
                options={INTERESE.map((i) => ({ value: i, label: i }))}
                value={walkIn.interes}
                onChange={(e) => setWalkIn((p) => ({ ...p, interes: e.target.value }))}
              />
            </Field>
          </div>
          <p className="text-xs text-quasar-gray">
            Se creează un lead nou în pipeline. Dacă numărul există deja, îl folosim
            pe acela — fără dublură.
          </p>
        </div>
      )}

      {mode === 'client' && (
        <Field label="Cursant" htmlFor="demo-client">
          <Combobox
            placeholder="Caută cursant (nume sau telefon)…"
            options={clienti.data ?? []}
            value={clientId}
            onChange={(id) => setClientId(id ?? '')}
          />
        </Field>
      )}

      <div className="mt-4">
        <Field label="Adus de (cursant) — opțional" htmlFor="demo-adus-de">
          <Combobox
            placeholder="Cine l-a adus…"
            options={clienti.data ?? []}
            value={adusDe}
            onChange={(id) => setAdusDe(id ?? '')}
          />
        </Field>
      </div>

      {plin && (
        <p className="mt-3 text-sm text-red-600">
          Clasa e completă.{' '}
          {poateSuprarezerva
            ? 'Poți înscrie peste capacitate.'
            : 'Cere unui manager să înscrie peste capacitate.'}
        </p>
      )}
      {info && <p className="mt-3 text-sm text-quasar-gray">{info}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  )
}
