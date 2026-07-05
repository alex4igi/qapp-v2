import { humanizeError } from '@/lib/errorMessage'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal, Spinner } from '@/components/ui'
import { SimpleIncasareForm } from '@/features/plati/SimpleIncasareForm'
import {
  listCampanieClientiCurs,
  recordTaxaRezervare,
  setActAditionalManual,
  approveActAditional,
  rejectActAditional,
  type CampanieReinscriere,
  type CampanieCursRow,
  type CampanieClientRow,
} from '../api'

// Modal per curs: porțile (taxă + act) pentru fiecare client eligibil.
export function CampanieCursModal({
  campanie,
  curs,
  canApprove,
  onClose,
  onChange,
}: {
  campanie: CampanieReinscriere
  curs: CampanieCursRow
  canApprove: boolean
  onClose: () => void
  onChange: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [taxaFor, setTaxaFor] = useState<CampanieClientRow | null>(null)
  const [actFor, setActFor] = useState<CampanieClientRow | null>(null)
  const [actLink, setActLink] = useState('')

  const clientiQ = useQuery({
    queryKey: ['campanie', 'clienti', campanie.id, curs.curs_id],
    queryFn: () => listCampanieClientiCurs(campanie.id, curs.curs_id),
  })

  const refresh = () => {
    void clientiQ.refetch()
    onChange()
  }

  const taxa = useMutation({
    mutationFn: (input: { clientId: string; incasareId: string }) =>
      recordTaxaRezervare({
        campanieId: campanie.id,
        clientId: input.clientId,
        cursTintaId: curs.curs_id,
        incasareId: input.incasareId,
      }),
    onSuccess: refresh,
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la taxă.')),
  })

  const act = useMutation({
    mutationFn: (input: { clientId: string; link: string }) =>
      setActAditionalManual({
        campanieId: campanie.id,
        clientId: input.clientId,
        cursTintaId: curs.curs_id,
        documentLink: input.link,
      }),
    onSuccess: () => {
      setActFor(null)
      setActLink('')
      refresh()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la act adițional.')),
  })

  const approve = useMutation({
    mutationFn: (clientId: string) =>
      approveActAditional({
        campanieId: campanie.id,
        clientId,
        cursTintaId: curs.curs_id,
      }),
    onSuccess: refresh,
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la aprobare.')),
  })

  const reject = useMutation({
    mutationFn: (clientId: string) =>
      rejectActAditional({
        campanieId: campanie.id,
        clientId,
        cursTintaId: curs.curs_id,
      }),
    onSuccess: refresh,
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la respingere.')),
  })

  return (
    <Modal
      open
      title={`Reînscrieri — ${curs.curs_nume}`}
      onClose={onClose}
      size="lg"
      footer={<Button onClick={onClose}>Închide</Button>}
    >
      {clientiQ.isLoading ? (
        <Spinner />
      ) : (clientiQ.data ?? []).length === 0 ? (
        <p className="text-sm text-quasar-gray">
          Niciun client eligibil pe acest curs.
        </p>
      ) : (
        <ul className="divide-y divide-quasar-gray/30">
          {(clientiQ.data ?? []).map((c) => {
            const taxaDone = Boolean(c.taxa_platita_la)
            const actVerificat = c.act_status === 'verificat'
            // semnat electronic în app = intră tot la verificare admin
            const semnatInApp = c.act_status === 'semnat' && c.act_canal === 'app'
            const actDeVerificat = c.act_status === 'de_verificat' || semnatInApp
            const reinscris = Boolean(c.activat_la)
            return (
              <li key={c.client_id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">
                      {c.nume} {c.prenume ?? ''}
                    </span>
                    {c.telefon && (
                      <span className="ml-2 text-quasar-gray">{c.telefon}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Poarta 1: taxă */}
                    {taxaDone ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                        ✓ Taxă
                      </span>
                    ) : (
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => setTaxaFor(c)}
                      >
                        Taxă
                      </Button>
                    )}
                    {/* Poarta 2: act adițional */}
                    {actVerificat ? (
                      c.document_link ? (
                        <a
                          href={c.document_link}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800 underline"
                        >
                          ✓ Act verificat
                        </a>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                          ✓ Act verificat
                        </span>
                      )
                    ) : actDeVerificat ? (
                      <div className="flex items-center gap-1">
                        {semnatInApp && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                            Semnat în app
                          </span>
                        )}
                        {c.document_link && (
                          <a
                            href={c.document_link}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 underline"
                          >
                            Deschide
                          </a>
                        )}
                        {canApprove ? (
                          <>
                            <Button
                              className="text-xs"
                              onClick={() => approve.mutate(c.client_id)}
                              disabled={approve.isPending}
                            >
                              Aprobă
                            </Button>
                            <Button
                              className="text-xs"
                              variant="secondary"
                              onClick={() => reject.mutate(c.client_id)}
                              disabled={reject.isPending}
                            >
                              Respinge
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-amber-700">
                            așteaptă admin
                          </span>
                        )}
                      </div>
                    ) : c.act_status === 'trimis' ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        Trimis
                      </span>
                    ) : (
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => {
                          setActFor(c)
                          setActLink(c.document_link ?? '')
                        }}
                      >
                        Act (link)
                      </Button>
                    )}
                    {/* Rezultat */}
                    {reinscris && (
                      <span className="rounded-full bg-quasar-yellow px-2 py-0.5 text-xs font-bold text-quasar-black">
                        ✓ Reînscris
                      </span>
                    )}
                  </div>
                </div>

                {/* Input inline pentru link act adițional manual (intră ca „de verificat") */}
                {actFor?.client_id === c.client_id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      className="flex-1 rounded border border-quasar-gray-light px-2 py-1 text-sm"
                      placeholder="Link esemneaza.ro / Google Drive (document semnat)…"
                      value={actLink}
                      onChange={(e) => setActLink(e.target.value)}
                    />
                    <Button
                      className="text-xs"
                      onClick={() =>
                        act.mutate({ clientId: c.client_id, link: actLink })
                      }
                      disabled={act.isPending || !actLink.trim()}
                    >
                      Salvează
                    </Button>
                    <Button
                      className="text-xs"
                      variant="secondary"
                      onClick={() => {
                        setActFor(null)
                        setActLink('')
                      }}
                    >
                      Anulează
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Modal taxă de rezervare (reutilizează formularul Plată nouă → Taxa) */}
      {taxaFor && (
        <Modal
          open
          title={`Taxă de rezervare — ${taxaFor.nume} ${taxaFor.prenume ?? ''}`}
          onClose={() => setTaxaFor(null)}
          size="lg"
        >
          <SimpleIncasareForm
            tip="Taxa"
            defaultClientId={taxaFor.client_id}
            defaultSuma={String(campanie.taxa_rezervare)}
            defaultObservatii={`Taxă rezervare reînscriere — ${curs.curs_nume}`}
            onCreated={(inc) => {
              const clientId = taxaFor.client_id
              setTaxaFor(null)
              void queryClient.invalidateQueries({ queryKey: ['plati'] })
              taxa.mutate({ clientId, incasareId: inc.id })
            }}
            onClose={() => setTaxaFor(null)}
          />
        </Modal>
      )}
    </Modal>
  )
}
