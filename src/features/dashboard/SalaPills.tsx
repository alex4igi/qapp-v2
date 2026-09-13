import { pillClass } from '@/components/ui'

type Option = { value: string; label: string }

type Props = {
  options: Option[]
  /** Sălile selectate; gol = toate (toate pill-urile apar bifate). */
  selected: string[]
  onChange: (next: string[]) => void
}

// Selector de sală pentru dashboard. Nu e un checkbox group pur: din starea
// „toate bifate" un click izolează sala pe care ai dat (ce vrea omul de la
// recepție), nu o scoate din listă. Scoaterea ultimei săli active readuce
// „toate" — nu există stare fără nicio sală, ar goli pagina fără motiv.
export function SalaPills({ options, selected, onChange }: Props) {
  const toate = selected.length === 0
  const isActiv = (value: string) => toate || selected.includes(value)

  const click = (value: string) => {
    if (toate) return onChange([value])
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    // Tot ce e disponibil = „toate", păstrat ca listă goală (URL curat).
    onChange(next.length === 0 || next.length === options.length ? [] : next)
  }

  return (
    <div role="group" aria-label="Filtru sală" className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const activ = isActiv(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={activ}
            onClick={() => click(o.value)}
            className={pillClass(activ)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
