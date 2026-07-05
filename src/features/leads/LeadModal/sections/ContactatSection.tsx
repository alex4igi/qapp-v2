import { SUB_STATUS_OPTIONS, dataPesteZile } from '../../constants'
import type { LeadForm } from '../../api'
import { inputStyle, selectStyle, L } from '../styles'

type Props = {
  subStatus: string
  dataCallback: string
  onPatch: (patch: Partial<LeadForm>) => void
}

// Pasul „Contactat": sub-status + data de follow-up.
export function ContactatSection({ subStatus, dataCallback, onPatch }: Props) {
  return (
    <div style={{ marginTop: '18px', border: '1px solid #F6E2A8', background: '#FFFBEF', borderRadius: '13px', padding: '15px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px' }}>
        <div>
          <L>Sub-status</L>
          <select
            className="qf"
            value={subStatus}
            onChange={(e) => {
              const v = e.target.value
              // „Nu răspunde" → follow-up implicit peste o săptămână
              // (editabil) dacă nu e deja setat.
              onPatch({
                sub_status: v,
                ...(v === 'nu_raspunde' && !dataCallback
                  ? { data_callback_dorit: dataPesteZile(7) }
                  : {}),
              })
            }}
            style={{ ...selectStyle, border: '1px solid #F0D98A' }}
          >
            <option value="">— niciun sub-status —</option>
            {SUB_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <L req>Data follow-up</L>
          <input className="qf" type="date" value={dataCallback} onChange={(e) => onPatch({ data_callback_dorit: e.target.value })} style={{ ...inputStyle, border: '1px solid #F0D98A' }} />
        </div>
      </div>
    </div>
  )
}
