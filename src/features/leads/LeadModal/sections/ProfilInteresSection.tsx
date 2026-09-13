import type { GrupaLead } from '@/types/db'
import { INTERESE, GRUPE, GRUPA_LABELS, LOCATII } from '../../constants'
import type { LeadForm } from '../../api'
import { selectStyle, sectionLabel, L } from '../styles'

type Props = {
  form: LeadForm
  set: <K extends keyof LeadForm>(key: K, value: LeadForm[K]) => void
  campanii: { value: string; label: string }[]
}

// Secțiunea „Profil & interes": sursă, locație, interes, grupă de vârstă.
export function ProfilInteresSection({ form, set, campanii }: Props) {
  return (
    <>
      <div style={{ ...sectionLabel, marginTop: '22px' }}>Profil &amp; interes</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px', marginTop: '11px' }}>
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
