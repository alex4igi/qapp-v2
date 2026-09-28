import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Combobox } from '@/components/ui'
import { clientiOptions } from '@/lib/lookups'
import { humanizeError } from '@/lib/errorMessage'
import { formatDate } from '@/lib/format'
import { inputStyle, sectionLabel, L, selectStyle } from '@/features/leads/LeadModal/styles'
import {
  STATUS_LABEL,
  anuleazaRecomandare,
  atribuieRecomandare,
  getCampanieActiva,
  getRecomandareLead,
  type StatusRecomandare,
} from '../api'

const TONE: Record<StatusRecomandare, 'neutral' | 'warn' | 'success' | 'danger' | 'brand'> = {
  declarat: 'warn',
  verificat: 'brand',
  proba: 'brand',
  inrolat: 'brand',
  eligibil: 'warn',
  recompensat: 'success',
  anulat: 'danger',
}

type Props = { leadId: string; canEdit: boolean; canCancel: boolean }

// Recepția leagă invitatul de familia care l-a invitat ÎNAINTE de ora gratuită.
// Creditul se acordă singur la plata integrală a primei luni (evalueaza_recomandare).
export function RecomandareLeadSection({ leadId, canEdit, canCancel }: Props) {
  const qc = useQueryClient()
  const recQ = useQuery({ queryKey: ['recomandare', 'lead', leadId], queryFn: () => getRecomandareLead(leadId) })
  const campQ = useQuery({ queryKey: ['recomandari', 'campanie'], queryFn: getCampanieActiva, staleTime: 300_000 })
  const [deschis, setDeschis] = useState(false)
  const [client, setClient] = useState('')
  const [numeDeclarat, setNumeDeclarat] = useState('')
  const [canal, setCanal] = useState<'telefon' | 'receptie'>('telefon')
  const [error, setError] = useState<string | null>(null)
  const clienti = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
    enabled: deschis,
    staleTime: 300_000,
  })

  const rec = recQ.data
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['recomandare', 'lead', leadId] })
    void qc.invalidateQueries({ queryKey: ['recomandari'] })
  }

  const salveaza = useMutation({
    mutationFn: () =>
      atribuieRecomandare({
        leadId,
        clientRecomandator: client || null,
        numeDeclarat: numeDeclarat || null,
        canal: rec?.canal === 'site' ? 'site' : canal,
      }),
    onSuccess: () => {
      setDeschis(false)
      setError(null)
      refresh()
    },
    onError: (e) => setError(humanizeError(e)),
  })

  const anuleaza = useMutation({
    mutationFn: (motiv: string) => anuleazaRecomandare(rec!.id, motiv),
    onSuccess: refresh,
    onError: (e) => setError(humanizeError(e)),
  })

  if (recQ.isLoading) return null
  const campanieActiva = campQ.data?.activa === true
  if (!rec && !campanieActiva) return null

  const blocat = rec?.status === 'recompensat' || rec?.status === 'anulat'
  const recomandator = rec?.recomandator
    ? `${rec.recomandator.prenume ?? ''} ${rec.recomandator.nume}`.trim()
    : null

  return (
    <div style={{ marginTop: '18px', border: '1px solid #E4E0D7', borderRadius: '12px', padding: '14px 16px', background: '#FFFCEB' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
        <div style={sectionLabel}>Recomandare{rec?.campanie ? ` · ${rec.campanie.nume}` : ''}</div>
        {rec && <Badge tone={TONE[rec.status]}>{STATUS_LABEL[rec.status]}</Badge>}
      </div>

      {rec ? (
        <div style={{ marginTop: '10px', fontSize: '13px', lineHeight: 1.55 }}>
          {rec.nume_declarat && (
            <div>
              A declarat: <strong>„{rec.nume_declarat}”</strong>
              <span style={{ color: 'var(--color-muted)' }}> · {rec.canal === 'site' ? 'formular site' : rec.canal}</span>
            </div>
          )}
          {recomandator ? (
            <div>
              Invitat de <strong>{recomandator}</strong>
              {rec.familie && <> — familia <strong>{rec.familie.nume_familie}</strong></>}
            </div>
          ) : (
            <div style={{ color: '#9A5B00' }}>
              ⚠️ Confirmă cine l-a invitat înainte de ora gratuită — fără familie confirmată creditul nu se acordă.
            </div>
          )}
          {rec.status === 'eligibil' && !recomandator && (
            <div style={{ color: '#9A5B00' }}>A achitat prima lună: confirmă familia și creditul se acordă imediat.</div>
          )}
          {rec.status === 'eligibil' && recomandator && (
            <div style={{ color: '#9A5B00' }}>
              A achitat, dar lipsește prezența la ora gratuită (bifa „A venit” sau prezența din roster).
            </div>
          )}
          {rec.status === 'anulat' && rec.motiv_anulare && (
            <div style={{ color: 'var(--color-muted)' }}>Motiv: {rec.motiv_anulare}</div>
          )}
          {rec.campanie && !blocat && (
            <div style={{ color: 'var(--color-muted)', fontSize: '12px' }}>
              Proba, înscrierea și plata primei luni întregi până pe {formatDate(rec.campanie.data_limita)}.
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-muted)' }}>
          L-a invitat un cursant Quasar? Leagă-l de familia lui — familia primește {campQ.data?.recompensa_lei ?? 60} lei
          credit după ce invitatul achită prima lună.
        </div>
      )}

      {canEdit && !blocat && !deschis && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <Button variant="secondary" onClick={() => { setDeschis(true); setClient(rec?.client_recomandator ?? '') }}>
            {rec ? (recomandator ? 'Schimbă cine l-a invitat' : 'Confirmă cine l-a invitat') : 'Adaugă recomandare'}
          </Button>
          {rec && canCancel && (
            <Button
              variant="ghost"
              onClick={() => {
                const motiv = window.prompt('Motivul anulării recomandării:')
                if (motiv?.trim()) anuleaza.mutate(motiv.trim())
              }}
            >
              Anulează
            </Button>
          )}
        </div>
      )}

      {deschis && (
        <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
          {!rec && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <L>Ce a spus („Cine te-a invitat?”)</L>
                <input className="qf" style={inputStyle} value={numeDeclarat} onChange={(e) => setNumeDeclarat(e.target.value)} placeholder="ex. Maria de la Teens" />
              </div>
              <div>
                <L>Canal</L>
                <select className="qf" style={selectStyle} value={canal} onChange={(e) => setCanal(e.target.value as typeof canal)}>
                  <option value="telefon">Telefon</option>
                  <option value="receptie">Direct la recepție</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <L>Cursantul care l-a invitat</L>
            <Combobox
              placeholder="Caută cursant (nume sau telefon)…"
              options={clienti.data ?? []}
              value={client}
              onChange={(id) => setClient(id ?? '')}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => salveaza.mutate()} disabled={salveaza.isPending || (!client && !numeDeclarat)}>
              {salveaza.isPending ? 'Se salvează…' : 'Salvează'}
            </Button>
            <Button variant="ghost" onClick={() => setDeschis(false)}>Renunță</Button>
          </div>
        </div>
      )}
      {error && <div style={{ marginTop: '8px', fontSize: '13px', color: '#C2403F' }}>{error}</div>}
    </div>
  )
}
