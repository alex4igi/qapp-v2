// Textele de mai jos OGLINDESC documentul de referință scripts/sms/templates.md —
// la orice modificare, ține-le sincronizate.
//
// Logică SMS partajată — template-uri + delivery via messaging.ts (themarketer).
// Folosită de send-lead-sms și cron-morning. Provider-ul concret e abstractizat
// în [_shared/messaging.ts](messaging.ts); aici păstrăm doar template-urile +
// helper-ul `buildSms()` pentru backwards compat la callsite-uri.
//
// REGULĂ: textul care ajunge într-un SMS NU conține diacritice și NU conține
// emoji — themarketer/GSM-7 le strică la afișare. Cheile de lookup (numele
// locațiilor) păstrează diacriticele fiindcă vin din DB; doar valorile-text se
// scriu fără diacritice.

// Adrese SCURTE pentru SMS — alese ca textul total să încapă în 160 caractere
// (1 SMS GSM-7). Păstrăm reperul (SYNEVO / intrarea) dar tăiem umplutura.
const ADRESE: Record<string, string> = {
  'Ștefan cel Mare': 'Galeriile Stefan cel Mare, et. 1 (langa SYNEVO)',
  Nicolina: 'Str. Izvor 14',
  'Quasar 4 Kids': 'Str. Clopotari 24 (intrarea din spate, usa mov)',
}

const REVIEW_LINKS: Record<string, string> = {
  'Ștefan cel Mare': 'https://g.page/r/CboAnmV4dmnzEAE/review',
  Nicolina: 'https://g.page/r/CZJNnsti4alFEBM/review',
  'Quasar 4 Kids': 'https://g.page/r/CRStMl8Jrwr7EBM/review',
}

// Telefonul locației (hardcoded, ca ADRESE/REVIEW_LINKS — nu există în DB).
const TELEFOANE: Record<string, string> = {
  'Ștefan cel Mare': '0730 534 172',
  Nicolina: '0770 227 580',
  'Quasar 4 Kids': '0745 371 200',
}
const TELEFON_DEFAULT = '0730 534 172'

// Nicolina + grupă Tiny (sau necunoscută) → adresa/review Quasar 4 Kids
function isQuasar4Kids(locatie: string | null, grupa: string | null): boolean {
  return locatie === 'Nicolina' && (grupa === 'Tiny' || grupa === null)
}

function getAdresa(locatie: string | null, grupa: string | null): string {
  if (isQuasar4Kids(locatie, grupa)) return ADRESE['Quasar 4 Kids']
  return ADRESE[locatie ?? 'Ștefan cel Mare'] ?? ADRESE['Ștefan cel Mare']
}

function getReviewLink(locatie: string | null, grupa: string | null): string {
  if (isQuasar4Kids(locatie, grupa)) return REVIEW_LINKS['Quasar 4 Kids']
  return (
    REVIEW_LINKS[locatie ?? 'Ștefan cel Mare'] ??
    REVIEW_LINKS['Ștefan cel Mare']
  )
}

function getTelefon(locatie: string | null, grupa: string | null): string {
  if (isQuasar4Kids(locatie, grupa)) return TELEFOANE['Quasar 4 Kids']
  return TELEFOANE[locatie ?? ''] ?? TELEFON_DEFAULT
}

const MONTHS = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

function formatDataProgramare(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ora ${h}:${m}`
}

export type SmsTip =
  | 'confirmare'
  | 'reminder'
  | 'review'
  | 'followup'
  | 'waiting_list'

export type SmsParams = {
  prenume?: string | null
  locatie?: string | null
  grupa?: string | null
  dataProgramare?: string | null
  // Pentru reminder: 'azi' (programări Luni-Vineri) / 'maine' (Sâmbătă-Duminică).
  cand?: 'azi' | 'maine'
}

export function buildSms(tip: SmsTip, params: SmsParams): string {
  const nume = params.prenume || 'bun venit'
  const adresa = getAdresa(params.locatie ?? null, params.grupa ?? null)
  const reviewLink = getReviewLink(params.locatie ?? null, params.grupa ?? null)
  const telefon = getTelefon(params.locatie ?? null, params.grupa ?? null)
  const data = params.dataProgramare
    ? formatDataProgramare(params.dataProgramare)
    : ''

  // Texte fără diacritice și fără emoji — vezi REGULA din capul fișierului.
  switch (tip) {
    case 'confirmare':
      return `Buna ${nume}! Sedinta gratuita la Quasar Dance e confirmata pe ${data}. Va asteptam cu drag la ${adresa}!`
    case 'reminder': {
      const cand = params.cand === 'azi' ? 'AZI' : 'MAINE'
      return `Buna ${nume}! Va reamintim de sedinta gratuita la Quasar Dance ${cand}, ${data}, la ${adresa}. Te asteptam!`
    }
    case 'review':
      return `Buna ${nume}! Ne bucuram ca faci parte din comunitatea Quasar Dance. Ne-ar ajuta enorm un review scurt: ${reviewLink} Multumim!`
    case 'followup':
      return `Buna ${nume}! Ne pare rau ca nu ai ajuns la sedinta gratuita la Quasar Dance. Pentru a beneficia de ea, da-ne un mesaj la ${telefon}!`
    case 'waiting_list':
      return `Buna ${nume}! Multumim pentru interes acordat catre Quasar Dance. Te-am adaugat pe lista de asteptare - te contactam imediat ce iti putem oferi un loc!`
    default:
      return ''
  }
}

// Re-export `sendSms` din messaging.ts pentru backwards compat la callsite-uri.
// Toate edge functions care făceau `import { sendSms } from '../_shared/sms.ts'`
// continuă să meargă fără modificări — provider-ul de jos e themarketer.
export { sendSms } from './messaging.ts'
export type { SendResult as SendSmsResult } from './messaging.ts'
