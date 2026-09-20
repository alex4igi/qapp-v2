// Clasificarea mesajelor: MARKETING (blocat de opt-out) vs TRANZACȚIONAL (pleacă
// oricum). Sursa unică — orice cale nouă de SMS își declară categoria aici, nu
// în locul de unde trimite.
//
// Regula (decisă 20.09.2026): opt-out-ul din `clienti`/`leads`/`familii` rămâne
// opt-out de MARKETING, nu blocare generală. Cine a cerut să nu mai primească
// promovare continuă să primească confirmarea programării, reminderul de plată,
// contractul și datele contului — sunt mesaje pe care le-a provocat el, prin
// înscriere sau prin contract (interes legitim, GDPR art. 6 lit. f).
//
// Până la migrația asta coloana `opt_out_marketing` era DOAR audit: se scria, se
// vedea în /opt-out și nu oprea nimic. Adică omul care ceruse explicit să nu mai
// fie contactat primea în continuare „locurile se ocupă în ordinea înscrierii".

export type CategorieSms = 'marketing' | 'tranzactional'

// Cheile acoperă și `sms_logs.tip` (căile de leads), și `situatie_sms_uri.cod_mesaj`
// (căile bulk + contracte + cont portal).
const CATEGORII: Record<string, CategorieSms> = {
  // — marketing: promovare, retenție, reputație —
  post_demo: 'marketing',
  review: 'marketing',
  // parcat din 19.09.2026 (neprezentarea se sună); clasificat dinainte, ca la o
  // eventuală reactivare să nu plece fără gard.
  followup: 'marketing',

  // — tranzacțional: consecința directă a unei acțiuni a omului —
  confirmare: 'tranzactional',
  reminder: 'tranzactional',
  waiting_list: 'tranzactional',
  confirmare_inrolare: 'tranzactional',
  reminder_plata: 'tranzactional',
  notificare_restante: 'tranzactional',
  avertisment_loc: 'tranzactional',
  contract: 'tranzactional',
  contract_reminder: 'tranzactional',
  cont_portal: 'tranzactional',
}

// `mesaj_liber` NU e în tabel intenționat: textul îl scrie operatorul, deci
// categoria nu se poate deduce din cod. Exact de-aia a fost PARCAT pe 20.09.2026
// (migrația 20260920200000 — RLS-ul refuză inserturile, iar /sms nu-l mai oferă):
// era singura cale pe care gardul de opt-out de aici n-o putea acoperi.
// `esteMarketing` întoarce oricum `true` pentru orice cod necunoscut — varianta
// prudentă, dacă vreodată se repornește: un mesaj operațional netrimis se
// retrimite, o reclamă trimisă cuiva care a cerut opt-out nu se ia înapoi.
export function esteMarketing(cod: string | null | undefined): boolean {
  if (!cod) return true
  return (CATEGORII[cod] ?? 'marketing') === 'marketing'
}

export function categorieSms(cod: string | null | undefined): CategorieSms {
  return esteMarketing(cod) ? 'marketing' : 'tranzactional'
}
