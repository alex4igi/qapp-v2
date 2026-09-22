import { supabase } from '@/lib/supabase'
import type {
  Curs,
  Enrollment,
  Enums,
  InsertDto,
  UpdateDto,
  VPlatiInrolari,
  Voucher,
} from '@/types/db'
import { applyVoucher } from '@/features/vouchere/calc'
import { countSessionsBetween, endOfMonth, enumerateMonths } from './calendar'
import { getSezonById, getSezonForDate, type SezonOption } from './sezoane'

export type TipInrolare = 'facultativ' | 'recurent-grupa' | 'recurent-trupa'

// ============================================================
// CRUD simplu
// ============================================================

export async function createEnrollment(
  dto: InsertDto<'enrollments'>,
): Promise<Enrollment> {
  const { data, error } = await supabase
    .from('enrollments')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateEnrollment(
  id: string,
  dto: UpdateDto<'enrollments'>,
): Promise<Enrollment> {
  const { data, error } = await supabase
    .from('enrollments')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Înrolările unui client pentru un sezon dat (între data_incepere și data_final),
// venite din view-ul plati_inrolari (deci au și „rest" calculat).
export async function getInrolariClientSezon(params: {
  clientId: string
  sezonStart: string | null
  sezonEnd: string | null
}): Promise<VPlatiInrolari[]> {
  let q = supabase
    .from('plati_inrolari')
    .select('*')
    .eq('id_cursant', params.clientId)
    .order('data_incepere', { ascending: true, nullsFirst: true })
  if (params.sezonStart) q = q.gte('data_incepere', params.sezonStart)
  if (params.sezonEnd) q = q.lte('data_incepere', params.sezonEnd)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// Restanțele de abonament dintr-un sezon ANTERIOR celui selectat (data_incepere <
// sezonStart) care au rest > 0. Informativ + încasabil în modalul Plată nouă;
// reziliatele (suma=0 ⇒ rest<=0) sunt excluse natural de filtrul rest>0.
// Prescrisele (data_incepere > 2 ani) sunt excluse — context de colectare, ca în
// worklist/SMS: nu le mai propunem la încasare.
export async function getInrolariRestanteAnterioare(params: {
  clientId: string
  sezonStart: string | null
}): Promise<VPlatiInrolari[]> {
  if (!params.sezonStart) return []
  const { data, error } = await supabase
    .from('plati_inrolari')
    .select('*')
    .eq('id_cursant', params.clientId)
    .lt('data_incepere', params.sezonStart)
    .gt('rest', 0)
    .eq('prescris', false)
    .order('data_incepere', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Aduce metadatele cursului relevante pentru calculul prețurilor.
export async function getCursForInrolare(id: string): Promise<Curs> {
  const { data, error } = await supabase
    .from('cursuri')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// Toate cursurile active, opțional filtrate după locația sălii și sezon.
// Tipul de înrolare se derivă din curs (facultativ + nivelul) în UI.
export async function listCursuriPentruInrolare(
  locatieId: string | null,
  sezonId?: string | null,
): Promise<Curs[]> {
  let query = supabase
    .from('cursuri')
    .select('*, sala_rel:sali!fk_cursuri_sala(locatie)')
    .eq('suspendat', false)
    .order('numele', { ascending: true })
  if (sezonId) query = query.eq('sezon', sezonId)
  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []
  const filtered = locatieId
    ? rows.filter((r) => {
        const sala = (r as { sala_rel?: { locatie: string | null } | null }).sala_rel
        return sala?.locatie === locatieId
      })
    : rows
  return filtered.map((r) => {
    const rest = { ...(r as Curs & { sala_rel?: unknown }) }
    delete (rest as { sala_rel?: unknown }).sala_rel
    return rest as Curs
  })
}

// ============================================================
// createInrolari — dispatcher pe strategie (facultativ/recurent × per ședință/lună/an)
// ============================================================

export type CreateInrolariParams = {
  client: string
  cursId: string
  tipInrolare: TipInrolare
  tipPlata: Enums<'tip_plata'>
  dataIncepere: string
  sumaOverride?: number | null // dacă admin vrea să schimbe valoarea default
  forceReinrolare?: boolean // override pentru admin după reziliere în același sezon
  voucherId?: string | null // voucher aplicat manual pe toate înrolările generate
  // Reînscriere: rata lunară vine din `cursuri.pret_lunar_promo` în loc de
  // pret_anual/10, iar rândurile primesc `este_reinscriere=true`. Prețul rămâne
  // fix pe sezon; se încheie doar odată cu locul (reziliere) — vezi
  // docs/reguli-preturi-reduceri.md.
  esteReinscriere?: boolean
}

async function getVoucherById(id: string): Promise<Voucher> {
  const { data, error } = await supabase
    .from('vouchere')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// Preview read-only al discountului de politică (cross-sell/family) pentru o
// înrolare prospectivă. Oglindește motorul server-side recalculate_pool_discount
// (RPC preview_pool_discount). Întoarce null dacă suma nu se poate calcula.
export async function previewPoolDiscount(p: {
  client: string
  tipPlata: Enums<'tip_plata'>
  sumaBaza: number
  cursId?: string | null // exclude cursul țintă din pool (dublură ≠ cross-sell)
  // Pe preț promo reducerile nu se cumulează: serverul alege între promo și
  // −10% pe rata normală, deci are nevoie de flag ca să nu promită ambele.
  esteReinscriere?: boolean
}): Promise<{ politica_discount: number; suma_finala: number } | null> {
  const { data, error } = await supabase.rpc('preview_pool_discount', {
    p_client: p.client,
    p_curs: p.cursId ?? undefined,
    p_este_reinscriere: p.esteReinscriere ?? false,
    p_tip_plata: p.tipPlata,
    p_suma_baza: p.sumaBaza,
  })
  if (error) throw error
  const row = data?.[0]
  return row
    ? {
        politica_discount: Number(row.politica_discount),
        suma_finala: Number(row.suma_finala),
      }
    : null
}

function sumaCuVoucher(suma: number | null, voucher: Voucher | null): number | null {
  if (suma == null) return null
  if (!voucher) return suma
  return applyVoucher(suma, voucher).sumaFinala
}

// Verifică dacă există o reziliere a clientului pe acest curs în sezonul dat.
async function hasRezilizareInSezon(params: {
  client: string
  cursId: string
  sezonStart: string
  sezonEnd: string
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id')
    .eq('client', params.client)
    .eq('cursul', params.cursId)
    .eq('reziliat', true)
    .gte('data_incepere', params.sezonStart)
    .lte('data_incepere', params.sezonEnd)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

// Pentru UI: clientul are deja o înrolare activă (ne-Per-ședință) pe acest curs
// care acoperă `fromDate` sau mai departe? Oglindește gardul din createInrolari.
export async function hasActiveEnrollmentOnCurs(params: {
  client: string
  cursId: string
  fromDate: string
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id')
    .eq('client', params.client)
    .eq('cursul', params.cursId)
    .eq('activ', true)
    .eq('reziliat', false)
    .neq('tip_plata', 'Per sedinta')
    .or(`data_final.is.null,data_final.gte.${params.fromDate}`)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

// Verifică dacă clientul are deja o înrolare activă (ne-Per-ședință) pe același
// curs cu interval care se suprapune peste una din perioadele noii înrolări.
// Per ședință e exclus intenționat: sesiunile drop-in multiple sunt legitime.
async function hasOverlappingActiveEnrollment(params: {
  client: string
  cursId: string
  periods: { start: string; end: string | null }[]
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('data_incepere, data_final')
    .eq('client', params.client)
    .eq('cursul', params.cursId)
    .eq('activ', true)
    .eq('reziliat', false)
    .neq('tip_plata', 'Per sedinta')
  if (error) throw error
  const overlaps = (
    aStart: string,
    aEnd: string | null,
    bStart: string,
    bEnd: string | null,
  ) => aStart <= (bEnd ?? '9999-12-31') && bStart <= (aEnd ?? '9999-12-31')
  return (data ?? []).some(
    (e) =>
      e.data_incepere != null &&
      params.periods.some((p) =>
        overlaps(p.start, p.end, e.data_incepere!, e.data_final),
      ),
  )
}

// --- Strategii build (1 înrolare sau N pentru recurent-per-lună) ---

// facultativ + Per ședință: 1 rând, fără data_final
function buildFacultativPerSedinta(
  params: CreateInrolariParams,
  curs: Curs,
  voucher: Voucher | null,
): InsertDto<'enrollments'>[] {
  const sumaBaza = params.sumaOverride ?? curs.pret_sedinta ?? null
  return [
    {
      client: params.client,
      cursul: params.cursId,
      tip_plata: 'Per sedinta',
      suma_baza: sumaBaza,
      suma: sumaCuVoucher(sumaBaza, voucher),
      data_incepere: params.dataIncepere,
      data_final: null,
      activ: true,
      voucher: voucher?.id ?? null,
    },
  ]
}

// facultativ + Per lună: prima → ultima zi a lunii din dataIncepere. În luna de
// start a sezonului, data_incepere = startul sezonului (ca la recurent): ziua 1
// cade înaintea sezonului, iar rândul dispare din fișa pe sezon și nu reactivează
// clientul. Prețul rămâne luna întreagă — facultativul n-are prorata.
function buildFacultativPerLuna(
  params: CreateInrolariParams,
  curs: Curs,
  voucher: Voucher | null,
  sezon: SezonOption | null,
): InsertDto<'enrollments'>[] {
  const month = params.dataIncepere.slice(0, 7) + '-01'
  const end = endOfMonth(month)
  const start =
    sezon?.data_incepere && month < sezon.data_incepere && sezon.data_incepere <= end
      ? sezon.data_incepere
      : month
  const sumaBaza = params.sumaOverride ?? curs.pret_lunar ?? null
  return [
    {
      client: params.client,
      cursul: params.cursId,
      tip_plata: 'Per luna',
      suma_baza: sumaBaza,
      suma: sumaCuVoucher(sumaBaza, voucher),
      data_incepere: start,
      data_final: end,
      activ: true,
      voucher: voucher?.id ?? null,
    },
  ]
}

// recurent + Per an: 1 rând cu data_final = sfârșit sezon, suma = pret_anual
function buildRecurentPerAn(
  params: CreateInrolariParams,
  curs: Curs,
  voucher: Voucher | null,
  sezon: SezonOption,
): InsertDto<'enrollments'>[] {
  const sumaBaza = params.sumaOverride ?? curs.pret_anual ?? null
  // La start de sezon, data_incepere = startul sezonului (nu ziua aleasă → nu cade
  // în „gaura" dintre sezoane). La înscriere târzie, păstrăm data reală.
  const dataInc =
    sezon.data_incepere && params.dataIncepere <= sezon.data_incepere
      ? sezon.data_incepere
      : params.dataIncepere
  return [
    {
      client: params.client,
      cursul: params.cursId,
      tip_plata: 'Per an',
      suma_baza: sumaBaza,
      suma: sumaCuVoucher(sumaBaza, voucher),
      data_incepere: dataInc,
      data_final: sezon.data_final,
      activ: true,
      voucher: voucher?.id ?? null,
    },
  ]
}

// recurent + Per lună: N rânduri (prima zi a fiecărei luni rămase),
// suma = pret_anual / 10 (sau pret_lunar_promo la reînscriere). La GRUPĂ, dacă
// clientul pierde ședințe din prima lună, aceea e prorata: în luna de start a
// sezonului rată × ședințe prinse / ședințe de la start, în rest ședințe rămase ×
// pret_sedinta, plafonat la rată. La TRUPĂ nu se aplică prorata (toți încep la
// 1 septembrie). Regulile: docs/reguli-preturi-reduceri.md §7.
function buildRecurentPerLuna(
  params: CreateInrolariParams,
  curs: Curs,
  voucher: Voucher | null,
  sezon: SezonOption,
): InsertDto<'enrollments'>[] {
  if (!sezon.data_incepere || !sezon.data_final) return []
  // Semnarea poate fi ÎNAINTEA sezonului (reînscriere în august pentru toamnă) —
  // atunci ratele pornesc de la startul sezonului, nu din luna semnării, altfel
  // ar apărea o rată în plus pentru o lună în care nu se ține cursul.
  const startEfectiv =
    params.dataIncepere < sezon.data_incepere
      ? sezon.data_incepere
      : params.dataIncepere
  const seasonFirstMonth = sezon.data_incepere.slice(0, 7) + '-01'
  // Luna de start e scurtă (sezonul pornește pe 12, nu pe 1): „luna întreagă" se
  // măsoară de la startul sezonului — cine pornește cu sezonul n-a pierdut nimic.
  const inceputLuna = (m: string) =>
    m === seasonFirstMonth ? sezon.data_incepere! : m
  let months = enumerateMonths(startEfectiv, sezon.data_final)
  // Nicio ședință rămasă în luna semnării (29 sept pe un curs de Sâm+Dum): prima
  // rată e luna următoare, nu una pentru o lună în care nu mai vine.
  if (
    params.tipInrolare === 'recurent-grupa' &&
    months.length > 0 &&
    countSessionsBetween(startEfectiv, endOfMonth(months[0]), curs.zile) === 0 &&
    countSessionsBetween(inceputLuna(months[0]), endOfMonth(months[0]), curs.zile) > 0
  ) {
    months = months.slice(1)
  }
  if (months.length === 0) return []
  const esteReinscriere = params.esteReinscriere === true
  const sumaLunara =
    params.sumaOverride ??
    (esteReinscriere
      ? curs.pret_lunar_promo
      : curs.pret_anual != null
        ? Math.round(curs.pret_anual / 10)
        : null)
  // Prima lună a sezonului (septembrie) = rată întreagă, cu data_incepere fixată
  // la startul sezonului (NU ziua 1 → nu cade în „gaura" dintre sezoane). Prorata
  // se aplică pe grupă, în orice lună, doar dacă se pierd efectiv ședințe: pe un
  // curs de Sâmbătă+Duminică, 3 octombrie e chiar prima ședință a lunii ⇒ rată
  // întreagă.
  const esteLunaDeStart = months[0] === seasonFirstMonth
  const startPrimaLuna = startEfectiv > months[0] ? startEfectiv : months[0]
  const primaLunaFin = endOfMonth(months[0])
  const sedinteRamase = countSessionsBetween(
    startPrimaLuna,
    primaLunaFin,
    curs.zile,
  )
  const sedinteLunaPlina = countSessionsBetween(
    inceputLuna(months[0]),
    primaLunaFin,
    curs.zile,
  )
  const aplicProrata =
    params.tipInrolare === 'recurent-grupa' && sedinteRamase < sedinteLunaPlina
  // În luna de start, proporțional din rată (decizie Alex, 22 sept. 2026): colegii
  // plătesc rata întreagă pe o lună deja scurtă, deci prețul de drop-in i-ar face
  // pe cei întârziați mai ieftini pe ședință decât ei.
  const prorataProportionala = esteLunaDeStart && sumaLunara != null

  // Preț per ședință pentru prorata (restul lunilor):
  //  - prima alegere: curs.pret_sedinta (setat explicit)
  //  - fallback: curs.pret_anual / sedinte_total_sezon
  let pretPerSedintaProrata: number | null = null
  if (aplicProrata && !prorataProportionala) {
    if (curs.pret_sedinta != null) {
      pretPerSedintaProrata = curs.pret_sedinta
    } else if (curs.pret_anual != null) {
      const sedinteTotalSezon = countSessionsBetween(
        sezon.data_incepere,
        sezon.data_final,
        curs.zile,
      )
      if (sedinteTotalSezon > 0) {
        pretPerSedintaProrata = curs.pret_anual / sedinteTotalSezon
      }
    }
    if (pretPerSedintaProrata == null) {
      throw new Error(
        'Nu pot calcula prorata: cursul nu are „Preț ședință" și nici „Preț anual" + zile setate.',
      )
    }
  }

  // Voucherul manual e o reducere pe O rată (prima), nu pe tot sezonul — pe sezon se
  // aplică automat reducerile de campanie. DB-ul refuză același voucher pe mai multe
  // rate dintr-un insert (trg_enrollments_voucher_o_rata_ins).
  const inserts: InsertDto<'enrollments'>[] = []
  for (let i = 0; i < months.length; i++) {
    const m = months[i]
    const isFirst = i === 0
    if (isFirst && aplicProrata) {
      // `pret_sedinta` e preț de drop-in, mai scump per ședință decât
      // abonamentul (38 vs 270/9), deci prorata se plafonează la rata lunii —
      // altfel o lună aproape întreagă costă mai mult decât una plină.
      const brut =
        prorataProportionala && sumaLunara != null
          ? Math.round((sumaLunara * sedinteRamase) / sedinteLunaPlina)
          : Math.round(sedinteRamase * (pretPerSedintaProrata ?? 0))
      const sumaBaza = sumaLunara != null ? Math.min(brut, sumaLunara) : brut
      inserts.push({
        client: params.client,
        cursul: params.cursId,
        tip_plata: 'Per luna',
        suma_baza: sumaBaza,
        suma: sumaCuVoucher(sumaBaza, voucher),
        data_incepere: startPrimaLuna,
        data_final: primaLunaFin,
        activ: true,
        voucher: voucher?.id ?? null,
        este_reinscriere: esteReinscriere,
      })
    } else if (isFirst && esteLunaDeStart) {
      // Prima lună la START de sezon (septembrie): rată întreagă, data_incepere
      // = data de start a sezonului. Total sezon = 10 × rată = pret_anual.
      inserts.push({
        client: params.client,
        cursul: params.cursId,
        tip_plata: 'Per luna',
        suma_baza: sumaLunara,
        suma: sumaCuVoucher(sumaLunara, voucher),
        data_incepere: sezon.data_incepere,
        data_final: endOfMonth(m),
        activ: true,
        voucher: voucher?.id ?? null,
        este_reinscriere: esteReinscriere,
      })
    } else {
      inserts.push({
        client: params.client,
        cursul: params.cursId,
        tip_plata: 'Per luna',
        suma_baza: sumaLunara,
        suma: sumaCuVoucher(sumaLunara, isFirst ? voucher : null),
        data_incepere: m,
        data_final: endOfMonth(m),
        activ: true,
        voucher: isFirst ? (voucher?.id ?? null) : null,
        este_reinscriere: esteReinscriere,
      })
    }
  }
  return inserts
}

// Creează una sau mai multe înrolări în funcție de tip × tipPlata.
export async function createInrolari(
  params: CreateInrolariParams,
): Promise<Enrollment[]> {
  const curs = await getCursForInrolare(params.cursId)
  const isRecurent =
    params.tipInrolare === 'recurent-grupa' ||
    params.tipInrolare === 'recurent-trupa'

  // Validări de bază
  if (params.tipInrolare === 'facultativ' && !curs.facultativ) {
    throw new Error('Cursul ales nu este facultativ.')
  }
  if (isRecurent && curs.facultativ) {
    throw new Error('Cursul ales este facultativ, nu poate fi recurent.')
  }
  if (params.tipPlata === 'Per sedinta' && isRecurent) {
    throw new Error(
      'Recurent admite doar Per lună sau Per an, nu Per ședință.',
    )
  }
  if (params.esteReinscriere) {
    if (params.tipInrolare !== 'recurent-grupa' || params.tipPlata !== 'Per luna') {
      throw new Error(
        'Prețul de reînscriere se aplică doar la grupe recurente plătite Per lună (trupele nu au preț promo).',
      )
    }
    if (curs.pret_lunar_promo == null) {
      throw new Error(
        'Cursul nu are „Preț lunar PROMO" configurat. Setează-l în Cursuri → fișa cursului.',
      )
    }
    // Promo-ul se încheie odată cu locul: dacă o înrolare anterioară pe același
    // curs a fost reziliată cât era pe promo, triggerul i-a pus `promo_anulat_la`.
    // Reîntoarcerea se face la preț întreg (vezi docs/reguli-preturi-reduceri.md).
    const { count: promoPierdut, error: promoErr } = await supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('client', params.client)
      .eq('cursul', params.cursId)
      .not('promo_anulat_la', 'is', null)
    if (promoErr) throw promoErr
    if ((promoPierdut ?? 0) > 0) {
      throw new Error(
        'Prețul de reînscriere s-a încheiat odată cu locul (înrolare reziliată anterior pe acest curs). Reînscrierea se face la preț întreg.',
      )
    }
  }

  const voucher = params.voucherId ? await getVoucherById(params.voucherId) : null

  let inserts: InsertDto<'enrollments'>[]

  // Sezonul vine din CURS, nu din dată: la reînscrierile semnate în august
  // pentru sezonul de toamnă, data ar cădea în sezonul de vară. Data rămâne
  // ce e — data semnării — dar ratele se generează pe sezonul cursului.
  const sezon =
    (curs.sezon ? await getSezonById(curs.sezon) : null) ??
    (await getSezonForDate(params.dataIncepere))

  if (params.tipInrolare === 'facultativ') {
    inserts =
      params.tipPlata === 'Per sedinta'
        ? buildFacultativPerSedinta(params, curs, voucher)
        : buildFacultativPerLuna(params, curs, voucher, sezon)
  } else {
    if (!sezon || !sezon.data_final || !sezon.data_incepere) {
      throw new Error(
        'Nu am găsit un sezon care să conțină data începerii. Adaugă un sezon mai întâi.',
      )
    }
    // Blocare re-înrolare după reziliere în același sezon (doar grupă).
    // Trupele nu pot fi rezilizate, deci verificarea nu se aplică acolo.
    if (params.tipInrolare === 'recurent-grupa' && !params.forceReinrolare) {
      const blocked = await hasRezilizareInSezon({
        client: params.client,
        cursId: params.cursId,
        sezonStart: sezon.data_incepere,
        sezonEnd: sezon.data_final,
      })
      if (blocked) {
        throw new Error(
          'Clientul a reziliat anterior contractul la această grupă în sezonul curent. Re-înrolarea necesită aprobarea managerului.',
        )
      }
    }
    inserts =
      params.tipPlata === 'Per an'
        ? buildRecurentPerAn(params, curs, voucher, sezon)
        : buildRecurentPerLuna(params, curs, voucher, sezon)
    if (inserts.length === 0) {
      throw new Error(
        'Nu se poate crea nicio rată: sezonul nu mai are ședințe după data aleasă.',
      )
    }
  }

  // Gard anti-dublură: blochează o a doua înrolare (ne-Per-ședință) pe același
  // curs cu interval suprapus. Bypass cu forceReinrolare (admin).
  if (params.tipPlata !== 'Per sedinta' && !params.forceReinrolare) {
    const dup = await hasOverlappingActiveEnrollment({
      client: params.client,
      cursId: params.cursId,
      periods: inserts
        .filter((i) => i.data_incepere != null)
        .map((i) => ({
          start: i.data_incepere as string,
          end: i.data_final ?? null,
        })),
    })
    if (dup) {
      throw new Error(
        'Clientul e deja înrolat la acest curs în această perioadă. Verifică înrolările existente înainte de a crea alta.',
      )
    }
  }

  const { data, error } = await supabase
    .from('enrollments')
    .insert(inserts)
    .select('*')
  if (error) throw error
  return data ?? []
}

// Programeaza un SMS de confirmare pentru o inrolare recurenta, cu trimitere
// intarziata ~5 min (fereastra de undo). Drenat de edge function
// cron-confirmari-sms. Upsert idempotent: o singura confirmare per inrolare.
export async function scheduleConfirmareInrolare(
  enrollmentId: string,
): Promise<void> {
  await supabase
    .from('confirmari_inrolare_sms')
    .upsert(
      { enrollment_id: enrollmentId },
      { onConflict: 'enrollment_id', ignoreDuplicates: true },
    )
}

// ============================================================
// Reziliere
// ============================================================

// Reziliază înrolările viitoare ale unui client la un curs: marchează toate
// enrollments cu data_incepere > sfârșitul lunii curente ca reziliat=true,
// activ=false. Rândurile rămân în DB ca să blocăm re-înrolarea automată în
// același sezon (necesită aprobarea managerului). Cursul curent (luna asta)
// rămâne intact (deja plătit / de plătit integral).
// Trupele NU se pot rezilia — contractul e ferm pe tot sezonul.
//
// Lunile viitoare anulate se zerează (suma=0, suma_baza=0): o lună neefectuată nu se
// facturează, deci nu trebuie să rămână ca datorie. Invariant canonic: o înrolare
// reziliată NU are datorie (regula de contract). Setăm și suma_baza ca să nu o readucă
// triggerul de discount (vezi [[invariant_suma_baza_enrollments]]).
export async function rezilizaInrolari(params: {
  clientId: string
  cursId: string
  motiv?: string | null
}): Promise<{ deleted: number }> {
  const curs = await getCursForInrolare(params.cursId)
  if (curs.nivelul === 'Trupa') {
    throw new Error('Înrolările pe trupe nu se pot rezilia.')
  }

  const today = new Date()
  const cutoff = endOfMonth(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
  )
  const { data, error } = await supabase
    .from('enrollments')
    .update({
      reziliat: true,
      activ: false,
      suma: 0,
      suma_baza: 0,
      motiv_reziliere: params.motiv?.trim() || null,
      data_reziliere: new Date().toISOString(),
    })
    .eq('client', params.clientId)
    .eq('cursul', params.cursId)
    .gt('data_incepere', cutoff)
    .select('id')
  if (error) throw error
  return { deleted: data?.length ?? 0 }
}
