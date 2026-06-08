// Textele OGLINDESC documentul de referință scripts/sms/templates.md — ține-le sincronizate.
//
// Template-uri SMS bulk pentru plăți/restanțe (fluxul „double-check").
// Mesajul final e construit aici și stocat în situatie_sms_uri.mesaj — processorul
// doar îl trimite. REGULĂ: text fără diacritice și fără emoji (GSM-7).

const IBAN = 'RO85 INGB 0000 9999 1498 9082'

export const SMS_BULK_CODES = [
  'reminder_plata',
  'notificare_restante',
  'avertisment_loc',
  'mesaj_liber',
] as const

export type SmsBulkCod = (typeof SMS_BULK_CODES)[number]

export const SMS_BULK_LABEL: Record<SmsBulkCod, string> = {
  reminder_plata: 'Reminder plată (termen 15)',
  notificare_restante: 'Notificare restanțe',
  avertisment_loc: 'Avertisment pierdere loc (45 zile)',
  mesaj_liber: 'Mesaj liber (ad-hoc)',
}

export type SmsRecipientMembru = { nume: string; rest: number }

export type SmsRecipient = {
  familia_id: string
  telefon: string
  membri: SmsRecipientMembru[]
  total_restanta: number
  zile_depasire: number | null
  client_ids: string[]
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

// Zile până la termenul lunii (15). Construit aici ca să nu depindă de fusul DB.
function zilePanaLaTermen(azi: Date): number {
  return 15 - azi.getDate()
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
      const n = zilePanaLaTermen(azi)
      const cand =
        n > 1 ? `peste ${n} zile` : n === 1 ? 'maine' : 'astazi'
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
      return `Buna ziua! ${intro} la cursurile Quasar Dance pentru ${joinSi(detalii)}. Se poate achita cash/card la studio sau prin transfer la IBAN ${IBAN}. Pentru intrebari, contactati-ne. Echipa Quasar Dance`
    }

    case 'avertisment_loc': {
      const nume = numeMembri(r.membri)
      const subiect =
        nume.length > 1 ? `Locurile lui ${joinSi(nume)}` : `Locul lui ${nume[0] ?? ''}`
      return `Buna ziua! ${subiect} in grupa la Quasar Dance este in pericol din cauza unei plati restante mai vechi de 45 de zile. Te rugam sa achiti pentru a pastra locul. Pentru intrebari, contactati-ne. Echipa Quasar Dance`
    }

    case 'mesaj_liber':
      return faraDiacritice((opts?.textLiber ?? '').trim())

    default:
      return ''
  }
}
