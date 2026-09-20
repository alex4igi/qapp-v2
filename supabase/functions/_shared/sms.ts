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
  Nicolina: 'Str. Izvor 14 (intrarea din spate)',
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
  // Intentionat numarul Nicolinei: receptia de acolo face inscrierile Q4K, iar
  // 0745 371 200 (cel din CLAUDE.md) nu stie de clienti. Decizie Alex, 14.09.2026.
  'Quasar 4 Kids': '0770 227 580',
}
const TELEFON_DEFAULT = '0730 534 172'

// Cheia hardcodată folosită ca ultim resort când locația nu se poate canoniza.
const LOCATIE_DEFAULT = 'Ștefan cel Mare'

// Locația poate veni fie din câmpul liber al leadului, fie din numele DB al
// locației programării ("Galeriile Stefan cel Mare", "Quasar 4 Kids" etc). Cheile
// ADRESE/REVIEW/TELEFOANE sunt scurte ("Ștefan cel Mare"), deci normalizăm +
// potrivim prin substring/sinonim ca să legăm ambele forme la aceeași cheie.
function canonLocatie(locatie: string | null): keyof typeof ADRESE | null {
  if (!locatie) return null
  const n = locatie.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  // "Quasar 4 Kids" și "Quasar for Kids" sunt sinonime (4 ⊄ for) — vezi LeadModal.
  if (n.includes('quasar') && n.includes('kids')) return 'Quasar 4 Kids'
  if (n.includes('nicolina')) return 'Nicolina'
  if (n.includes('stefan') || n.includes('galeriile')) return 'Ștefan cel Mare'
  return null
}

// Cele 3 locații au adrese distincte; maparea se face strict pe numele locației
// (din programare). Fallback explicit la sediul central DOAR când locația e
// necunoscută/lipsă — callerul ar trebui să paseze locația programării, nu null.
function getAdresa(locatie: string | null): string {
  return ADRESE[canonLocatie(locatie) ?? LOCATIE_DEFAULT]
}

function getReviewLink(locatie: string | null): string {
  return REVIEW_LINKS[canonLocatie(locatie) ?? LOCATIE_DEFAULT]
}

function getTelefon(locatie: string | null): string {
  const key = canonLocatie(locatie)
  return key ? TELEFOANE[key] : TELEFON_DEFAULT
}

const MONTHS = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

