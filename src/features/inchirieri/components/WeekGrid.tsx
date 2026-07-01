import { minutesToTime } from '@/lib/inchirieriPricing'
import {
  DAY_START_MIN,
  SLOT_MIN,
  SLOTS_COUNT,
  WEEKDAY_SHORT,
  OCCUP_STYLE,
} from '../constants'
import { fmtDayShort } from '../week'
import type { BusyInterval } from '../types'

type Props = {
  days: string[]
  byDate: Map<string, BusyInterval[]>
  todayIso: string
  onFree: (dateIso: string, oraStart: string) => void
  onRental: (inchiriereId: string) => void
}

function covering(intervals: BusyInterval[], slotStart: number): BusyInterval | null {
  return intervals.find((iv) => iv.startMin <= slotStart && slotStart < iv.endMin) ?? null
}

export function WeekGrid({ days, byDate, todayIso, onFree, onRental }: Props) {
  const slots = Array.from({ length: SLOTS_COUNT }, (_, i) => DAY_START_MIN + i * SLOT_MIN)

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[720px] text-xs"
        style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}
      >
        {/* Cap coloane */}
        <div className="sticky left-0 z-10 bg-surface" />
        {days.map((d) => (
          <div
            key={d}
            className={[
              'border-b border-line px-1 py-1.5 text-center font-semibold',
              d === todayIso ? 'text-quasar-black' : 'text-muted-2',
            ].join(' ')}
          >
            <div>{WEEKDAY_SHORT[new Date(`${d}T00:00:00`).getDay()]}</div>
            <div className={d === todayIso ? 'text-quasar-black' : 'text-muted'}>
              {fmtDayShort(d)}
            </div>
          </div>
        ))}

        {/* Rânduri sloturi */}
        {slots.map((slotStart) => (
          <SlotRow
            key={slotStart}
            slotStart={slotStart}
            days={days}
            byDate={byDate}
            onFree={onFree}
            onRental={onRental}
          />
        ))}
      </div>
    </div>
  )
}

function SlotRow({
  slotStart,
  days,
  byDate,
  onFree,
  onRental,
}: {
  slotStart: number
  days: string[]
  byDate: Map<string, BusyInterval[]>
  onFree: (dateIso: string, oraStart: string) => void
  onRental: (id: string) => void
}) {
  const isHour = slotStart % 60 === 0
  return (
    <>
      <div
        className={[
          'sticky left-0 z-10 bg-surface pr-1 text-right text-[10px] text-muted',
          isHour ? 'font-semibold' : '',
        ].join(' ')}
      >
        {isHour ? minutesToTime(slotStart) : ''}
      </div>
      {days.map((d) => {
        const iv = covering(byDate.get(d) ?? [], slotStart)
        const borderTop = isHour ? 'border-t border-line' : 'border-t border-line/40'
        if (iv) {
          const isStart = slotStart === iv.startMin || slotStart === DAY_START_MIN
          const clickable = Boolean(iv.inchiriereId)
          return (
            <button
              key={d}
              type="button"
              disabled={!clickable}
              onClick={() => iv.inchiriereId && onRental(iv.inchiriereId)}
              title={`${iv.label} ${minutesToTime(iv.startMin)}–${minutesToTime(iv.endMin)}`}
              className={[
                'min-h-[22px] border-l px-1 text-left leading-tight',
                borderTop,
                OCCUP_STYLE[iv.kind],
                clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default',
              ].join(' ')}
            >
              {isStart && <span className="line-clamp-1 font-medium">{iv.label}</span>}
            </button>
          )
        }
        return (
          <button
            key={d}
            type="button"
            onClick={() => onFree(d, minutesToTime(slotStart))}
            className={[
              'min-h-[22px] border-l border-line/60 px-1 text-left text-transparent',
              borderTop,
              'hover:bg-quasar-yellow/20 hover:text-muted-2',
            ].join(' ')}
          >
            +
          </button>
        )
      })}
    </>
  )
}
