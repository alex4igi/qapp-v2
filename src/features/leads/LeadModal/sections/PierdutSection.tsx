import { inputStyle, L } from '../styles'

type Props = {
  motiv: string
  onChange: (v: string) => void
}

// Pasul „Pierdut": motivul pierderii.
export function PierdutSection({ motiv, onChange }: Props) {
  return (
    <div style={{ marginTop: '18px', border: '1px solid #F0C9C9', background: '#FDF1F1', borderRadius: '13px', padding: '15px 16px' }}>
      <L>Motiv pierdut</L>
      <input className="qf" value={motiv} onChange={(e) => onChange(e.target.value)} placeholder="Ex: preț, distanță, a ales alt studio…" style={{ ...inputStyle, border: '1px solid #ECC4C4' }} />
    </div>
  )
}
