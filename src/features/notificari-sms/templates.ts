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
  // Intenționat numărul Nicolinei — vezi comentariul din _shared/sms.ts.
  'Quasar 4 Kids': '0770 227 580',
  'Quasar for Kids': '0770 227 580',
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

// Coduri PARCATE — codul rămâne pe loc, dar UI-ul nu le mai oferă. Gardul real e
// în DB (politica `situatie_sms_uri_adhoc_restrict`, migrația 20260920200000);
// lista asta doar ține butoanele să nu promită ceva ce baza refuză.
//
// `mesaj_liber` e parcat pe 20.09.2026: textul îl scrie operatorul la trimitere,
// deci categoria marketing/tranzacțional nu se poate deduce din cod, iar gardul de
// opt-out nu-l acoperă — 116 clienți activi cu opt-out ar fi fost prinși. Se
// repornește scoțându-l de aici ȘI din politica de RLS.
export const SMS_BULK_PARCATE: readonly SmsBulkCod[] = ['mesaj_liber']

export function esteParcat(cod: SmsBulkCod): boolean {
  return SMS_BULK_PARCATE.includes(cod)
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
  are_reducere: boolean
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

// Termenul scris în clar („15 octombrie"), nu relativ („peste 3 zile"): reminderul
// pleacă în loturi care pot fi generate azi și trimise mâine, iar „peste 3 zile"
// devine fals între generare și plecare. Fallback pe ziua 15 când rândul n-are
// scadență explicită (sezon fără prima/ultima rată configurată).
function textScadenta(scadentaISO: string | null, azi: Date): string {
  if (scadentaISO) {
    const [y, m, d] = scadentaISO.slice(0, 10).split('-').map(Number)
    return formatZiLuna(new Date(y, m - 1, d))
  }
  return formatZiLuna(new Date(azi.getFullYear(), azi.getMonth(), 15))
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
      const termen = textScadenta(r.scadenta, azi)
      // Varianta cu reducere e scurtată (fără „Daca ati achitat deja…") ca să
      // încapă în 160 car. — cu fraza de politețe ajungea la 185, adică 2 segmente.
      if (r.are_reducere) {
        return `Buna ziua! Termenul de plata pentru abonamentul Quasar Dance este ${termen}. Dupa aceasta data, reducerea aferenta lunii curente nu se mai aplica.`
      }
      return `Buna ziua! Va reamintim ca termenul de plata pentru abonamentul Quasar Dance este ${termen}. Daca ati efectuat deja plata, va multumim.`
    }

    case 'notificare_restante': {
      // Textul aprobat (20.09.2026) anunță doar soldul total. Defalcarea pe copil
      // rămâne totuși: la o familie cu doi cursanți, un total fără nume nu se
      // poate reconcilia cu ce a plătit deja pentru unul dintre ei.
      const nume = numeMembri(r.membri)
      const total = Math.round(r.total_restanta)
      const pentru =
        nume.length > 1
          ? ` (${r.membri
              .map((m) => `${faraDiacritice(m.nume)} ${Math.round(m.rest)} RON`)
              .join(', ')})`
          : nume[0]
            ? ` pentru ${nume[0]}`
            : ''
      const tel = telefonLocatie(r.locatie_nume)
      return `Buna ziua! In evidentele Quasar Dance figureaza un sold restant de ${total} RON${pentru}. Plata se poate face la studio sau in contul ${IBAN}. Pentru detalii: ${tel}.`
    }

    case 'avertisment_loc': {
      // Un SMS / familie: listează copiii în pericol + suma totală. Termen
      // limită = data trimiterii + 2 zile (vezi scripts/sms/templates.md #3).
      // Textul aprobat spune „locurile rezervate familiei"; păstrăm numele,
      // fiindcă la o familie cu doi copii doar unul e de obicei în pericol.
      const nume = numeMembri(r.membri)
      const multi = nume.length > 1
      const subiect = multi
        ? `locurilor lui ${joinSi(nume)}`
        : `locului lui ${nume[0] ?? ''}`
      const consecinta = multi
        ? 'locurile pot fi eliberate'
        : 'locul poate fi eliberat'
      const termen = new Date(azi)
      termen.setDate(termen.getDate() + 2)
      const tel = telefonLocatie(r.locatie_nume)
      return `Buna ziua! Pentru pastrarea ${subiect} la Quasar Dance, va rugam sa achitati soldul restant de ${Math.round(r.total_restanta)} RON pana pe ${formatZiLuna(termen)}. Dupa aceasta data, ${consecinta}. Pentru detalii: ${tel}.`
    }

    case 'mesaj_liber':
      return faraDiacritice((opts?.textLiber ?? '').trim())

    default:
      return ''
  }
}
