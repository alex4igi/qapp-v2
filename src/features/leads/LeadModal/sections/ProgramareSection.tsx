import type { GrupaLead } from '@/types/db'
import { GRUPA_TO_VARSTA_CURS } from '../../constants'
import type { CursProgramabil } from '../../api'
import { inputStyle, selectStyle, L } from '../styles'

type Props = {
  dataProgramare: string
  onDataChange: (v: string) => void
  selectie: string
  onSelectieChange: (v: string) => void
  optiuni: { label: string; value: string }[]
  cursuri: CursProgramabil[]
  cursuriLoading: boolean
  grupaVarsta: string
  ignoreVarsta: boolean
  onIgnoreVarstaChange: (on: boolean) => void
}

// Pasul „Programat": dată + curs/eveniment + excepția de grupă de vârstă.
export function ProgramareSection({
  dataProgramare,
  onDataChange,
  selectie,
  onSelectieChange,
  optiuni,
  cursuri,
  cursuriLoading,
  grupaVarsta,
  ignoreVarsta,
  onIgnoreVarstaChange,
}: Props) {
  return (
    <div style={{ marginTop: '18px', border: '1px solid #BBD8F0', background: '#F0F7FE', borderRadius: '13px', padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '13px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F6FB2" strokeWidth="2"><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13.5px', color: '#185389' }}>Programare la o grupă</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px' }}>
        <div>
          <L req>Data programării</L>
          <input className="qf" type="date" value={dataProgramare} onChange={(e) => onDataChange(e.target.value)} style={{ ...inputStyle, border: '1px solid #BBD8F0' }} />
        </div>
        <div>
          <L req>Curs / eveniment</L>
          <select className="qf" value={selectie} onChange={(e) => onSelectieChange(e.target.value)} style={{ ...selectStyle, border: '1px solid #BBD8F0' }}>
            <option value="">{cursuriLoading ? 'Se încarcă…' : '— selectează —'}</option>
            {optiuni.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '11px', fontSize: '12px', color: '#1F6FB2', cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={ignoreVarsta}
          onChange={(e) => {
            const on = e.target.checked
            onIgnoreVarstaChange(on)
            // La dezactivare, golim selecția dacă cursul ales nu mai trece de filtrul de vârstă.
            if (!on && selectie.startsWith('curs:')) {
              const curs = cursuri.find((c) => c.id === selectie.slice(5))
              const varstaCurs = grupaVarsta
                ? GRUPA_TO_VARSTA_CURS[grupaVarsta as GrupaLead]
                : null
              if (
                curs &&
                varstaCurs &&
                curs.varsta &&
                curs.varsta !== varstaCurs &&
                curs.varsta !== 'Mixt'
              )
                onSelectieChange('')
            }
          }}
          style={{ width: '15px', height: '15px', accentColor: '#1F6FB2', cursor: 'pointer' }}
        />
        Programează la altă grupă de vârstă (excepție)
      </label>
      <div style={{ display: 'flex', gap: '9px', marginTop: '12px', fontSize: '11.5px', color: '#3F6488', lineHeight: 1.45 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3F6488" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
        <span>La salvare leadul apare în rosterul grupei din acea zi. Confirmarea SMS pleacă după 5 minute (fereastră de corecții). Data nașterii nu e obligatorie.</span>
      </div>
    </div>
  )
}
