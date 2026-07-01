// Helpers de săptămână (Luni→Duminica) pe string-uri ISO YYYY-MM-DD, fus local.

function toIso(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

export function todayIso(): string {
  return toIso(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

// Luni-ul săptămânii care conține data dată (getDay: Dum=0).
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  return addDays(iso, diff)
}

// Cele 7 zile ale săptămânii pornind de la luni.
export function weekDays(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i))
}

// "5 iul" scurt pentru capul de coloană.
const MONTHS_SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec']
export function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]}`
}

export function fmtRange(mondayIso: string): string {
  const days = weekDays(mondayIso)
  return `${fmtDayShort(days[0])} – ${fmtDayShort(days[6])}`
}
