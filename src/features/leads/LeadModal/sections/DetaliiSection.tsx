import type { GrupaLead } from '@/types/db'
import { INTERESE, GRUPE, GRUPA_LABELS, LOCATII } from '../../constants'
import type { LeadForm } from '../../api'
import { inputStyle, selectStyle, sectionLabel, L } from '../styles'

type Props = {
  form: LeadForm
  set: <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => void
  campanii: { value: string; label: string }[]
}

// Secțiunea „Detalii" din rail: părinte, data nașterii, sursă, locație, interes,
// grupă de vârstă. O singură coloană: rail-ul are ~280px utili, iar selecturile
// („Ștefan cel Mare", „— selectează —") nu încap pe două.
export function DetaliiSection({ form, set, campanii }: Props) {
  return (
    <>
      <div style={sectionLabel}>Detalii</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
        <div>
          <L>Nume părinte</L>
          <input className="qf" value={form.nume_parinte} onChange={(e) => set('nume_parinte', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <L>Data nașterii</L>
          <input className="qf" type="date" value={form.data_nasterii} onChange={(e) => set('data_nasterii', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <L req>Sursă (campanie)</L>
          <select className="qf" value={form.sursa} onChange={(e) => set('sursa', e.target.value)} style={selectStyle}>
            <option value="">— selectează —</option>
            {campanii.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <L>Locație preferată</L>
          <select className="qf" value={form.locatia} onChange={(e) => set('locatia', e.target.value)} style={selectStyle}>
            <option value="">— selectează —</option>
            {LOCATII.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <L>Interes</L>
          <select className="qf" value={form.interes} onChange={(e) => set('interes', e.target.value)} style={selectStyle}>
            <option value="">— selectează —</option>
            {INTERESE.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
        <div>
          <L>Grupă vârstă</L>
          <select className="qf" value={form.grupa_varsta} onChange={(e) => set('grupa_varsta', e.target.value)} style={selectStyle}>
            <option value="">— selectează —</option>
            {GRUPE.map((g) => (
              <option key={g} value={g}>{GRUPA_LABELS[g as GrupaLead]}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  )
}
