// Textele OGLINDESC documentul de referință scripts/sms/templates.md — ține-le sincronizate.
//
// Template-uri SMS bulk pentru plăți/restanțe (fluxul „double-check").
// Mesajul final e construit aici și stocat în situatie_sms_uri.mesaj — processorul
// doar îl trimite. REGULĂ: text fără diacritice și fără emoji (GSM-7).

const IBAN = 'RO85 INGB 0000 9999 1498 9082'

// Telefonul locației (hardcoded, ca în _shared/sms.ts — nu există în DB).
// Cheia = numele locației înrolării (plati_inrolari.nume_locatie).
const TELEFOANE_LOCATIE: Record<string, string> = {
  'Ștefan cel Mare': '0730 534 172',
  Nicolina: '0770 227 580',
  'Quasar 4 Kids': '0745 371 200',
  'Quasar for Kids': '0745 371 200',
}
const TELEFON_DEFAULT = '0730 534 172'

function telefonLocatie(nume: string | null): string {
  return TELEFOANE_LOCATIE[nume ?? ''] ?? TELEFON_DEFAULT
}

const MONTHS = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

function formatZiLuna(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export const SMS_BULK_CODES = [
  'reminder_plata',
  'notificare_restante',
  'avertisment_loc',
  'mesaj_liber',
] as const

export type SmsBulkCod = (typeof SMS_BULK_CODES)[number]

export const SMS_BULK_LABEL: Record<SmsBulkCod, string> = {
  reminder_plata: 'Reminder plată (termenul ratei)',
  notificare_restante: 'Notificare restanțe',
  avertisment_loc: 'Avertisment pierdere loc (50 zile)',
  mesaj_liber: 'Mesaj liber (ad-hoc)',
}

export type SmsRecipientMembru = { nume: string; rest: number }

export type SmsRecipient = {
  // id familie sau, la clienți fără familie, id-ul clientului — cheie de grup unică
  familia_id: string
  telefon: string
  locatie_nume: string | null
  scadenta: string | null
  membri: SmsRecipientMembru[]
  total_restanta: number
  zile_depasire: number | null
  client_ids: string[]
  // Are cel puțin o rată pe preț promo (reînscriere) în selecție — promo-ul se
  // pierde dacă rata nu e achitată până la scadență, deci reminderul o spune.
  are_promo: boolean
}

// Elimină diacriticele (NFD + strip combining marks U+0300–U+036F) — plasă de
// siguranță pentru mesaj_liber.
const COMBINING_MARKS = /[̀-ͯ]/g
export function faraDiacritice(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '')
}

function numeMembri(membri: SmsRecipientMembru[]): string[] {
  return membri.map((m) => faraDiacritice(m.nume)).filter(Boolean)
}

// Listă „A, B si C"
function joinSi(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} si ${items[items.length - 1]}`
}

// Zile până la termenul lunii (15). Fallback când sezonul n-are scadență explicită.
function zilePanaLaTermen(azi: Date): number {
  return 15 - azi.getDate()
}

// Zile (calendaristice) de azi până la scadența 'YYYY-MM-DD'.
function zilePanaLaScadenta(scadentaISO: string, azi: Date): number {
  const [y, m, d] = scadentaISO.slice(0, 10).split('-').map(Number)
  const scad = new Date(y, m - 1, d)
  const az = new Date(azi.getFullYear(), azi.getMonth(), azi.getDate())
  return Math.round((scad.getTime() - az.getTime()) / 86_400_000)
}

// Construiește textul SMS pentru un destinatar + un cod. Pentru mesaj_liber,
// `textLiber` e mesajul tastat de operator.
export function buildBulkSms(
  cod: SmsBulkCod,
  r: SmsRecipient,
  opts?: { azi?: Date; textLiber?: string },
): string {
  const azi = opts?.azi ?? new Date()

  switch (cod) {
    case 'reminder_plata': {
      // Scadența reală a rândului (prima/ultima rată din sezon sau ziua 15).
      const n = r.scadenta
        ? zilePanaLaScadenta(r.scadenta, azi)
        : zilePanaLaTermen(azi)
      const cand =
        n > 1 ? `peste ${n} zile` : n === 1 ? 'maine' : 'astazi'
      // Varianta promo e scurtată („la Quasar Dance") ca să încapă în 160 car.
      if (r.are_promo) {
        return `Buna ziua! Va reamintim ca ${cand} este termenul de plata la Quasar Dance. Dupa acest termen se pierde pretul promotional. Echipa Quasar Dance`
      }
      return `Buna ziua! Va reamintim ca ${cand} este termenul de plata pentru cursurile Quasar Dance. Echipa Quasar Dance`
    }

    case 'notificare_restante': {
      const detalii = r.membri.map(
        (m) => `${faraDiacritice(m.nume)} in valoare de ${Math.round(m.rest)} RON`,
      )
      const intro =
        detalii.length > 1
          ? 'Exista plati restante'
          : 'Exista o plata restanta'
      const tel = telefonLocatie(r.locatie_nume)
      return `Buna ziua! ${intro} la cursurile Quasar Dance pentru ${joinSi(detalii)}. Se poate achita cash/card la studio sau prin transfer la IBAN ${IBAN}. Pentru intrebari, contactati-ne la ${tel}. Echipa Quasar Dance`
    }

    case 'avertisment_loc': {
      // Un SMS / familie: listează copiii în pericol + suma totală. Termen
      // limită = data trimiterii + 2 zile (vezi scripts/sms/templates.md #3).
      const nume = numeMembri(r.membri)
      const subiect =
        nume.length > 1 ? `locurile lui ${joinSi(nume)}` : `locul lui ${nume[0] ?? ''}`
      const termen = new Date(azi)
      termen.setDate(termen.getDate() + 2)
      const tel = telefonLocatie(r.locatie_nume)
      return `Buna ziua! Pentru a pastra ${subiect} la Quasar Dance, te rugam sa achiti ${Math.round(r.total_restanta)} RON pana pe ${formatZiLuna(termen)}. Pentru intrebari, contactati-ne la ${tel}. Echipa Quasar Dance`
    }

    case 'mesaj_liber':
      return faraDiacritice((opts?.textLiber ?? '').trim())

    default:
      return ''
  }
}
