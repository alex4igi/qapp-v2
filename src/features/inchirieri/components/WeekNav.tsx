import { Button } from '@/components/ui'
import { addDays, fmtRange } from '../week'

type Props = {
  mondayIso: string
  onChange: (mondayIso: string) => void
  onToday: () => void
}

export function WeekNav({ mondayIso, onChange, onToday }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => onChange(addDays(mondayIso, -7))}>
        ‹
      </Button>
      <span className="min-w-32 text-center text-sm font-medium text-ink">
        {fmtRange(mondayIso)}
      </span>
      <Button variant="secondary" onClick={() => onChange(addDays(mondayIso, 7))}>
        ›
      </Button>
      <Button variant="secondary" onClick={onToday}>
        Azi
      </Button>
    </div>
  )
}
