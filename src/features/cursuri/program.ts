import type { Curs } from '@/types/db'

// Orar diferit pe zile: map zi -> ora "HH:MM". Vezi migrația cursuri_ore_pe_zi.
export type OrePeZi = Record<string, string>

export function getOrePeZi(curs: Pick<Curs, 'ore_pe_zi'>): OrePeZi | null {
  const raw = curs.ore_pe_zi
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as OrePeZi
  }
  return null
}

// Textul orei pentru afișare: "17:00" (ora unică) sau "Luni 17:00, Vineri 18:00"
// (orar diferit pe zile). Gol dacă nu există nicio oră.
export function formatOra(curs: Pick<Curs, 'ora' | 'zile' | 'ore_pe_zi'>): string {
  const map = getOrePeZi(curs)
  const zile = curs.zile ?? []
  if (map && zile.length) {
    const ore = zile.map((z) => map[z] ?? curs.ora ?? '')
    // Per zi doar daca orele chiar difera; altfel ora unica.
    const distincte = new Set(ore.filter(Boolean))
    if (distincte.size > 1) {
      return zile.map((z) => `${z} ${map[z] ?? curs.ora ?? '—'}`).join(', ')
    }
    return [...distincte][0] ?? curs.ora ?? ''
  }
  return curs.ora ?? ''
}
