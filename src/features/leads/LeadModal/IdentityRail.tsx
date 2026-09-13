import type { ReactNode } from 'react'
import type { Lead, GrupaLead } from '@/types/db'
import { GRUPA_LABELS } from '../constants'
import type { LeadForm } from '../api'
import { actBtn } from './styles'
import { ageFromDob, initialsOf } from './helpers'

type Props = {
  form: LeadForm
  lead: Lead | null | undefined
  isEdit: boolean
  tone: { fg: string; bg: string; bd: string }
  statusLabel: string
  waHref: string | null
  onLogContact: () => void
  onMoveToNurture: () => void
  movePending: boolean
  /** Esențialele (nume, telefon, email), randate de părinte. */
  contact: ReactNode
  /** Restul datelor; pe telefon părintele le pune sub zona de lucru, nu aici. */
  details?: ReactNode
  /** Pe telefon banda stă deasupra formularului, nu lângă el. */
  stacked?: boolean
}

// Rail-ul de identitate (stânga): avatar + esențialele editabile + contor
// contactări + acțiuni rapide (loghează contact, WhatsApp, mută în Nurture) +
// restul datelor. Datele leadului stau aici indiferent de status; dreapta rămâne
// zona de lucru a pipeline-ului.
export function IdentityRail({
  form,
  lead,
  isEdit,
  tone,
  statusLabel,
  waHref,
  onLogContact,
  onMoveToNurture,
  movePending,
  contact,
  details,
  stacked = false,
}: Props) {
  const fullName = [form.prenume, form.nume].filter(Boolean).join(' ').trim()
  const age = ageFromDob(form.data_nasterii)
  const grupaLabel = form.grupa_varsta
    ? GRUPA_LABELS[form.grupa_varsta as GrupaLead]
    : ''

  return (
    <div
      className="qbody"
      style={{
        width: stacked ? '100%' : '320px',
        flexShrink: 0,
        background: '#FBFAF6',
        borderRight: stacked ? 'none' : '1px solid var(--color-line)',
        borderBottom: stacked ? '1px solid var(--color-line)' : 'none',
        padding: stacked ? '16px 16px 14px' : '22px 20px',
        overflowY: stacked ? 'visible' : 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--color-rail)', color: 'var(--color-quasar-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px' }}>
          {initialsOf(form.prenume, form.nume)}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '17px', marginTop: '10px' }}>
          {fullName || 'Lead nou'}
        </div>
        {(age != null || grupaLabel) && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-muted)', marginTop: '2px' }}>
            {[age != null ? `${age} ani` : null, grupaLabel].filter(Boolean).join(' · ')}
          </div>
        )}
        <span style={{ marginTop: '9px', fontSize: '11.5px', fontWeight: 700, color: tone.fg, background: tone.bg, padding: '4px 12px', borderRadius: '20px' }}>
          ● {statusLabel}
        </span>
      </div>

      <div style={{ marginTop: '20px' }}>{contact}</div>

      {/* contor contactări */}
      {isEdit && lead && lead.nr_contactari > 0 && (
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px', background: '#FFF6E5', border: '1px solid #F6E2A8', borderRadius: '11px', padding: '11px 13px' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--color-quasar-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--color-ink)' }}>
            {lead.nr_contactari}
          </div>
          <div style={{ fontSize: '12px', color: '#7A5E00', lineHeight: 1.35 }}>
            Contactări fără răspuns{lead.flag_reminder ? ' · marcat revenire' : ''}
          </div>
        </div>
      )}

      {/* acțiuni rapide: logarea contactului e acțiunea principală, WhatsApp sub ea */}
      {isEdit && lead && (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button type="button" className="qbtnp" onClick={onLogContact} style={{ ...actBtn, height: '42px', border: 'none', background: 'var(--color-quasar-yellow)', fontWeight: 700 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1A1814" strokeWidth="2.2"><path d="M4 5a2 2 0 0 1 2-2h2.3a1 1 0 0 1 1 .76l.9 3.6a1 1 0 0 1-.5 1.1L8 9.8a13 13 0 0 0 6.2 6.2l1.3-1.6a1 1 0 0 1 1.1-.5l3.6.9a1 1 0 0 1 .8 1V18a2 2 0 0 1-2 2A16 16 0 0 1 4 5Z" /></svg>
            Loghează contact
          </button>
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="qact" style={{ ...actBtn, color: '#1FA855', textDecoration: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.2-.2-1.2-1.5-1.2-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5c-.2.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.2.1.4.1.6-.1l.7-.9c.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.4.3.1.2.1.6-.1 1.2Z" /></svg>
              WhatsApp
            </a>
          )}
          {lead.status !== 'nurture' && (
            <button type="button" className="qact" disabled={movePending} onClick={onMoveToNurture} style={actBtn}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1E8A5B" strokeWidth="2"><path d="M12 22s-7-5.6-7-12a7 7 0 0 1 14 0c0 6.4-7 12-7 12Z" opacity=".25" /><path d="M12 7c-2 2.5-2 5 0 7 2-2 2-4.5 0-7Z" /></svg>
              {movePending ? 'Se mută…' : 'Mută în Nurture'}
            </button>
          )}
        </div>
      )}

      {!stacked && details && <div style={{ marginTop: '22px' }}>{details}</div>}
    </div>
  )
}
