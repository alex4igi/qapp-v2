import { supabase } from '@/lib/supabase'
// Interval de luni (YYYY-MM) selectat în /statistici + helperi de conversie.
export type Interval = {
  fromLuna: string
  toLuna: string
}

export function lunaToBounds(luna: string): { from: string; to: string } {
  const [y, m] = luna.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(start), to: iso(end) }
}

export function lunaCurenta(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function lunaCuOffset(offset: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function getSezonActiv(): Promise<Interval | null> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('data_incepere, data_final')
    .eq('activ', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.data_incepere || !data?.data_final) return null
  return {
    fromLuna: data.data_incepere.slice(0, 7),
    toLuna: data.data_final.slice(0, 7),
  }
}

export function lunileInInterval(fromLuna: string, toLuna: string): string[] {
  if (fromLuna > toLuna) return []
  const out: string[] = []
  const [fy, fm] = fromLuna.split('-').map(Number)
  const [ty, tm] = toLuna.split('-').map(Number)
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

export function intervalToDateRange(i: Interval): { from: string; to: string } {
  return {
    from: lunaToBounds(i.fromLuna).from,
    to: lunaToBounds(i.toLuna).to,
  }
}

