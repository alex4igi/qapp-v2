import type { ReactNode } from 'react'
import type { Lead, GrupaLead } from '@/types/db'
import { GRUPA_LABELS } from '../constants'
import type { LeadForm } from '../api'
import { actBtn } from './styles'
import { ageFromDob, initialsOf } from './helpers'
import { StatusTooltip } from '../StatusTooltip'

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
  /** La „Nou" butonul de logare e mare, în zona de lucru — nu-l dublăm aici. */
  logContactInRail: boolean
  /** „Editează datele": aduce formularul în zona de lucru. Null la „Nou" (e deja acolo). */
  onEditToggle: (() => void) | null
  editing: boolean
  /** Pe telefon banda stă deasupra formularului, nu lângă el. */
  stacked?: boolean
}

const ICON_STROKE = '#9A958B'

function InfoRow({ icon, children, mono }: { icon: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ICON_STROKE} strokeWidth="2" style={{ flexShrink: 0 }}>{icon}</svg>
      <span className={mono ? 'fnum' : undefined} style={{ fontSize: '13px', color: 'var(--color-ink)', fontWeight: mono ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {children}
      </span>
    </div>
  )
}

const SEP = <div style={{ height: '1px', background: '#F4F1EA' }} />

// Rail-ul de identitate (stânga): avatar + datele leadului doar la citire (se
// actualizează live din formular) + contor contactări + acțiuni rapide. Editarea
// se face în zona de lucru, nu de aici.
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
  logContactInRail,
  onEditToggle,
  editing,
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
        width: stacked ? '100%' : '288px',
        flexShrink: 0,
        background: '#FBFAF6',
        borderRight: stacked ? 'none' : '1px solid var(--color-line)',
        borderBottom: stacked ? '1px solid var(--color-line)' : 'none',
        padding: stacked ? '16px 16px 14px' : '22px 20px',
        overflowY: stacked ? 'visible' : 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-rail)', color: 'var(--color-quasar-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '22px' }}>
          {initialsOf(form.prenume, form.nume)}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '17px', marginTop: '11px' }}>
          {fullName || 'Lead nou'}
        </div>
        {(age != null || grupaLabel) && (
          <div style={{ fontSize: '12.5px', color: 'var(--color-muted)', marginTop: '2px' }}>
            {[age != null ? `${age} ani` : null, grupaLabel].filter(Boolean).join(' · ')}
          </div>
        )}
        <StatusTooltip status={form.status}>
          <span style={{ marginTop: '9px', fontSize: '11.5px', fontWeight: 700, color: tone.fg, background: tone.bg, padding: '4px 12px', borderRadius: '20px', cursor: 'help' }}>
            ● {statusLabel}
          </span>
        </StatusTooltip>
      </div>

      {/* datele leadului, la citire */}
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #EFEBE2', borderRadius: '11px', overflow: 'hidden' }}>
        <InfoRow mono icon={<path d="M4 5a2 2 0 0 1 2-2h2.3a1 1 0 0 1 1 .76l.9 3.6a1 1 0 0 1-.5 1.1L8 9.8a13 13 0 0 0 6.2 6.2l1.3-1.6a1 1 0 0 1 1.1-.5l3.6.9a1 1 0 0 1 .8 1V18a2 2 0 0 1-2 2A16 16 0 0 1 4 5Z" />}>
          {form.telefon || '—'}
        </InfoRow>
        {SEP}
        <InfoRow icon={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>}>
          {form.email || '—'}
        </InfoRow>
        {SEP}
        <InfoRow icon={<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.6" /></>}>
          {form.locatia || '—'}
        </InfoRow>
        {SEP}
        <InfoRow icon={<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" />}>
          {form.interes || '—'}
        </InfoRow>
        {form.nume_parinte && (
          <>
            {SEP}
            <InfoRow icon={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>}>
              {form.nume_parinte}
            </InfoRow>
          </>
        )}
      </div>

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

      {/* acțiuni rapide */}
      {isEdit && lead && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {logContactInRail && (
            <button type="button" className="qbtnp" onClick={onLogContact} style={{ ...actBtn, height: '42px', border: 'none', background: 'var(--color-quasar-yellow)', fontWeight: 700 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1A1814" strokeWidth="2.2"><path d="M4 5a2 2 0 0 1 2-2h2.3a1 1 0 0 1 1 .76l.9 3.6a1 1 0 0 1-.5 1.1L8 9.8a13 13 0 0 0 6.2 6.2l1.3-1.6a1 1 0 0 1 1.1-.5l3.6.9a1 1 0 0 1 .8 1V18a2 2 0 0 1-2 2A16 16 0 0 1 4 5Z" /></svg>
              Loghează contact
            </button>
          )}
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
          {onEditToggle && (
            <button type="button" className="qact" onClick={onEditToggle} aria-pressed={editing} style={{ ...actBtn, borderColor: editing ? '#F0D98A' : '#E4E0D7', background: editing ? '#FFFBEF' : '#fff' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B6760" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              {editing ? 'Ascunde editarea' : 'Editează datele'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
