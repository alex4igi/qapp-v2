import type { StatusLead } from '@/types/db'
import { STATUS_TONE, actBtn } from '../styles'

type Props = {
  status: StatusLead
  /** Conversia pornește doar pe lead existent (client + înrolare, flux atomic). */
  canConvert: boolean
  onStartConvert: () => void
}

// „Nou" n-are hint: zona lui de lucru e chiar formularul de date + logarea contactului.
const HINT: Partial<Record<StatusLead, string>> = {
  waiting_list: 'Pe lista de așteptare. Când se eliberează un loc, programează-l la o grupă.',
  a_venit: 'A venit la ședința de probă. Dacă se înscrie, convertește-l în client.',
  nu_a_venit: 'Nu a venit la programare. Reprogramează-l („Programat") sau mută-l în Nurture.',
  nurture: 'În Nurture. Când revine, reactivează-l în pipeline.',
}

// Statusurile fără formular propriu în zona de lucru: un rând cu pasul următor,
// iar la „A venit" și butonul care pornește conversia — același flux ca pasul
// „Convertit" din stepper, doar mai la vedere.
export function PasUrmatorSection({ status, canConvert, onStartConvert }: Props) {
  const text = HINT[status]
  if (!text) return null
  const t = STATUS_TONE[status] ?? STATUS_TONE.nou
  return (
    <div style={{ marginTop: '18px', border: `1px solid ${t.bd}`, background: t.bg, borderRadius: '13px', padding: '15px 16px' }}>
      <div style={{ fontSize: '13px', color: t.fg, lineHeight: 1.45 }}>{text}</div>
      {status === 'a_venit' && canConvert && (
        <button type="button" className="qact" onClick={onStartConvert} style={{ ...actBtn, marginTop: '13px', width: '100%' }}>
          Convertește în client →
        </button>
      )}
    </div>
  )
}
