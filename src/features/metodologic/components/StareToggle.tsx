import type { StareProgram } from '../types'

type Props = {
  stare: StareProgram
  onChange: (next: StareProgram) => void
  /** Blochează trecerea în activ (ex. calendar incomplet). */
  disabled?: boolean
}

/** Comutator clar ciornă ↔ activ, cu ambele stări etichetate. */
export function StareToggle({ stare, onChange, disabled = false }: Props) {
  const activ = stare === 'activ'
  return (
    <div className="inline-flex items-center gap-2">
      <span className={`text-sm font-medium ${!activ ? 'text-ink' : 'text-muted'}`}>Ciornă</span>
      <button
        type="button"
        role="switch"
        aria-checked={activ}
        aria-label={activ ? 'Trece în ciornă' : 'Activează programul'}
        disabled={disabled && !activ}
        onClick={() => onChange(activ ? 'ciorna' : 'activ')}
        className={
          'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
          (activ ? 'bg-success' : 'bg-line-2 border border-line')
        }
      >
        <span
          className={
            'absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform ' +
            (activ ? 'translate-x-[22px]' : 'translate-x-0.5')
          }
        />
      </button>
      <span className={`text-sm font-medium ${activ ? 'text-success' : 'text-muted'}`}>Activ</span>
    </div>
  )
}
