import type { LeadConversionInfo } from '../../api'
import { actBtn, fieldLabel } from '../styles'

type Props = {
  hasClient: boolean
  loading: boolean
  info: LeadConversionInfo | null | undefined
  onOpenClient: (clientId: string) => void
}

// Pasul „Convertit": datele reale ale clientului + grupa din înrolare
// (sursa de adevăr), nu câmpurile de lead.
export function ConvertitSection({ hasClient, loading, info, onOpenClient }: Props) {
  return (
    <div style={{ marginTop: '18px', border: '1px solid #BFE3CE', background: '#EAF6EF', borderRadius: '13px', padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E7A4D" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13.5px', color: '#176B43' }}>Înscriere finalizată</span>
      </div>
      {!hasClient ? (
        <div style={{ fontSize: '12.5px', color: '#3F6488' }}>
          Lead marcat convertit, dar fără client legat. Reia înscrierea pentru a corecta.
        </div>
      ) : loading ? (
        <div style={{ fontSize: '12.5px', color: 'var(--color-muted)' }}>Se încarcă datele clientului…</div>
      ) : info ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px' }}>
            <div>
              <div style={fieldLabel}>Client</div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-ink)' }}>{info.clientNume || '—'}</div>
            </div>
            <div>
              <div style={fieldLabel}>Grupă / curs</div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-ink)' }}>
                {info.cursNume
                  ? `${info.cursNume}${info.cursVarsta ? ` · ${info.cursVarsta}` : ''}`
                  : 'Fără înrolare activă'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="qact"
            onClick={() => onOpenClient(info.clientId)}
            style={{ ...actBtn, marginTop: '13px', width: '100%' }}
          >
            Deschide fișa clientului →
          </button>
        </>
      ) : (
        <div style={{ fontSize: '12.5px', color: 'var(--color-muted)' }}>
          Clientul legat nu a putut fi încărcat.
        </div>
      )}
    </div>
  )
}
