import { formatDate } from '@/lib/format'

// Data unei încasări e ziua în care omul a dat banii, nu ziua în care o înregistrăm
// noi. Penalizarea reducerii de familie compară `incasari.data` cu scadența ratei
// (`penalizare_activa` în DB), iar extrasul ING se importă cu o zi–două întârziere:
// pe data greșită, un client care a plătit la termen pierde reducerea.

/** Cea mai veche dată acceptată la recepție. Mai în urmă se umblă în luni deja
 *  raportate (salarii teacheri, KPI pe lună), deci trece prin `edit_incasare` —
 *  manager, cu motiv și rând de audit. */
export function minDataPlata(today: string): string {
  const d = new Date(`${today}T00:00:00`)
  d.setDate(d.getDate() - 31)
  return d.toISOString().slice(0, 10)
}

/** Textul de avertisment când plata nu se înregistrează pe ziua curentă. */
export function avertismentDataPlata(data: string, today: string): string | null {
  if (!data || data === today) return null
  const lunaAlta = data.slice(0, 7) !== today.slice(0, 7)
  return lunaAlta
    ? `Se înregistrează pe ${formatDate(data)} — lună deja raportată (salarii, statistici).`
    : `Se înregistrează pe ${formatDate(data)}, nu azi.`
}
