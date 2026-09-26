import type { IndicatoriSezon, MotivNecomparabil } from './api'

export function dataScurta(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function numeLuna(iso: string): string {
  return new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString('ro-RO', {
    month: 'long',
    year: 'numeric',
  })
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('ro-RO')}%`)

type Context = {
  referinta: string
  praguri: IndicatoriSezon['praguri']
  acoperire?: number | null
  acoperireRef?: number | null
  primaLuna?: string | null
  plataInLuna?: number | null
  plataInLunaRef?: number | null
}

// Textul pentru „fără comparație". Pragurile și testele sunt în SQL
// (`_analytics_indicatori`); aici le spunem pe limba omului.
export function motivText(motiv: MotivNecomparabil | null, c: Context): string | null {
  switch (motiv) {
    case null:
      return null
    case 'fara_sezon_ref':
      return 'nu există un sezon la aceeași dată de anul trecut.'
    case 'luna_ref_incompleta':
      return `${numeLuna(c.referinta)} e incompletă în date — doar ${pct(c.acoperireRef)} din cei prezenți aveau loc (prag ${pct(c.praguri.acoperire)}).`
    case 'luna_curenta_incompleta':
      return `luna asta e incompletă în date — ${pct(c.acoperire)} din cei prezenți au loc (prag ${pct(c.praguri.acoperire)}).`
    case 'fara_capacitate_ref':
      return 'grupele de anul trecut n-au capacitate completată.'
    case 'fereastra_viitoare':
      return c.primaLuna
        ? `prima lună comparabilă cu sezonul trecut e ${numeLuna(c.primaLuna)}.`
        : 'nicio lună din sezonul trecut nu are date complete.'
    case 'calendar_plata':
      return `calendarul de plată diferă — ${pct(c.plataInLuna)} din banii pe abonamente intră în luna ratei, față de ${pct(c.plataInLunaRef)} anul trecut.`
  }
}

export function notaLocuriFaraPrezenta(c: IndicatoriSezon['cursanti']): string | null {
  if (c.nota !== 'locuri_fara_prezenta') return null
  return `Include ${c.fara_prezenta ?? 0} locuri fără nicio prezență de 30 de zile (${pct(c.fara_prezenta_pct)}, față de ${pct(c.fara_prezenta_pct_ref)} anul trecut): din sezonul ăsta plecarea apare abia la reziliere.`
}

export function deltaProcent(valoare: number, referinta: number | null): number | null {
  if (referinta == null || referinta <= 0) return null
  return Math.round((1000 * (valoare - referinta)) / referinta) / 10
}
