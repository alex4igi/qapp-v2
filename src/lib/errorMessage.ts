// Traduce erorile Supabase/Postgres în mesaje lizibile pentru utilizator.
// Necesar fiindcă PostgrestError/AuthError/FunctionsError NU sunt instanțe `Error`,
// deci `e instanceof Error ? e.message : fallback` cădea mereu pe fallback-ul generic
// și ascundea cauza reală (ex: RLS denied = lipsă permisiune).

const PERMISSION_DENIED =
  'Nu aveți permisiunea necesară pentru această acțiune. Contactați un administrator sau manager.'

// Coduri Postgres frecvente → mesaj în română. P0001 (raise_exception din RPC)
// e tratat separat: mesajul lui e deja text custom, îl lăsăm să treacă.
const CODE_MESSAGES: Record<string, string> = {
  '42501': PERMISSION_DENIED, // insufficient_privilege / RLS denied
  // PGRST116: un .select().single() după scriere a întors 0 rânduri. Într-un flux
  // de salvare asta înseamnă că RLS a blocat update/insert-ul (rândul există, dar
  // politica a respins scrierea) → lipsă drepturi, nu un „json object" tehnic.
  PGRST116: PERMISSION_DENIED,
  '23505': 'Există deja o înregistrare cu aceste date.', // unique_violation
  '23503': 'Operația nu se poate face: există date asociate.', // foreign_key_violation
  '23502': 'Lipsește un câmp obligatoriu.', // not_null_violation
  '23514': 'O valoare nu respectă regulile (verificare eșuată).', // check_violation
  '23P01': 'Intervalul se suprapune cu unul existent.', // exclusion_violation
}

// Mesaje pe numele constrângerii (Postgres îl pune în mesaj: `… constraint "nume"`).
// Spun CE date blochează și CE poate face omul; constrângerile nelistate rămân pe
// mesajul generic al codului. Inventarul: docs/inventar-mesaje-eroare.md §2, §4.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  // Duplicate (23505)
  uq_enrollment_client_curs_data:
    'Clientul are deja o înrolare pe acest curs care începe în aceeași zi. Verifică tabul Înrolări din fișa lui.',
  sezoane_unique_activ: 'Poate fi activ un singur sezon. Arhivează-l întâi pe cel activ.',
  sezoane_unique_stare_activ: 'Poate fi activ un singur sezon. Arhivează-l întâi pe cel activ.',
  cursuri_suspendari_deschisa_unica:
    'Grupa e deja suspendată. Reactiveaz-o întâi, apoi pune o suspendare nouă.',
  evenimente_participanti_eveniment_client_key: 'Cursantul e deja înscris la acest eveniment.',
  spectacol_act_performeri_act_client_key: 'Cursantul e deja în acest act.',
  uq_programare_lead_eveniment: 'Leadul e deja programat la acest eveniment.',
  uq_prezente_enrollment_data: 'Prezența pentru ziua asta e deja marcată.',
  uq_open_rez_client_active: 'Clientul are deja o rezervare la această sesiune.',
  open_sesiuni_curs_data_key: 'Există deja o sesiune la această dată pentru acest curs.',
  unitati_invatamant_norm_uniq: 'Școala există deja în catalog. Alege-o din listă.',
  reconcilieri_cash_data_locatie_key:
    'Reconcilierea pentru ziua și locația asta există deja. Deschide-o pe aceea.',
  vouchere_cod_voucher_unique: 'Există deja un voucher cu acest cod.',
  campanii_preinscriere_nume_key: 'Există deja o campanie cu numele ăsta. Alege alt nume.',
  campanii_recomandare_nume_key: 'Există deja o campanie cu numele ăsta. Alege alt nume.',
  campanii_promovare_nume_unique: 'Există deja o campanie cu numele ăsta. Alege alt nume.',
  uq_campanie_sezon: 'Există deja o campanie de reînscrieri pentru acest sezon.',
  motive_abandon_eticheta_key: 'Există deja un motiv cu eticheta asta.',
  tarife_inchiriere_sala_tier_key: 'Sala are deja un tarif pentru durata asta. Editează-l pe cel existent.',
  salarizare_grila_post_valabil_de_la_key:
    'Există deja o grilă pentru postul ăsta de la aceeași dată. Editeaz-o pe cea existentă.',
  contract_templates_tip_sezon_versiune_key:
    'Există deja un template cu acest tip, sezon și versiune. Mărește versiunea.',
  kpi_grila_linii_grila_id_kpi_id_key: 'KPI-ul e deja în grilă.',
  kpi_sablon_linii_sablon_id_kpi_id_key: 'KPI-ul e deja în șablon.',
  portal_accounts_email_key: 'Emailul e folosit deja de alt cont de portal.',
  clienti_reprezinta_familia_uidx:
    'În familia aleasă e deja un membru care „se reprezintă singur". Fiecare om major care semnează singur are familia lui — folosește „+ Familie nouă".',

  // Suprapuneri (23P01)
  inchirieri_no_overlap: 'Sala e ocupată în intervalul ales. Alege alt interval.',
  kpi_grile_fara_suprapunere:
    'Omul are deja o grilă KPI valabilă în perioada aleasă (coloana „Valabilă" din listă). Grila veche nu se poate închide încă din aplicație — cere-i lui Alex.',
  manageri_locatii_fara_suprapunere: 'Locația are deja un manager în perioada aleasă.',
  salarizare_receptie_fara_suprapunere:
    'Omul are deja o grilă de recepție în perioada aleasă.',

  // Verificări (23514)
  inchirieri_durata_min_check: 'Durata închirierii merge din 30 în 30 de minute.',
  inchirieri_interval_valid: 'Ora de final trebuie să fie după ora de început.',
  vouchere_interval_valid: 'Data de început a voucherului trebuie să fie înaintea datei de expirare.',
  vouchere_valoare_nonneg: 'Valoarea voucherului nu poate fi negativă.',
  vouchere_limita_per_client_pozitiv: 'Limita pe client trebuie să fie cel puțin 1.',
  evenimente_grupa_are_data: 'Un eveniment de grupă are nevoie de o dată.',
  evenimente_grupa_nu_public: 'Un eveniment de grupă nu poate fi public.',
  evenimente_demo_coerenta: 'O clasă demo e gratuită, nu e publică și nu e legată de o grupă.',
  sali_minim_cursanti_pozitiv: 'Minimul de cursanți trebuie să fie între 1 și 30.',
  open_sesiuni_capacitate_check: 'Limita de locuri trebuie să fie pozitivă.',
  cursuri_ora_format: 'Ora trebuie în format HH:MM (ex. 17:00).',
  datorii_suma_datorata_check: 'Suma datorată trebuie să fie mai mare ca 0.',
}

