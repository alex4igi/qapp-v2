import type { LeadConversionInfo } from '../../api'
import { formatDate } from '@/lib/format'
import { fieldLabel } from '../styles'

type Props = {
  hasClient: boolean
  loading: boolean
  info: LeadConversionInfo | null | undefined
  onOpenClient: (clientId: string) => void
}

const STATUS_CLIENT_TONE: Record<string, { fg: string; bg: string }> = {
  Activ: { fg: '#1E7A4D', bg: '#D3ECDD' },
  Inactiv: { fg: '#6B6760', bg: '#EFEBE2' },
  EXclient: { fg: '#C2403F', bg: '#FBE3E3' },
}

function initialsFromName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  )
}

const valueStyle = { fontSize: '13.5px', fontWeight: 600, color: 'var(--color-ink)' } as const

// Pasul „Convertit": cardul clientului în care s-a transformat leadul — datele
// reale din `clienti` + grupa din înrolarea activă (sursa de adevăr), nu
// câmpurile de lead.
export function ConvertitSection({ hasClient, loading, info, onOpenClient }: Props) {
  const statusTone = info?.clientStatus ? STATUS_CLIENT_TONE[info.clientStatus] : null
  return (
    <div style={{ marginTop: '18px', border: '1px solid #BFE3CE', background: '#EAF6EF', borderRadius: '13px', padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E7A4D" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13.5px', color: '#176B43' }}>Înscriere finalizată</span>
        <span style={{ flex: 1 }} />
        {info?.clientStatus && (
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', color: statusTone?.fg ?? '#6B6760', background: statusTone?.bg ?? '#EFEBE2' }}>
            Client {info.clientStatus}
          </span>
        )}
      </div>
      {!hasClient ? (
        <div style={{ fontSize: '12.5px', color: '#3F6488' }}>
          Lead marcat convertit, dar fără client legat. Reia înscrierea pentru a corecta.
        </div>
      ) : loading ? (
        <div style={{ fontSize: '12.5px', color: 'var(--color-muted)' }}>Se încarcă datele clientului…</div>
      ) : info ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', border: '1px solid #CFE7D9', borderRadius: '11px', padding: '12px 14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--color-rail)', color: 'var(--color-quasar-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', flexShrink: 0 }}>
              {initialsFromName(info.clientNume)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '15px', color: 'var(--color-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {info.clientNume || '—'}
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '3px', fontSize: '12.5px', color: 'var(--color-muted)' }}>
                <span className="fnum">{info.clientTelefon || '—'}</span>
                {info.clientEmail && (
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' }}>{info.clientEmail}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px', marginTop: '13px' }}>
            <div>
              <div style={fieldLabel}>Grupă / curs</div>
              <div style={valueStyle}>
                {info.cursNume
                  ? `${info.cursNume}${info.cursVarsta ? ` · ${info.cursVarsta}` : ''}`
                  : 'Fără înrolare activă'}
              </div>
            </div>
            <div>
              <div style={fieldLabel}>Înrolat din</div>
              <div style={valueStyle}>{info.dataIncepere ? formatDate(info.dataIncepere) : '—'}</div>
            </div>
          </div>
          <button
            type="button"
            className="qbtnp"
            onClick={() => onOpenClient(info.clientId)}
            style={{ marginTop: '14px', width: '100%', height: '42px', border: 'none', borderRadius: '10px', background: 'var(--color-quasar-yellow)', fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)', cursor: 'pointer' }}
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
