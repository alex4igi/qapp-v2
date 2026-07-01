import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { timeToMinutes } from '@/lib/inchirieriPricing'
import {
  cursStartMinForWeekday,
  listCursuriForCalendar,
  listInchirieriWeek,
  renterLabel,
  type InchiriereCalendar,
} from '../api/occupancy'
import { weekDays } from '../week'
import type { BusyInterval } from '../types'

// Construiește ocuparea săptămânii pentru o sală: Map<dateIso, BusyInterval[]>
// din cursuri recurente (proiectate pe ziua săptămânii) + închirieri (pe dată).
export function useWeekOccupancy(params: {
  locatieId: string | null
  salaId: string
  mondayIso: string
}) {
  const { locatieId, salaId, mondayIso } = params
  const days = useMemo(() => weekDays(mondayIso), [mondayIso])

  const cursuriQ = useQuery({
    queryKey: ['inchirieri-calendar-cursuri', locatieId],
    queryFn: () => listCursuriForCalendar(locatieId),
    enabled: Boolean(locatieId),
  })

  const inchirieriQ = useQuery({
    queryKey: ['inchirieri', 'week', locatieId, mondayIso],
    queryFn: () =>
      listInchirieriWeek({ fromIso: days[0], toIso: days[6], locatieId }),
    enabled: Boolean(locatieId),
  })

  const byDate = useMemo(() => {
    const map = new Map<string, BusyInterval[]>()
    for (const d of days) map.set(d, [])
    if (!salaId) return map

    // Cursuri recurente → proiectate pe fiecare zi a săptămânii.
    for (const c of cursuriQ.data ?? []) {
      if (c.sala !== salaId) continue
      for (const d of days) {
        const weekday = new Date(`${d}T00:00:00`).getDay()
        const startMin = cursStartMinForWeekday(c, weekday)
        if (startMin == null) continue
        const endMin = startMin + (c.durata_cursului ?? 60)
        map.get(d)!.push({
          startMin,
          endMin,
          label: c.numele ?? 'curs',
          kind: 'curs',
        })
      }
    }

    // Închirieri → pe data lor.
    for (const r of (inchirieriQ.data ?? []) as InchiriereCalendar[]) {
      if (r.sala !== salaId) continue
      const startMin = timeToMinutes(r.ora_start)
      const endMin = timeToMinutes(r.ora_final)
      if (startMin == null || endMin == null) continue
      const arr = map.get(r.data)
      if (!arr) continue
      const gratis = !r.pret || Number(r.pret) === 0
      arr.push({
        startMin,
        endMin,
        label: renterLabel(r),
        kind: gratis ? 'inchiriere-gratis' : 'inchiriere-platita',
        inchiriereId: r.id,
      })
    }

    for (const arr of map.values()) arr.sort((a, b) => a.startMin - b.startMin)
    return map
  }, [cursuriQ.data, inchirieriQ.data, days, salaId])

  return {
    days,
    byDate,
    isLoading: cursuriQ.isLoading || inchirieriQ.isLoading,
  }
}