// 23503 la ȘTERGERE: rândul e folosit în altă parte. La inserare, aceeași constrângere
// înseamnă altceva (ținta lipsește), deci textele astea se aplică doar la „update or delete".
const DELETE_BLOCKED_MESSAGES: Record<string, string> = {
  inchirieri_sala_fkey: 'Sala are închirieri în istoric și nu se poate șterge.',
  reconcilieri_cash_locatie_fkey: 'Locația are reconcilieri de casă în istoric și nu se poate șterge.',
  manageri_locatii_locatie_id_fkey: 'Locația are manageri alocați în istoric și nu se poate șterge.',
  capacitate_pool_locatie_id_fkey: 'Locația are capacitate pe sezoane în istoric și nu se poate șterge.',
  absente_21z_locatie_fkey: 'Locația are cazuri de absență în istoric și nu se poate șterge.',
  k4_interactiuni_zi_locatie_id_fkey: 'Locația are interacțiuni KPI în istoric și nu se poate șterge.',
  campanii_preinscriere_locatie_id_fkey: 'Locația are campanii de preînscriere și nu se poate șterge.',
  preinscrieri_campanie_locatie_id_fkey: 'Locația are preînscrieri și nu se poate șterge.',
  netopia_orders_voucher_id_fkey:
    'Voucherul a fost folosit la o plată online și nu se poate șterge. Debifează „Activ" din fișa lui.',
  netopia_orders_eveniment_id_fkey:
    'Evenimentul are bilete cumpărate online și nu se poate șterge. Pune-i statusul „Anulat".',
  campanii_recomandare_sezon_id_fkey: 'Sezonul are o campanie de recomandări și nu se poate șterge.',
  contracte_template_id_fkey: 'Template-ul are contracte trimise și nu se poate șterge.',
  absente_21z_motiv_declarat_fkey: 'Motivul e folosit în cazuri de absență și nu se poate șterge.',
  kpi_grila_linii_kpi_id_fkey: 'KPI-ul e folosit într-o grilă și nu se poate șterge.',
  kpi_sablon_linii_kpi_id_fkey: 'KPI-ul e folosit într-un șablon și nu se poate șterge.',
  facturi_fgo_incasare_id_fkey:
    'Plata are factură FGO și nu se poate șterge. Stornează factura în FGO și scrie-i lui Alex.',
  clienti_unitate_invatamant_id_fkey: 'Școala e trecută pe fișele unor clienți și nu se poate șterge.',
}

function constraintMessage(code: string | undefined, message: string | undefined): string | null {
  if (!message) return null
  const name = /constraint "([^"]+)"/.exec(message)?.[1]
  if (!name) return null
  if (code === '23503') {
    return /^update or delete on table/.test(message) ? (DELETE_BLOCKED_MESSAGES[name] ?? null) : null
  }
  return CONSTRAINT_MESSAGES[name] ?? null
}

function extract(e: unknown): { code?: string; message?: string } {
  if (e && typeof e === 'object') {
    const o = e as { code?: unknown; message?: unknown }
    return {
      code: typeof o.code === 'string' ? o.code : undefined,
      message: typeof o.message === 'string' ? o.message : undefined,
    }
  }
  return {}
}

export function humanizeError(e: unknown, fallback = 'A apărut o eroare.'): string {
  const { code, message } = extract(e)

  const byConstraint = constraintMessage(code, message)
  if (byConstraint) return byConstraint

  // 42501 vine și din gărzile de rol ale RPC-urilor (`raise … using errcode = '42501'`), cu
  // text care spune cine are voie. Doar refuzul Postgres/RLS rămâne pe mesajul generic.
  if (code === '42501' && message && !/row-level security|row level security|permission denied/i.test(message)) {
    return message
  }

  // Fără numele coloanei, „Lipsește un câmp obligatoriu" nu spune nimic omului din fața
  // formularului — iar de cele mai multe ori nici nu e un câmp din formular, ci un bug.
  if (code === '23502' && message) {
    const col = /column "([^"]+)"/.exec(message)?.[1]
    if (col) return `Lipsește un câmp obligatoriu (${col}). Dacă nu e un câmp din formular, trimite-i mesajul lui Alex.`
  }

  if (code && code in CODE_MESSAGES) return CODE_MESSAGES[code]

  // Mesajele RLS pot ajunge fără cod (ex. din edge functions) — detectăm după text.
  if (message && /row-level security|row level security/i.test(message)) {
    return PERMISSION_DENIED
  }

  if (message) return message
  if (e instanceof Error && e.message) return e.message
  return fallback
}