// Elimina diacriticele (ă â î ș ț + majuscule) prin descompunere NFD. Aplicat pe
// valorile dinamice care vin din DB (nume curs, zile, instructor) — vezi REGULA.
function faraDiacritice(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

// Salutul din SMS: primul cuvant din prenume, fara diacritice.
//
// Campul `prenume` vine din formularul public, unde omul scrie ce vrea, iar
// pretul se plateste pe segment de mesaj:
//   * nume compuse („Alexandra Maria") umflau mesajul peste 160 => 2 segmente;
//   * o singura diacritica („Razvan" scris „Răzvan") comuta TOT SMS-ul pe UCS-2,
//     unde un segment are 70 de caractere, nu 160 => un mesaj normal ajunge la 3
//     segmente (50 de leads in baza, 08.09.2026);
//   * gunoiul din formular („Sunt interesata de cursuri de dans mixt" trecut ca
//     prenume) producea „Buna Sunt interesata de cursuri de dans mixt!".
//
// Ce nu arata a nume — gol, cifre, emoji corupte, primul cuvant tot prea lung —
// cade pe salutul neutru, ca sa nu iasa nici mesaj scump, nici mesaj ridicol.
// 20, nu 21: sablonul cel mai lung (post_demo) are 134 de caractere fara salut,
// iar „Buna " + nume + „!" mai adauga 6 + n. La n=20 iese exact 160 (un segment);
// la 21 iese 161 si mesajul se taxeaza dublu.
const MAX_NUME_SMS = 20

// Peste 3 cuvinte nu mai e nume, e propozitie: masurat pe baza (08.09.2026), la 3
// cuvinte sunt aproape numai nume reale (94 randuri: „Andronic Petronela Andreea"),
// la 4+ aproape numai raspunsuri scrise in campul gresit (21: „Sunt interesata de
// cursuri de dans mixt", „Abia astept sa vin").
const MAX_CUVINTE_NUME = 3

// Numele curatat pentru salut, sau null daca din campul asta nu iese un nume.
export function numeSalut(prenume?: string | null): string | null {
  const brut = (prenume ?? '').trim()
  if (!brut || brut.split(/\s+/).length > MAX_CUVINTE_NUME) return null
  const primul = faraDiacritice(brut).split(/\s+/)[0] ?? ''
  const areFormaDeNume = /^[A-Za-z][A-Za-z'-]*$/.test(primul)
  return areFormaDeNume && primul.length <= MAX_NUME_SMS ? primul : null
}

// Salutul complet. Fara nume folosibil ramane doar „Buna!" — niciodata „Buna bun
// venit!", care suna a formular, nu a om (decizie Alex, 08.09.2026).
export function salutSms(prenume?: string | null): string {
  const n = numeSalut(prenume)
  return n ? `Buna ${n}!` : 'Buna!'
}

// Doar data — ora vine separat (din curs/eveniment), via param `ora`.
function formatDataProgramare(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export type SmsTip =
  | 'confirmare'
  | 'reminder'
  | 'review'
  | 'waiting_list'
  | 'post_demo'

export type SmsParams = {
  prenume?: string | null
  locatie?: string | null
  dataProgramare?: string | null
  // Ora ședinței, rezolvată din curs/eveniment la programare (HH:MM). Opțională.
  ora?: string | null
  // Pentru reminder: 'azi' (programări Luni-Vineri) / 'maine' (Sâmbătă-Duminică).
  cand?: 'azi' | 'maine'
}

export function buildSms(tip: SmsTip, params: SmsParams): string {
  const salut = salutSms(params.prenume)
  const adresa = getAdresa(params.locatie ?? null)
  const reviewLink = getReviewLink(params.locatie ?? null)
  const telefon = getTelefon(params.locatie ?? null)
  const data = params.dataProgramare
    ? formatDataProgramare(params.dataProgramare)
    : ''
  const oraTxt = params.ora ? `, ora ${params.ora}` : ''

  // Texte fără diacritice și fără emoji — vezi REGULA din capul fișierului.
  //
  // Formulările sunt cele aprobate pe 20.09.2026 (handoff Codex → Claude), aduse
  // la GSM-7 și TĂIATE până încap în 160 de caractere cu cel mai lung nume admis
  // de `numeSalut` (20). Varianta „de birou" a fiecărui text era cu 10-15
  // caractere mai lungă și trecea mesajul pe 2 segmente — la volumele de leads
  // ale sezonului, exact aceleași cuvinte costau dublu. Ce s-a tăiat și de ce:
  //   * confirmare: „la ora X" → „ora X" (SCM/Q4K urcau de la nume ≤11 la ≤8);
  //   * reminder:   „Va reamintim ca …" → „Va reamintim: …" (altfel ≤6, azi ≤8);
  //   * post_demo:  „Va multumim pentru participarea la" → „Multumim pentru
  //     prezenta la" și „ne puteti scrie" → „scrieti-ne" (varianta lungă cădea
  //     pe 2 segmente de la nume ≥10, adică la majoritatea).
  switch (tip) {
    case 'confirmare':
      return `${salut} Sedinta gratuita Quasar Dance este confirmata pentru ${data}${oraTxt}, la ${adresa}. Va asteptam!`
    case 'reminder': {
      const cand = params.cand === 'azi' ? 'astazi' : 'maine'
      return `${salut} Va reamintim: sedinta gratuita Quasar Dance este ${cand}, ${data}${oraTxt}, la ${adresa}. Va asteptam!`
    }
    case 'review':
      return `${salut} Va multumim ca ati ales Quasar Dance. Daca experienta a fost una placuta, ne-ar ajuta o recenzie: ${reviewLink}`
    // „followup" („ne pare rau ca nu ai ajuns") a fost scos pe 19.09.2026:
    // neprezentarea se lucrează la telefon, la 2 zile de la absență.
    case 'waiting_list':
      return `${salut} V-am adaugat pe lista de asteptare Quasar Dance. Va contactam imediat ce devine disponibil un loc potrivit. Va multumim!`
    // La 2 zile dupa demo, pentru cine a venit si nu s-a inscris. Miza e locul in
    // grupa (capacitatea e reala), nu politetea — un „ne-a parut bine" nu misca
    // pe nimeni. Finalul e IMPERSONAL („rezervarea locului", nu „locul tau"):
    // acelasi mesaj ajunge si la parintele care citeste despre copil, si la
    // studentul care citeste despre el. Trimis de cron-afternoon la 16:00, luni-vineri.
    case 'post_demo':
      return `${salut} Multumim pentru prezenta la sedinta de proba. Locurile se ocupa in ordinea inscrierii. Pentru rezervare, scrieti-ne la ${telefon}.`
    default:
      return ''
  }
}

// Confirmare inrolare recurenta — trimisa la cronul de a doua zi (cron-afternoon, 16:00),
// nu imediat: lasa o fereastra de undo de ore intregi. Spre deosebire de lead-uri,
// parametrii vin direct din curs/client, deci foloseste un builder propriu (nu
// trece prin buildSms). Mesajul depaseste 160 caractere => ~2 segmente SMS
// (decizie asumata: includem instructor + WhatsApp).
export type ConfirmareInrolareParams = {
  prenume?: string | null
  curs: string
  zile?: string[] | null
  ora?: string | null
  // Orar diferit pe zile (excepție): map zi -> ora "HH:MM". Când e prezent,
  // mesajul listeaza ora per zi in loc de "in zilele de … la ora …".
  orePeZi?: Record<string, string> | null
  instructor?: string | null
  pretLunar?: number | null
  linkWhatsapp?: string | null
}

export function buildConfirmareInrolareSms(p: ConfirmareInrolareParams): string {
  // Mesajul se adreseaza PARINTELUI despre copil, deci nu mai deschide cu „Buna
  // {nume}!" (aprobat 20.09.2026): numele cursantului intra in fraza
  // („Confirmam inscrierea pentru Ana"), unde chiar spune cine e inscris — la o
  // familie cu doi copii, salutul pe prenumele copilului suna ca si cum
  // mesajul ar fi pentru el. Numele vine din `clienti`, unde diacriticele sunt
  // REGULA, nu exceptia (le tasteaza receptia) — `faraDiacritice` de la final
  // acopera tot textul.
  const cine = faraDiacritice((p.prenume ?? '').trim()).split(/\s+/)[0] ?? ''
  const detalii: string[] = []
  const zile = (p.zile ?? []).filter(Boolean)
  const orePeZi =
    p.orePeZi && typeof p.orePeZi === 'object' && !Array.isArray(p.orePeZi)
      ? p.orePeZi
      : null
  // Per zi DOAR daca orele chiar difera; daca toate zilele au aceeasi ora,
  // foloseste formularea compacta "Luni, Miercuri, ora 17:30".
  const oreDistincte = orePeZi
    ? new Set(zile.map((z) => orePeZi[z] ?? p.ora?.trim()).filter(Boolean))
    : null
  if (orePeZi && zile.length && oreDistincte && oreDistincte.size > 1) {
    // ex: "Luni ora 17:00, Vineri ora 18:00"
    const parts = zile.map((z) => {
      const ora = orePeZi[z] ?? p.ora?.trim()
      return ora ? `${z} ora ${ora}` : z
    })
    detalii.push(parts.join(', '))
  } else {
    if (zile.length) detalii.push(zile.join(', '))
    // ora unica: din `ora` sau, daca lipseste, prima ora din map
    const oraUnica = p.ora?.trim() || (oreDistincte && [...oreDistincte][0])
    if (oraUnica) detalii.push(`ora ${oraUnica}`)
  }
  const program = detalii.length ? ` Program: ${detalii.join(', ')}.` : ''
  const instructor = p.instructor?.trim()
    ? ` Instructor: ${p.instructor.trim()}.`
    : ''
  const pret =
    p.pretLunar != null ? ` Abonament: ${p.pretLunar} RON/luna.` : ''
  const wa = p.linkWhatsapp?.trim()
    ? ` Grup WhatsApp: ${p.linkWhatsapp.trim()}`
    : ''
  const pentru = cine ? ` pentru ${cine}` : ''
  const text = `Buna ziua! Confirmam inscrierea${pentru} la grupa ${p.curs}.${program}${instructor}${pret}${wa}`
  return faraDiacritice(text)
}

// Re-export `sendSms` din messaging.ts pentru backwards compat la callsite-uri.
// Toate edge functions care făceau `import { sendSms } from '../_shared/sms.ts'`
// continuă să meargă fără modificări — provider-ul de jos e themarketer.
export { sendSms } from './messaging.ts'
export type { SendResult as SendSmsResult } from './messaging.ts'
