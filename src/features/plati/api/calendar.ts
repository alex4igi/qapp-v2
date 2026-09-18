// Helpers pure de calendar pentru calculul prorata și generarea lunilor de
// înrolare. Fără I/O — pot fi importate oriunde.

// Mapare nume zile → weekday JS (Date.getDay(): 0=Duminică..6=Sâmbătă)
export const ZI_TO_WEEKDAY: Record<string, number> = {
  Duminica: 0,
  Luni: 1,
  Marti: 2,
  Miercuri: 3,
  Joi: 4,
  Vineri: 5,
  Sambata: 6,
}

// Numără ședințele dintre 2 date (ambele incluse) pe baza zilelor săptămânii
// în care se ține cursul. Fără excludere de sărbători (MVP).
export function countSessionsBetween(
  fromIso: string,
  toIso: string,
  zile: string[] | null,
): number {
  if (!zile?.length) return 0
  const weekdays = new Set(
    zile.map((z) => ZI_TO_WEEKDAY[z]).filter((n) => n !== undefined),
  )
  if (weekdays.size === 0) return 0
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  const start = new Date(fy, fm - 1, fd)
  const end = new Date(ty, tm - 1, td)
  let count = 0
  for (
    const d = new Date(start);
    d.getTime() <= end.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    if (weekdays.has(d.getDay())) count++
  }
  return count
}

// Enumerează primele zile ale lunilor de la `from` (inclusiv luna lui from)
// până la `to` (inclusiv dacă luna lui to e cuprinsă). Returnează 'YYYY-MM-01'.
export function enumerateMonths(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: string[] = []
  let y = fy, m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

// Ultima zi a unei luni „YYYY-MM-01" → „YYYY-MM-DD"
export function endOfMonth(monthFirstDay: string): string {
  const [y, m] = monthFirstDay.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

// Prima zi de curs la sau după `fromIso`, pe baza zilelor săptămânii în care se
// ține cursul. Ziua curentă contează (walk-in la sală în ziua ședinței), deci o
// plată luată vineri seara, după OPEN, cere schimbarea manuală a datei.
// Null dacă nu știm zilele cursului.
export function nextSessionDate(
  zile: string[] | null,
  fromIso: string,
): string | null {
  if (!zile?.length) return null
  const weekdays = new Set(
    zile.map((z) => ZI_TO_WEEKDAY[z]).filter((n) => n !== undefined),
  )
  if (weekdays.size === 0) return null
  const [y, m, d] = fromIso.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  for (let i = 0; i < 7; i++) {
    if (weekdays.has(day.getDay())) {
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    }
    day.setDate(day.getDate() + 1)
  }
  return null
}
