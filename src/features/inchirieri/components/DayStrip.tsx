import { WEEKDAY_SHORT } from '../constants'
import { weekDays } from '../week'

type Props = {
  mondayIso: string
  dayIso: string
  todayIso: string
  onChange: (dayIso: string) => void
}

// Pe telefon calendarul arată o singură zi; banda alege ziua din săptămâna curentă.
export function DayStrip({ mondayIso, dayIso, todayIso, onChange }: Props) {
  return (
    <div className="mb-2 grid grid-cols-7 gap-1">
      {weekDays(mondayIso).map((d) => {
        const active = d === dayIso
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={[
              'flex flex-col items-center rounded-lg border py-1.5 text-xs',
              active
                ? 'border-quasar-black bg-quasar-yellow font-semibold text-quasar-black'
                : 'border-line bg-card text-muted-2',
              !active && d === todayIso ? 'font-semibold text-ink' : '',
            ].join(' ')}
          >
            <span>{WEEKDAY_SHORT[new Date(`${d}T00:00:00`).getDay()]}</span>
            <span className="text-sm">{Number(d.slice(8, 10))}</span>
          </button>
        )
      })}
    </div>
  )
}
