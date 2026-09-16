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
import { createClient, createDocumentClient } from '@/features/clienti/api'
import { asiguraFamilieClient } from '@/features/familii/api'
import { TrimiteContractModal } from '@/features/contracte/TrimiteContractModal'
import {
  findMatchingClient,
  attachClientToLead,
  getLatestProgramareCurs,
  type CursSugerat,
  type MatchedClient,
} from './api'

export type ConversieResult = {
  clientId: string
  // Grupa doar SUGERATĂ de programare, nu aleasă: formularul de înrolare o
  // arată ca propunere de confirmat (vezi `CursSugerat`).
  sugestie: CursSugerat | null
  leadId: string
}

type Props = {
  open: boolean
  lead: Lead | null
  onClose: () => void
  onConverted: (result: ConversieResult) => void
}

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
  const [sugestie, setSugestie] = useState<CursSugerat | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Pasul 2 (după ce clientul a fost creat/legat): ce facem cu contractul.
  const [conversionResult, setConversionResult] = useState<ConversieResult | null>(null)
  const [showManualLink, setShowManualLink] = useState(false)
  const [manualLink, setManualLink] = useState('')
  const [preparingContract, setPreparingContract] = useState(false)
  // Clientul e deja salvat pe pasul 2 — ieșirea pe X/Escape ar lăsa un client
  // fără înrolare (fantomă în roster), deci o confirmăm explicit.
  const [confirmExit, setConfirmExit] = useState(false)
  const [contractFamilie, setContractFamilie] = useState<{ id: string; nume: string } | null>(
    null,
  )
  // Familia clientului, făcută odată cu fișa (nu doar dacă se trimite contractul pe loc).
  const [familieClient, setFamilieClient] = useState<{ id: string; nume: string } | null>(null)

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
    setSugestie(null)
    setError(null)
    setConversionResult(null)
    setShowManualLink(false)
    setManualLink('')
    setPreparingContract(false)
    setContractFamilie(null)
    setFamilieClient(null)
    setConfirmExit(false)
    // detecție duplicat + grupa sugerată de programare
    void findMatchingClient(lead).then((m) => {
      setMatched(m)
      setUseMerge(Boolean(m?.acelasiNume))
    })
    void getLatestProgramareCurs(lead.id).then(setSugestie)
  }, [open, lead])

  const mutation = useMutation({
    mutationFn: async (): Promise<
      ConversieResult & { familie: { id: string; nume: string } | null }
    > => {
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
        }
        const client = await createClient(dto)
        clientId = client.id
      }
      // Contractul e un rând în Documente, nu un câmp pe fișă. Bonus față de
      // varianta veche: acum se salvează și când leadul se leagă de un client
      // existent (înainte linkul se pierdea pe ramura de merge).
      const link = linkContract.trim()
      if (link) {
        await createDocumentClient({
          client: clientId,
          tip: 'Contract',
          link,
          observatii: 'Adăugat la conversia leadului.',
        })
      }
      await attachClientToLead(lead!.id, clientId)
      // Familia se face acum, nu doar la „Trimite contract": fără ea clientul nu putea
      // primi contract mai târziu. Leadul e deja legat, deci numele părintelui e găsit.
      let familie: { id: string; nume: string } | null = null
      try {
        const f = await asiguraFamilieClient(clientId)
        if (f.id) familie = { id: f.id, nume: f.nume ?? '' }
      } catch {
        // conversia nu pică din cauza familiei; se reîncearcă la „Trimite contract"
      }
      return { clientId, sugestie, leadId: lead!.id, familie }
    },
    onSuccess: (result) => {
      setFamilieClient(result.familie)
      void queryClient.invalidateQueries({ queryKey: ['familii'] })
      void queryClient.invalidateQueries({ queryKey: ['lookup', 'familii'] })
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['lookup', 'clienti'] })
      void queryClient.invalidateQueries({ queryKey: ['clienti'] })
      void queryClient.invalidateQueries({
        queryKey: ['documente-client', result.clientId],
      })
      setConversionResult(result)
      // Linkul din pasul 1 e deja salvat ca document. Precompletarea pasului 2
      // ar produce un al doilea rând identic în Documente (înainte era un
      // update peste aceeași valoare, deci trecea neobservat).
      setManualLink('')
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la conversie.')),
  })

  const saveLinkMut = useMutation({
    mutationFn: async () => {
      if (!conversionResult) return
      const trimmed = manualLink.trim()
      if (trimmed) {
        await createDocumentClient({
          client: conversionResult.clientId,
          tip: 'Contract',
          link: trimmed,
          observatii: 'Adăugat la conversia leadului.',
        })
      }
    },
    onSuccess: finish,
    onError: (e: unknown) => setError(humanizeError(e, 'Nu am putut salva linkul.')),
  })

  function finish() {
    if (!conversionResult) return
    void queryClient.invalidateQueries({ queryKey: ['client', conversionResult.clientId] })
    void queryClient.invalidateQueries({
      queryKey: ['documente-client', conversionResult.clientId],
    })
    onConverted(conversionResult)
    onClose()
  }

  function handleRequestClose() {
    if (conversionResult) {
      setConfirmExit(true)
      return
    }
    onClose()
  }

  async function handleTrimiteContract() {
    if (!conversionResult) return
    setError(null)
    setPreparingContract(true)
    try {
      let familie = familieClient
      if (!familie) {
        const f = await asiguraFamilieClient(conversionResult.clientId)
        if (!f.id) {
          throw new Error(
            f.motiv ?? 'Clientul nu are telefon sau email: linkul n-ar avea unde să plece.',
          )
        }
        familie = { id: f.id, nume: f.nume ?? '' }
        setFamilieClient(familie)
        void queryClient.invalidateQueries({ queryKey: ['lookup', 'familii'] })
        void queryClient.invalidateQueries({ queryKey: ['familii'] })
      }
      setContractFamilie(familie)
    } catch (e) {
      setError(humanizeError(e, 'Nu am putut pregăti familia pentru contract.'))
    } finally {
      setPreparingContract(false)
    }
  }

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
    <>
      <Modal
        open={open}
        title={conversionResult ? 'Client salvat — contract' : 'Finalizare înscriere'}
        onClose={handleRequestClose}
        footer={
          confirmExit ? (
            <>
              <Button variant="ghost" onClick={() => setConfirmExit(false)}>
                Înapoi
              </Button>
              <Button variant="danger" onClick={onClose}>
                Ies fără înrolare
              </Button>
            </>
          ) : conversionResult ? (
            <Button variant="secondary" onClick={finish}>
              Continuă la înrolare →
            </Button>
          ) : (
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
          )
        }
      >
        {confirmExit ? (
          <p className="text-sm">
            Clientul <strong>e deja salvat</strong>. Dacă ieși acum, rămâne fără înrolare
            — nu apare în nicio grupă și nu are ce plăti.
          </p>
        ) : conversionResult ? (
          <div className="space-y-3">
            <p className="text-sm text-quasar-gray">
              Clientul a fost salvat. Contractul e opțional — poți continua și fără el.
            </p>

            <div className="flex flex-col gap-2">
              <div>
                <Button
                  className="w-full"
                  onClick={handleTrimiteContract}
                  disabled={preparingContract}
                >
                  {preparingContract ? 'Se pregătește…' : 'Trimite contract prin Contracte'}
                </Button>
                <p className="mt-1 text-xs text-quasar-gray">
                  Trimite părintelui un link de semnat, prin SMS.
                </p>
              </div>

              {!showManualLink ? (
                <div>
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => setShowManualLink(true)}
                  >
                    Am deja un link (adaugă manual)
                  </Button>
                  <p className="mt-1 text-xs text-quasar-gray">
                    Salvează un link existent în Documente, fără SMS.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 rounded-md border border-quasar-gray/30 p-3">
                  <Field label="Link contract" htmlFor="conv-manual-link">
                    <TextInput
                      id="conv-manual-link"
                      value={manualLink}
                      onChange={(e) => setManualLink(e.target.value)}
                      placeholder="Link esemneaza.ro / drive…"
                    />
                  </Field>
                  <Button
                    onClick={() => saveLinkMut.mutate()}
                    disabled={saveLinkMut.isPending}
                  >
                    {saveLinkMut.isPending ? 'Se salvează…' : 'Salvează și continuă'}
                  </Button>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          <form id="conversie-form" onSubmit={handleSubmit} className="space-y-3">
            {matched && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p>
                  {matched.acelasiNume
                    ? 'Există deja un client cu acest nume și telefon/email: '
                    : 'Același telefon/email îl are clientul '}
                  <strong>
                    {[matched.prenume, matched.nume].filter(Boolean).join(' ')}
                  </strong>
                  {matched.acelasiNume
                    ? '.'
                    : ' — dacă e frate/soră, creează client nou.'}
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
                      picker="wheel"
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
              {sugestie ? ', cu grupa din programare propusă spre confirmare' : ''}.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        )}
      </Modal>

      {contractFamilie && (
        <TrimiteContractModal
          open
          familieId={contractFamilie.id}
          familieNume={contractFamilie.nume}
          onClose={() => {
            setContractFamilie(null)
            finish()
          }}
        />
      )}
    </>
  )
}
