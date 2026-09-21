// Calendarul trimiterilor de plată (decis 2026-09-21). Zilele stau la distanță
// fixă de termenul lunii, iar termenul vine din sezon — prima și ultima rată au
// termen propriu (20 sept / 7 iunie în 2026-2027), restul lunilor ziua 15. Așa
// septembrie și iunie se mută singure când un sezon nou are alte termene.
//
// Fereastra `reminder_plata` din get_sms_recipients folosește aceeași distanță
// (migrația 20260921150000) — dacă o schimbi aici, schimb-o și acolo.

export const ZILE_REMINDER_INAINTE = 5
export const ZILE_DATORII_DUPA = 10

export type ScadenteSezon = {
  data_incepere: string | null
  data_final: string | null
  scadenta_prima_rata: string | null
  scadenta_ultima_rata: string | null
}

export type CalendarLuna = {
  termen: Date
  reminder: Date
  datorii: Date
}

// Fără diacritice: aceleași nume intră în textul SMS-urilor (GSM-7).
export const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

export function formatZiLuna(d: Date): string {
  return `${d.getDate()} ${LUNI[d.getMonth()]}`
}

export function dataLocala(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function aceeasiLuna(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function plusZile(d: Date, zile: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + zile)
}

// null când luna e în afara sezonului — atunci nu există rată de reamintit.
export function calendarLuna(sezon: ScadenteSezon, azi: Date): CalendarLuna | null {
  if (!sezon.data_incepere || !sezon.data_final) return null
  const start = dataLocala(sezon.data_incepere)
  const final = dataLocala(sezon.data_final)
  const luna = new Date(azi.getFullYear(), azi.getMonth(), 1)
  if (luna < new Date(start.getFullYear(), start.getMonth(), 1) || luna > final) {
    return null
  }

  let termen = new Date(azi.getFullYear(), azi.getMonth(), 15)
  if (sezon.scadenta_prima_rata && aceeasiLuna(azi, start)) {
    termen = dataLocala(sezon.scadenta_prima_rata)
  } else if (sezon.scadenta_ultima_rata && aceeasiLuna(azi, final)) {
    termen = dataLocala(sezon.scadenta_ultima_rata)
  }

  return {
    termen,
    reminder: plusZile(termen, -ZILE_REMINDER_INAINTE),
    datorii: plusZile(termen, ZILE_DATORII_DUPA),
  }
}

// Ziua calendaristică, fără oră — comparațiile cu termenul se fac pe zi.
export function ziua(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
