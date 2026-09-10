import type { Curs, Enums } from '@/types/db'

// zi_saptamana → index JS getDay() (Duminica=0 … Sambata=6). Folosit pentru a
// proiecta cursurile recurente pe o săptămână calendaristică (calendar închirieri +
// verificare de conflict la rezervare).
export const ZI_TO_JS: Record<Enums<'zi_saptamana'>, number> = {
  Duminica: 0,
  Luni: 1,
  Marti: 2,
  Miercuri: 3,
  Joi: 4,
  Vineri: 5,
  Sambata: 6,
}

// Orar diferit pe zile: map zi -> ora "HH:MM". Vezi migrația cursuri_ore_pe_zi.
export type OrePeZi = Record<string, string>

export function getOrePeZi(curs: Pick<Curs, 'ore_pe_zi'>): OrePeZi | null {
  const raw = curs.ore_pe_zi
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as OrePeZi
  }
  return null
}

// Excepția „orar pe zile": zilele chiar au ore diferite, nu una singură repetată.
export function areOreDiferite(
  curs: Pick<Curs, 'ora' | 'zile' | 'ore_pe_zi'>,
): boolean {
  const map = getOrePeZi(curs)
  const zile = curs.zile ?? []
  if (!map || !zile.length) return false
  const ore = zile.map((z) => map[z] ?? curs.ora ?? '').filter(Boolean)
  return new Set(ore).size > 1
}

// Textul orei pentru afișare: "17:00" (ora unică) sau "Luni 17:00, Vineri 18:00"
// (orar diferit pe zile). Gol dacă nu există nicio oră.
export function formatOra(curs: Pick<Curs, 'ora' | 'zile' | 'ore_pe_zi'>): string {
  const map = getOrePeZi(curs)
  const zile = curs.zile ?? []
  if (map && zile.length) {
    if (areOreDiferite(curs)) {
      return zile.map((z) => `${z} ${map[z] ?? curs.ora ?? '—'}`).join(', ')
    }
    const ore = zile.map((z) => map[z] ?? curs.ora ?? '').filter(Boolean)
    return ore[0] ?? curs.ora ?? ''
  }
  return curs.ora ?? ''
}

// Orarul complet, într-un rând: "Marti, Joi · 17:30". Cu orar diferit pe zile,
// `formatOra` include deja ziua în fiecare felie, deci nu le mai repetăm.
// Numele grupelor codifică zilele („S SD" = Sâmbătă-Duminică), dar codul se
// citește greșit (SD = Street Dance) — de aceea orarul se afișează explicit
// oriunde se alege o grupă.
export function formatOrar(
  curs: Pick<Curs, 'ora' | 'zile' | 'ore_pe_zi'>,
): string {
  const zile = curs.zile ?? []
  const ora = formatOra(curs)
  if (!zile.length) return ora
  if (areOreDiferite(curs)) return ora
  return ora ? `${zile.join(', ')} · ${ora}` : zile.join(', ')
}
