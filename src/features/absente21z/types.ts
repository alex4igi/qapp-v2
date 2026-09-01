export type CanalContact = 'telefon' | 'sms' | 'email' | 'dm'
export type RezultatContact = 'reusit' | 'follow_up' | 'pierdut'

export type CazAbsenta = {
  id: string
  client_id: string
  client_nume: string
  telefon: string | null
  curs_nume: string | null
  locatie_nume: string | null
  data_intrare: string
  ultima_prezenta: string | null
  zile_tacere: number
  ore_de_la_intrare: number
  contactat_la: string | null
  motiv: string | null
  pas_urmator: string | null
  reactivat: boolean | null
  reactivat_la: string | null
}

export type MotivAbandon = { id: string; eticheta: string }

/** Ceasul de 48h: verde sub 24h, galben între 24 și 48, roșu peste. */
export type UrgentaCaz = 'verde' | 'galben' | 'rosu' | 'contactat'

export function urgenta(caz: CazAbsenta): UrgentaCaz {
  if (caz.contactat_la) return 'contactat'
  if (caz.ore_de_la_intrare >= 48) return 'rosu'
  if (caz.ore_de_la_intrare >= 24) return 'galben'
  return 'verde'
}
