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
  const data = params.dataProgramare
    ? formatDataProgramare(params.dataProgramare)
    : ''

  // Texte fără diacritice și fără emoji — vezi REGULA din capul fișierului.
  switch (tip) {
    case 'confirmare':
      return `Buna ${nume}! Sedinta gratuita la Quasar Dance e confirmata pe ${data}. Ne vedem la ${adresa}!`
    case 'reminder': {
      const cand = params.cand === 'azi' ? 'AZI' : 'MAINE'
      return `Buna ${nume}! Reminder: ${cand} ai sedinta gratuita la Quasar Dance, ${data}, la ${adresa}. Te asteptam!`
    }
    case 'review':
      return `Buna ${nume}! Speram ca ti-a placut sedinta la Quasar Dance. Ne-ar ajuta enorm un review scurt: ${reviewLink} Multumim!`
    case 'followup':
      return `Buna ${nume}! Ne pare rau ca nu ai ajuns la sedinta gratuita la Quasar Dance. Te asteptam cu drag - suna-ne sau scrie-ne sa stabilim o noua data!`
    case 'waiting_list':
      return `Buna ${nume}! Multumim pentru interes la Quasar Dance. Te-am adaugat pe lista de asteptare - te contactam imediat ce iti putem oferi un loc!`
    default:
      return ''
  }
}

// Re-export `sendSms` din messaging.ts pentru backwards compat la callsite-uri.
// Toate edge functions care făceau `import { sendSms } from '../_shared/sms.ts'`
// continuă să meargă fără modificări — provider-ul de jos e themarketer.
export { sendSms } from './messaging.ts'
export type { SendResult as SendSmsResult } from './messaging.ts'
