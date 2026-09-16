import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Checkbox, Field, Modal, Select, Spinner, TextInput } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import {
  asiguraFamilieClient,
  getFamilieMembers,
  listFamilii,
} from '@/features/familii/api'
import {
  searchClientiPentruContract,
  type ClientPentruContract,
} from '@/features/clienti/api'
import { calcAge } from '@/features/clienti/pages/ClientProfilePage/helpers'
import { listTemplates, mesajRetrimitere, retrimiteLink, sendContracte } from './api'
import { CONTRACT_TIP_LABEL } from './constants'

type Props = {
  open: boolean
  onClose: () => void
  // precompletare când modalul e deschis de pe profilul unei familii
  familieId?: string
  familieNume?: string
  // precompletare când modalul e deschis de pe fișa unui client
  client?: ClientPentruContract
}

type Familie = { id: string; nume: string }

const numeClient = (c: Pick<ClientPentruContract, 'nume' | 'prenume'>) =>
  `${c.nume} ${c.prenume ?? ''}`.trim()

export function TrimiteContractModal({ open, onClose, familieId, familieNume, client }: Props) {
  const queryClient = useQueryClient()
  const blocat = Boolean(familieId || client)
  const [templateId, setTemplateId] = useState('')
  const [search, setSearch] = useState('')
  const [selFamilie, setSelFamilie] = useState<Familie | null>(() => {
    if (familieId) return { id: familieId, nume: familieNume ?? '' }
    if (client?.familia) return { id: client.familia, nume: client.familii?.nume_familie ?? '' }
    return null
  })
  // Clientul ales n-are familie: contractul pleacă doar după ce adultul devine
  // reprezentantul propriei familii (creată la trimitere).
  const [faraFamilie, setFaraFamilie] = useState<ClientPentruContract | null>(
    client && !client.familia ? client : null,
  )
  const [seReprezintaSingur, setSeReprezintaSingur] = useState(true)
  const [clientId, setClientId] = useState(client?.id ?? '')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  // contractul nesemnat care a blocat trimiterea ca dublură — i se poate retrimite
  // linkul, cât timp selecția (șablon + familie + cursant) e tot cea refuzată
  const [dublura, setDublura] = useState<{ contractId: string; cheie: string } | null>(null)
  const cheieSelectie = `${templateId}|${selFamilie?.id ?? ''}|${clientId}`
  const deRetrimis = dublura?.cheie === cheieSelectie ? dublura.contractId : null

  const cautare = open && !selFamilie && !faraFamilie && search.trim().length >= 2

  const { data: templates } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: listTemplates,
    enabled: open,
  })

  const { data: familii, isFetching: searchingFamilii } = useQuery({
    queryKey: ['familii-search', search],
    queryFn: () => listFamilii({ search, page: 0 }),
    enabled: cautare,
  })

  const { data: clienti, isFetching: searchingClienti } = useQuery({
    queryKey: ['clienti-search-contract', search],
    queryFn: () => searchClientiPentruContract(search),
    enabled: cautare,
  })

  const { data: membri } = useQuery({
    queryKey: ['familie-membri', selFamilie?.id],
    queryFn: () => getFamilieMembers(selFamilie!.id),
    enabled: open && !!selFamilie,
  })

  const templateOptions = useMemo(
    () =>
      (templates ?? []).map((t) => ({
        value: t.id,
        label: `${t.nume} (${CONTRACT_TIP_LABEL[t.tip] ?? t.tip})`,
      })),
    [templates],
  )

  const varsta = faraFamilie ? calcAge(faraFamilie.data_nasterii) : null
  const contactFaraFamilie = faraFamilie
    ? faraFamilie.telefon
      ? `prin SMS la ${faraFamilie.telefon}`
      : faraFamilie.email
        ? `pe email la ${faraFamilie.email}`
        : null
    : null
  // Minorul și cel fără dată de naștere primesc familia lor la trimitere (părintele își
  // completează numele la semnare); adultul doar dacă se reprezintă singur.
  const poateCreaFamilia =
    !!faraFamilie && !!contactFaraFamilie && (varsta === null || varsta < 18 || seReprezintaSingur)

  const send = useMutation({
    mutationFn: async () => {
      let familie = selFamilie
      let vizat = clientId || null
      let familieCreata: string | null = null
      if (!familie && faraFamilie) {
        const f = await asiguraFamilieClient(faraFamilie.id)
        if (!f.id) throw new Error(f.motiv ?? 'Familia nu a putut fi pregătită.')
        familie = { id: f.id, nume: f.nume ?? '' }
        vizat = faraFamilie.id
        familieCreata =
          f.actiune === 'ataseaza'
            ? `Adăugat în familia „${familie.nume}”. `
            : f.actiune === 'are_familie'
              ? ''
              : `Familia „${familie.nume}” a fost creată. `
        // de-acum clientul are familie: o retrimitere după o eroare nu o mai creează
        setSelFamilie(familie)
        setClientId(faraFamilie.id)
        setFaraFamilie(null)
        void queryClient.invalidateQueries({ queryKey: ['lookup', 'familii'] })
        void queryClient.invalidateQueries({ queryKey: ['familii'] })
        void queryClient.invalidateQueries({ queryKey: ['client', faraFamilie.id] })
        void queryClient.invalidateQueries({ queryKey: ['client-familia'] })
      }
      const results = await sendContracte({
        templateId,
        targets: [{ familieId: familie!.id, clientId: vizat }],
      })
      return { r: results[0], familieCreata, cheie: `${templateId}|${familie!.id}|${vizat ?? ''}` }
    },
    onSuccess: ({ r, familieCreata, cheie }) => {
      const prefix = familieCreata ?? ''
      if (!r?.ok) {
        const nesemnat = ['trimis', 'deschis'].includes(r?.statusExistent ?? '')
        setDublura(nesemnat && r?.contractId ? { contractId: r.contractId, cheie } : null)
        setResult({
          ok: false,
          text: nesemnat
            ? `${prefix}Familia are deja acest contract trimis și nesemnat. Retrimite-i același link — valabilitatea pornește de azi.`
            : `${prefix}Nu s-a putut trimite: ${r?.error ?? 'eroare necunoscută'}`,
        })
        return
      }
      queryClient.invalidateQueries({ queryKey: ['contracte'] })
      const canal = r.canal === 'email' ? 'email' : 'SMS'
      if (r.amanat) {
        setResult({
          ok: true,
          text: `${prefix}Contractul e creat. SMS-ul a prins zona interzisă — pleacă automat dimineață.`,
        })
      } else if (r.notificat) {
        setResult({ ok: true, text: `${prefix}Linkul de semnare a fost trimis prin ${canal}.` })
      } else {
        setResult({
          ok: false,
          text: `${prefix}Contractul e creat, dar linkul NU a plecat (${canal}): ${
            r.notificareEroare ?? 'eroare necunoscută'
          }. Trimite-l manual.`,
        })
      }
    },
    onError: (e) => setResult({ ok: false, text: humanizeError(e) }),
  })

  const retrimite = useMutation({
    mutationFn: retrimiteLink,
    onSuccess: (r) => {
      setDublura(null)
      setResult(mesajRetrimitere(r))
      queryClient.invalidateQueries({ queryKey: ['contracte'] })
    },
    onError: (e) => setResult({ ok: false, text: humanizeError(e) }),
  })

  function alegeClient(c: ClientPentruContract) {
    if (c.familia) {
      setSelFamilie({ id: c.familia, nume: c.familii?.nume_familie ?? '' })
      setClientId(c.id)
    } else {
      setFaraFamilie(c)
      setSeReprezintaSingur(true)
    }
  }

  function schimba() {
    setSelFamilie(null)
    setFaraFamilie(null)
    setClientId('')
    setResult(null)
  }

  function close() {
    setResult(null)
    setSearch('')
    if (!blocat) {
      setSelFamilie(null)
      setFaraFamilie(null)
      setClientId('')
    }
    send.reset()
    onClose()
  }

  const searching = searchingFamilii || searchingClienti
  const areRezultate = (familii?.rows.length ?? 0) > 0 || (clienti?.length ?? 0) > 0

  return (
    <Modal open={open} onClose={close} title="Trimite contract la semnat">
      <div className="space-y-4">
        <Field label="Template">
          <Select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Alege template…"
            options={templateOptions}
          />
        </Field>

        <Field label="Către">
          {selFamilie ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">{selFamilie.nume || 'Familie selectată'}</span>
              {!blocat && (
                <Button variant="ghost" onClick={schimba}>
                  Schimbă
                </Button>
              )}
            </div>
          ) : faraFamilie ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{numeClient(faraFamilie)}</span>
                <Badge tone="warn">fără familie</Badge>
                {!blocat && (
                  <Button variant="ghost" onClick={schimba}>
                    Schimbă
                  </Button>
                )}
              </div>
              {varsta === null || varsta < 18 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {varsta === null ? 'Fișa nu are data nașterii' : `E minor (${varsta} ani)`}:{' '}
                  {contactFaraFamilie
                    ? `la trimitere i se creează familia „${faraFamilie.nume}” din contactul de pe fișă, iar linkul pleacă ${contactFaraFamilie}. Părintele își completează numele la semnare.`
                    : 'fișa nu are nici telefon, nici email, linkul n-ar avea unde să plece.'}{' '}
                  <Link to={`/clienti/${faraFamilie.id}`} className="underline" onClick={close}>
                    Deschide fișa
                  </Link>
                </p>
              ) : (
                <div className="space-y-1">
                  <Checkbox
                    id="contract-se-reprezinta-singur"
                    label="Clientul e major și se reprezintă singur (semnează el contractul)"
                    checked={seReprezintaSingur}
                    onChange={(e) => setSeReprezintaSingur(e.target.checked)}
                  />
                  <p className="ml-6 text-xs text-muted-2">
                    {!seReprezintaSingur
                      ? 'Fără bifă, adaugă întâi familia din fișa clientului.'
                      : faraFamilie.telefon
                        ? `La trimitere se creează familia lui, iar linkul pleacă prin SMS la ${faraFamilie.telefon}.`
                        : faraFamilie.email
                          ? `La trimitere se creează familia lui, iar linkul pleacă pe email la ${faraFamilie.email}.`
                          : 'Fișa nu are nici telefon, nici email: linkul n-ar avea unde să plece.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Caută familie sau client — nume, telefon, email…"
              />
              {searching && <Spinner />}
              {cautare && !searching && !areRezultate && (
                <p className="text-sm text-muted-2">Nimic găsit.</p>
              )}
              {areRezultate && (
                <div className="max-h-64 overflow-auto rounded border border-quasar-gray/30">
                  {(familii?.rows.length ?? 0) > 0 && (
                    <>
                      <p className="bg-surface px-3 py-1 text-xs font-medium uppercase text-muted-2">
                        Familii
                      </p>
                      <ul className="divide-y divide-quasar-gray/20">
                        {familii!.rows.map((f) => (
                          <li key={f.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-quasar-yellow/10"
                              onClick={() =>
                                setSelFamilie({ id: f.id, nume: f.nume_familie ?? '' })
                              }
                            >
                              <span className="font-medium">{f.nume_familie}</span>
                              {f.telefon && (
                                <span className="ml-2 text-sm text-quasar-gray">{f.telefon}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {(clienti?.length ?? 0) > 0 && (
                    <>
                      <p className="bg-surface px-3 py-1 text-xs font-medium uppercase text-muted-2">
                        Clienți
                      </p>
                      <ul className="divide-y divide-quasar-gray/20">
                        {clienti!.map((c) => {
                          const ani = calcAge(c.data_nasterii)
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="flex w-full flex-wrap items-center gap-x-2 px-3 py-2 text-left hover:bg-quasar-yellow/10"
                                onClick={() => alegeClient(c)}
                              >
                                <span className="font-medium">{numeClient(c)}</span>
                                {ani !== null && (
                                  <span className="text-sm text-quasar-gray">{ani} ani</span>
                                )}
                                {c.familia ? (
                                  <span className="text-sm text-muted-2">
                                    fam. {c.familii?.nume_familie}
                                  </span>
                                ) : (
                                  <Badge tone="warn">fără familie</Badge>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </Field>

        {selFamilie && (
          <Field label="Cursant vizat (opțional — implicit toți membrii familiei)">
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={[
                { value: '', label: 'Toți membrii' },
                ...(membri ?? []).map((m) => ({
                  value: m.id,
                  label: `${m.nume} ${m.prenume ?? ''}`.trim(),
                })),
              ]}
            />
          </Field>
        )}

        {result && (
          <p className={result.ok ? 'text-green-700 text-sm' : 'text-red-600 text-sm'}>
            {result.text}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Închide
          </Button>
          {deRetrimis ? (
            <Button onClick={() => retrimite.mutate(deRetrimis)} disabled={retrimite.isPending}>
              {retrimite.isPending ? 'Se retrimite…' : 'Retrimite link'}
            </Button>
          ) : (
            <Button
              onClick={() => send.mutate()}
              disabled={!templateId || !(selFamilie || poateCreaFamilia) || send.isPending}
            >
              {send.isPending ? 'Se trimite…' : 'Trimite la semnat'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
