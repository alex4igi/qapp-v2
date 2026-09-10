import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Modal, Select, Spinner } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import {
  listCampaniiDeschise,
  listTargetsCampanie,
  listTemplates,
  sendContracte,
  type CampanieTarget,
} from './api'
import { CONTRACT_TIP_LABEL } from './constants'

const BATCH_SIZE = 20

type Props = { open: boolean; onClose: () => void }

// Bulk send pe campania de reînscriere: un act adițional per copil eligibil
// (leagă contractul de poarta campaniei — la semnare intră în verificarea admin).
export function TrimiteBulkModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [campanieId, setCampanieId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<
    { ok: number; skip: number; sms: number; email: number; netrimise: number; errors: string[] } | null
  >(null)

  const { data: campanii } = useQuery({
    queryKey: ['campanii-deschise'],
    queryFn: listCampaniiDeschise,
    enabled: open,
  })
  const { data: templates } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: listTemplates,
    enabled: open,
  })
  const { data: targets, isFetching } = useQuery({
    queryKey: ['campanie-targets', campanieId],
    queryFn: () => listTargetsCampanie(campanieId),
    enabled: open && !!campanieId,
  })

  // trimitem doar unde actul nu e semnat/în verificare și nu există deja contract activ.
  // Canal unic: SMS dacă familia are telefon, altfel email — deci e destul un canal.
  const { deTrimis, faraContact, dejaInLucru } = useMemo(() => {
    const rows = targets ?? []
    const eligibleStatus = (t: CampanieTarget) =>
      ['nesemnat', 'trimis', 'expirat', 'anulat'].includes(t.act_status)
    const areCanal = (t: CampanieTarget) => !!t.telefon || !!t.email
    const deTrimis = rows.filter(
      (t) => eligibleStatus(t) && !t.are_contract && t.familie_id && areCanal(t),
    )
    const faraContact = rows.filter(
      (t) => eligibleStatus(t) && !t.are_contract && (!t.familie_id || !areCanal(t)),
    )
    const dejaInLucru = rows.length - deTrimis.length - faraContact.length
    return { deTrimis, faraContact, dejaInLucru }
  }, [targets])

  const send = useMutation({
    mutationFn: async () => {
      let ok = 0
      let sms = 0
      let email = 0
      let netrimise = 0
      const errors: string[] = []
      for (let i = 0; i < deTrimis.length; i += BATCH_SIZE) {
        const batch = deTrimis.slice(i, i + BATCH_SIZE)
        setProgress(`Se trimite… ${Math.min(i + BATCH_SIZE, deTrimis.length)}/${deTrimis.length}`)
        const results = await sendContracte({
          templateId,
          targets: batch.map((t) => ({
            familieId: t.familie_id!,
            clientId: t.client_id,
            campanieId,
            cursTintaId: t.curs_tinta_id,
          })),
        })
        for (const r of results) {
          if (!r.ok) {
            if (r.error) errors.push(r.error)
            continue
          }
          ok++
          if (!r.notificat && !r.amanat) {
            netrimise++
            if (r.notificareEroare) errors.push(r.notificareEroare)
          } else if (r.canal === 'email') email++
          else sms++
        }
      }
      return { ok, skip: faraContact.length, sms, email, netrimise, errors: errors.slice(0, 5) }
    },
    onSuccess: (r) => {
      setProgress(null)
      setResult(r)
      queryClient.invalidateQueries({ queryKey: ['contracte'] })
      queryClient.invalidateQueries({ queryKey: ['campanie-targets', campanieId] })
    },
    onError: (e) => {
      setProgress(null)
      setResult({ ok: 0, skip: 0, sms: 0, email: 0, netrimise: 0, errors: [humanizeError(e)] })
    },
  })

  function close() {
    setResult(null)
    setProgress(null)
    setCampanieId('')
    send.reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Trimite în bulk — campanie reînscriere" size="lg">
      <div className="space-y-4">
        <Field label="Campania">
          <Select
            value={campanieId}
            onChange={(e) => setCampanieId(e.target.value)}
            placeholder="Alege campania…"
            options={(campanii ?? []).map((c) => ({ value: c.id, label: c.nume }))}
          />
        </Field>
        <Field label="Template act adițional">
          <Select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Alege template…"
            options={(templates ?? [])
              .filter((t) => t.tip === 'act_aditional')
              .map((t) => ({
                value: t.id,
                label: `${t.nume} (${CONTRACT_TIP_LABEL[t.tip] ?? t.tip})`,
              }))}
          />
        </Field>

        {campanieId && (isFetching ? (
          <Spinner />
        ) : (
          <div className="rounded-lg border border-line bg-surface p-3 text-sm space-y-1">
            <p>
              <span className="font-semibold">{deTrimis.length}</span> contracte de trimis
              (un act per copil eligibil, nesemnat, fără contract activ) —{' '}
              {deTrimis.filter((t) => t.telefon).length} prin SMS,{' '}
              {deTrimis.filter((t) => !t.telefon).length} prin email
            </p>
            {dejaInLucru > 0 && (
              <p className="text-muted-2">{dejaInLucru} deja semnate / în lucru — sărite</p>
            )}
            {faraContact.length > 0 && (
              <p className="text-amber-700">
                ⚠️ {faraContact.length} fără familie, telefon și email — nu pot primi link:{' '}
                {faraContact.slice(0, 5).map((t) => t.client_nume).join(', ')}
                {faraContact.length > 5 ? '…' : ''}
              </p>
            )}
          </div>
        ))}

        {progress && <p className="text-sm text-muted-2">{progress}</p>}
        {result && (
          <div className="text-sm space-y-1">
            <p className="font-medium text-green-700">
              ✓ {result.ok} contracte create — {result.sms} pe SMS, {result.email} pe email
            </p>
            {result.netrimise > 0 && (
              <p className="text-red-600">
                ⚠️ {result.netrimise} create dar NEnotificate — trimite linkul manual
              </p>
            )}
            {result.skip > 0 && (
              <p className="text-amber-700">{result.skip} sărite (fără telefon și email)</p>
            )}
            {result.errors.map((e, i) => (
              <p key={i} className="text-red-600">{e}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Închide</Button>
          <Button
            onClick={() => send.mutate()}
            disabled={!campanieId || !templateId || deTrimis.length === 0 || send.isPending}
          >
            {send.isPending ? 'Se trimite…' : `Trimite ${deTrimis.length} contracte`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
