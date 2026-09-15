import type { GrupaLead } from '@/types/db'
import { GRUPA_TO_VARSTA_CURS } from '../../constants'
import type { CursProgramabil, ProgramareActiva } from '../../api'
import { formatDate } from '@/lib/format'
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
  /** Data aleasă cade în afara sezonului activ → doar clase DEMO, fără cursuri. */
  intreSezoane: boolean
  /** Ocuparea evenimentului selectat; null la cursuri sau fără capacitate setată. */
  locuri: { ocupat: number; capacitate: number } | null
  plin: boolean
  /** Programările active ale leadului pe care cea nouă le înlocuiește. */
  existente: ProgramareActiva[]
  inlocuireConfirmata: boolean
  onConfirmaInlocuire: () => void
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
  intreSezoane,
  locuri,
  plin,
  existente,
  inlocuireConfirmata,
  onConfirmaInlocuire,
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
      {locuri && (
        <div style={{ marginTop: '11px', fontSize: '12px', color: plin ? '#B42318' : '#1F6FB2' }}>
          <strong>
            Locuri: {locuri.ocupat}/{locuri.capacitate}
          </strong>
          {plin && ' — COMPLET'}
        </div>
      )}
      {plin && (
        <div style={{ marginTop: '9px', padding: '9px 11px', border: '1px solid #F0C9C9', background: '#FEF3F2', borderRadius: '9px', fontSize: '11.5px', lineHeight: 1.5, color: '#B42318' }}>
          <strong>Clasa e completă.</strong> Leadul se înscrie oricum, peste capacitate — spune-i teacherului
          că vine încă un om. Managerii primesc automat sarcina de a programa o clasă demo nouă.
        </div>
      )}
      {existente.length > 0 && (
        <div style={{ marginTop: '11px', padding: '11px 12px', border: '1px solid #F0D98A', background: '#FFF8E1', borderRadius: '9px', fontSize: '12.5px', lineHeight: 1.5, color: '#7A5E00' }}>
          <div>
            <strong>{existente.length > 1 ? 'Are deja programări:' : 'Are deja o programare:'}</strong>{' '}
            {existente
              .map((p) => [formatDate(p.data), p.ora?.slice(0, 5), p.unde].filter(Boolean).join(' · '))
              .join('; ')}
          </div>
          <div style={{ marginTop: '4px' }}>
            Un lead are o singură programare: cea nouă o înlocuiește pe cea veche (nu mai primește reminder
            pentru ea și nu mai apare în rosterul acelei zile).
          </div>
          <button
            type="button"
            onClick={onConfirmaInlocuire}
            style={{ marginTop: '9px', height: '34px', padding: '0 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', border: inlocuireConfirmata ? '1px solid #1A1814' : '1px solid #E4D39A', background: inlocuireConfirmata ? 'var(--color-quasar-yellow)' : '#fff', color: 'var(--color-ink)' }}
          >
            {inlocuireConfirmata ? '✓ Se înlocuiește cu cea nouă' : 'Înlocuiește cu cea nouă'}
          </button>
        </div>
      )}
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
        <span>
          {intreSezoane
            ? 'Dată în afara sezonului: se programează doar la clase DEMO (cursurile recurente nu se țin în perioada dintre sezoane). Confirmarea SMS pleacă după 5 minute.'
            : 'La salvare leadul apare în rosterul grupei din acea zi. Confirmarea SMS pleacă după 5 minute (fereastră de corecții). Data nașterii nu e obligatorie.'}
        </span>
      </div>
    </div>
  )
}
