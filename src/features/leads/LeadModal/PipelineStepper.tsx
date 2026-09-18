import type { CSSProperties } from 'react'
import type { StatusLead } from '@/types/db'
import { STATUS_CONFIG } from '../constants'
import { STATUS_TONE, sectionLabel } from './styles'
import { STEP_ORDER, EXIT_KEYS } from './helpers'
import { StatusTooltip } from '../StatusTooltip'

type Props = {
  status: StatusLead
  /** „Convertit" pe lead existent pornește fluxul atomic de conversie,
   *  nu setează statusul direct. */
  canStartConvert: boolean
  onPickStatus: (status: StatusLead) => void
  onStartConvert: () => void
  /** Vizualizator fără drept de scriere (agenția de ads): stepper-ul rămâne
   *  lizibil, dar nu mai e acționabil. */
  readOnly?: boolean
}

// Stepper-ul pipeline (nou → contactat → programat → convertit) + pastilele
// de ieșire (waiting list / a venit / nu a venit / nurture / pierdut).
export function PipelineStepper({
  status,
  canStartConvert,
  onPickStatus,
  onStartConvert,
  readOnly = false,
}: Props) {
  const activeIdx = (STEP_ORDER as readonly string[]).indexOf(status)
  return (
    <>
      <div style={sectionLabel}>Status în pipeline</div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '7px', marginTop: '11px' }}>
        {STEP_ORDER.map((key, i) => {
          const done = activeIdx > i
          const isActive = activeIdx === i
          return (
            <StatusTooltip key={key} status={key} className="flex flex-1">
            <button
              type="button"
              className="qstep"
              disabled={readOnly}
              onClick={() => {
                // „Convertit" e atomic: nu se forțează statusul, ci se
                // pornește fluxul real (client + înrolare). Doar pe lead
                // existent și dacă nu e deja convertit.
                if (key === 'convertit' && status !== 'convertit' && canStartConvert) {
                  onStartConvert()
                } else {
                  onPickStatus(key)
                }
              }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', padding: '11px 4px 10px', border: '1px solid ' + (isActive ? '#F0D98A' : '#EFEBE2'), background: isActive ? '#FFFBEF' : '#fff', borderRadius: '11px', cursor: readOnly ? 'default' : 'pointer' }}
            >
              <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: done ? '#1E8A5B' : isActive ? '#FFD600' : '#fff', border: '2px solid ' + (done ? '#1E8A5B' : isActive ? '#FFD600' : '#DAD5CA'), color: done ? '#fff' : isActive ? '#1A1814' : '#B5B0A6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px' }}>
                {done ? '✓' : i + 1}
              </span>
              <span className="qstep-label" style={{ fontSize: '12px', fontWeight: 600, color: isActive ? '#1A1814' : done ? '#1E8A5B' : '#9A958B' }}>
                {STATUS_CONFIG[key].label}
              </span>
            </button>
            </StatusTooltip>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        {EXIT_KEYS.map((key) => {
          const on = status === key
          const t = STATUS_TONE[key]
          return (
            <StatusTooltip key={key} status={key}>
            <button
              type="button"
              className="qexit"
              disabled={readOnly}
              aria-pressed={on}
              onClick={() => onPickStatus(key)}
              // Neapăsate stau stinse (gri pe alb): sunt ieșiri din pipeline, nu
              // pași. Culoarea statusului apare la hover și rămâne aprinsă cât e activ.
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '20px',
                cursor: readOnly ? 'default' : 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                color: on ? '#fff' : '#9A958B',
                background: on ? t.fg : '#fff',
                border: '1px solid ' + (on ? t.fg : '#EFEBE2'),
                '--exit-fg': t.fg,
                '--exit-bg': t.bg,
                '--exit-bd': t.bd,
              } as CSSProperties}
            >
              {STATUS_CONFIG[key].label}
            </button>
            </StatusTooltip>
          )
        })}
      </div>
    </>
  )
}
