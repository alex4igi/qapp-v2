import type { StatusLead } from '@/types/db'
import { STATUS_PROCEDURA } from '../../procedura'
import { STATUS_TONE, actBtn } from '../styles'

type Props = {
  status: StatusLead
  /** Lead deja salvat. Pe „Lead nou" nu arătăm pasul următor (încă nu există ce
   *  urma), iar conversia pornește doar pe lead existent (flux atomic). */
  leadExistent: boolean
  onStartConvert: () => void
}

// Un rând cu pasul următor, pe orice status, iar la „A venit" și butonul care
// pornește conversia — același flux ca pasul „Convertit" din stepper, doar mai
// la vedere.
export function PasUrmatorSection({ status, leadExistent, onStartConvert }: Props) {
  if (!leadExistent) return null
  const t = STATUS_TONE[status] ?? STATUS_TONE.nou
  return (
    <div style={{ marginTop: '18px', border: `1px solid ${t.bd}`, background: t.bg, borderRadius: '13px', padding: '15px 16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: t.fg, opacity: 0.75 }}>
        Pasul următor
      </div>
      <div style={{ marginTop: '5px', fontSize: '13px', color: t.fg, lineHeight: 1.45 }}>
        {STATUS_PROCEDURA[status].pasUrmator}
      </div>
      {status === 'a_venit' && (
        <button type="button" className="qact" onClick={onStartConvert} style={{ ...actBtn, marginTop: '13px', width: '100%' }}>
          Convertește în client →
        </button>
      )}
    </div>
  )
}
