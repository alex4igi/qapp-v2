import type { LeadForm } from '../../api'
import { inputStyle, sectionLabel, L } from '../styles'

export type DupHit = { id: string; name: string; isNurture: boolean }

type Props = {
  form: LeadForm
  set: <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => void
  dupHit: DupHit | null
  onTelefonChange: (v: string) => void
  onTelefonBlur: (v: string) => void
  onReactivate: (id: string) => void
  reactivatePending: boolean
}

// Secțiunea „Date contact": identitate + telefon cu detecție de duplicat
// (inclusiv reactivarea directă din Nurture).
export function DateContactSection({
  form,
  set,
  dupHit,
  onTelefonChange,
  onTelefonBlur,
  onReactivate,
  reactivatePending,
}: Props) {
  return (
    <>
      <div style={{ ...sectionLabel, marginTop: '22px' }}>Date contact</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px', marginTop: '11px' }}>
        <div>
          <L>Prenume</L>
          <input className="qf" value={form.prenume} onChange={(e) => set('prenume', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <L req>Nume</L>
          <input className="qf" value={form.nume} onChange={(e) => set('nume', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <L req>Telefon</L>
          <input className="qf" value={form.telefon} onChange={(e) => onTelefonChange(e.target.value)} onBlur={(e) => onTelefonBlur(e.target.value)} style={inputStyle} />
          {dupHit && (dupHit.isNurture ? (
            <div style={{ fontSize: '11.5px', color: '#15803D', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Există în Nurture: {dupHit.name}</span>
              <button type="button" onClick={() => onReactivate(dupHit.id)} disabled={reactivatePending} style={{ fontSize: '11px', fontWeight: 600, color: '#166534', background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer' }}>
                🌱 Reactivează în pipeline
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '11.5px', color: '#C2403F', marginTop: '5px' }}>Telefon existent: {dupHit.name}</div>
          ))}
        </div>
        <div>
          <L>Email</L>
          <input className="qf" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <L>Nume părinte</L>
          <input className="qf" value={form.nume_parinte} onChange={(e) => set('nume_parinte', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <L>Data nașterii</L>
          <input className="qf" type="date" value={form.data_nasterii} onChange={(e) => set('data_nasterii', e.target.value)} style={inputStyle} />
        </div>
      </div>
    </>
  )
}
