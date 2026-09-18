import { MOTIVE_PIERDUT } from '../../constants'
import { inputStyle, L } from '../styles'

type Props = {
  categorie: string
  motiv: string
  onCategorieChange: (v: string) => void
  onChange: (v: string) => void
}

// Pasul „Pierdut": categoria (obligatorie la salvare) + detaliul liber.
// Aici apar DOAR motivele de „nu mai contactăm". Un „nu acum" nu e pierdut —
// pentru el există butonul „Mută în Nurture" din bara din stânga.
export function PierdutSection({ categorie, motiv, onCategorieChange, onChange }: Props) {
  return (
    <div style={{ marginTop: '18px', border: '1px solid #F0C9C9', background: '#FDF1F1', borderRadius: '13px', padding: '15px 16px' }}>
      <L req>De ce nu-l mai contactăm</L>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
        {MOTIVE_PIERDUT.map((m) => {
          const activ = categorie === m.value
          return (
            <button
              key={m.value}
              type="button"
              title={m.ajutor}
              onClick={() => onCategorieChange(m.value)}
              style={{
                padding: '5px 11px',
                borderRadius: '999px',
                fontSize: '12px',
                cursor: 'pointer',
                border: '1px solid ' + (activ ? '#E0A3A3' : '#ECC4C4'),
                background: activ ? '#F7DADA' : '#fff',
                color: activ ? '#9E3535' : '#8C857A',
                fontWeight: activ ? 600 : 400,
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: '13px' }}>
        <L>Detaliu (opțional)</L>
        <input className="qf" value={motiv} onChange={(e) => onChange(e.target.value)} placeholder="Ce a spus, pe scurt…" style={{ ...inputStyle, border: '1px solid #ECC4C4' }} />
      </div>
      <div style={{ marginTop: '11px', fontSize: '12px', color: '#9E3535', lineHeight: 1.45 }}>
        „Pierdut" înseamnă că nu-l mai contactăm niciodată. Dacă a zis doar „nu acum"
        (program, preț, distanță, altă activitate), locul lui e în Nurture — butonul
        „🌱 Mută în Nurture" din stânga.
      </div>
    </div>
  )
}
