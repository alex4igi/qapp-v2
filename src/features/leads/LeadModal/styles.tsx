import type { CSSProperties, ReactNode } from 'react'

// ── Stiluri & helperi pentru designul „Quasar OS — Lead Modal" ──────────────
export const inputStyle: CSSProperties = {
  width: '100%',
  height: '40px',
  padding: '0 12px',
  border: '1px solid #E4E0D7',
  borderRadius: '9px',
  fontSize: '13.5px',
  color: 'var(--color-ink)',
  background: '#fff',
  outline: 'none',
}
export const selectStyle: CSSProperties = { ...inputStyle, padding: '0 10px' }
export const sectionLabel: CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  fontWeight: 700,
}
export const fieldLabel: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-muted-2)',
  marginBottom: '6px',
}
export const actBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '40px',
  borderRadius: '10px',
  border: '1px solid #E4E0D7',
  background: '#fff',
  color: 'var(--color-ink)',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}

// Tonuri (text + fundal + bordură) per status — pentru badge & pastile.
export const STATUS_TONE: Record<string, { fg: string; bg: string; bd: string }> = {
  nou: { fg: '#6B6760', bg: '#F2EFE9', bd: '#E4E0D7' },
  contactat: { fg: '#1F6FB2', bg: '#EAF2FB', bd: '#BBD8F0' },
  waiting_list: { fg: '#7A5E00', bg: '#FFF6E5', bd: '#F0D98A' },
  programat: { fg: '#9A7B00', bg: '#FFF6C2', bd: '#F0D98A' },
  a_venit: { fg: '#1E8A5B', bg: '#E7F4EE', bd: '#BFE3CE' },
  nu_a_venit: { fg: '#C2403F', bg: '#FDF1F1', bd: '#F0C9C9' },
  convertit: { fg: '#1E7A4D', bg: '#EAF6EF', bd: '#BFE3CE' },
  pierdut: { fg: '#C2403F', bg: '#FDF1F1', bd: '#F0C9C9' },
  nurture: { fg: '#1E7A4D', bg: '#EAF6EF', bd: '#BFE3CE' },
}

export function L({ children, req }: { children: ReactNode; req?: boolean }) {
  return (
    <div style={fieldLabel}>
      {children}
      {req && <span style={{ color: '#D64545' }}> *</span>}
    </div>
  )
}
