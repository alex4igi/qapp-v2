import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { timeToMinutes } from '@/lib/inchirieriPricing'
import {
  cursStartMinForWeekday,
  cursSuspendatLaData,
  listCursuriForCalendar,
  listEvenimenteWeek,
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

  // Evenimentele cu sală (clase demo, workshop-uri) — independent de sezon.
  const evenimenteQ = useQuery({
    queryKey: ['inchirieri-calendar-evenimente', locatieId, mondayIso],
    queryFn: () =>
      listEvenimenteWeek({ fromIso: days[0], toIso: days[6], locatieId }),
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
        if (cursSuspendatLaData(c, d)) continue
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
        kind: gratis
          ? 'inchiriere-gratis'
          : r.status_plata === 'achitat'
            ? 'inchiriere-achitata'
            : 'inchiriere-restanta',
        inchiriereId: r.id,
      })
    }

    // Evenimente cu sală → pe data lor.
    for (const e of evenimenteQ.data ?? []) {
      if (e.sala !== salaId) continue
      const startMin = timeToMinutes(e.ora)
      if (startMin == null) continue
      const arr = map.get(e.data)
      if (!arr) continue
      arr.push({
        startMin,
        endMin: startMin + (e.durata_min ?? 60),
        label: e.nume_eveniment,
        kind: e.tip === 'DEMO Class' ? 'demo' : 'eveniment',
      })
    }

    for (const arr of map.values()) arr.sort((a, b) => a.startMin - b.startMin)
    return map
  }, [cursuriQ.data, inchirieriQ.data, evenimenteQ.data, days, salaId])

  return {
    days,
    byDate,
    isLoading:
      cursuriQ.isLoading || inchirieriQ.isLoading || evenimenteQ.isLoading,
  }
}
