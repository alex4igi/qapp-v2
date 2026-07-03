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
import { getSezonForDate, type SezonOption } from './sezoane'

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
}): Promise<{ politica_discount: number; suma_finala: number } | null> {
  const { data, error } = await supabase.rpc('preview_pool_discount', {
    p_client: p.client,
    p_curs: p.cursId ?? undefined,
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

// facultativ + Per lună: prima → ultima zi a lunii din dataIncepere
function buildFacultativPerLuna(
  params: CreateInrolariParams,
  curs: Curs,
  voucher: Voucher | null,
): InsertDto<'enrollments'>[] {
  const month = params.dataIncepere.slice(0, 7) + '-01'
  const end = endOfMonth(month)
  const sumaBaza = params.sumaOverride ?? curs.pret_lunar ?? null
  return [
    {
      client: params.client,
      cursul: params.cursId,
      tip_plata: 'Per luna',
      suma_baza: sumaBaza,
      suma: sumaCuVoucher(sumaBaza, voucher),
      data_incepere: month,
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
// suma = pret_anual / 10. La GRUPĂ, dacă data semnării nu e ziua 1, prima
// lună e prorata (suma = ședințe rămase × pret_sedinta).
// La TRUPĂ nu se aplică prorata (toți încep la 1 septembrie).
function buildRecurentPerLuna(
  params: CreateInrolariParams,
  curs: Curs,
  voucher: Voucher | null,
  sezon: SezonOption,
): InsertDto<'enrollments'>[] {
  if (!sezon.data_incepere || !sezon.data_final) return []
  const months = enumerateMonths(params.dataIncepere, sezon.data_final)
  const sumaLunara =
    params.sumaOverride ??
    (curs.pret_anual != null ? Math.round(curs.pret_anual / 10) : null)
  // Prima lună a sezonului (septembrie) = rată întreagă, cu data_incepere fixată
  // la startul sezonului (NU ziua 1 → nu cade în „gaura" dintre sezoane). Prorata
  // se aplică DOAR la înscriere TÂRZIE (lună ulterioară începutului de sezon),
  // pe grupă, la mijloc de lună.
  const seasonFirstMonth = sezon.data_incepere.slice(0, 7) + '-01'
  const primaLunaESezonStart = months[0] === seasonFirstMonth
  const semnareNuELaZi1 = params.dataIncepere.slice(8, 10) !== '01'
  const aplicProrata =
    params.tipInrolare === 'recurent-grupa' &&
    !primaLunaESezonStart &&
    semnareNuELaZi1

  // Preț per ședință pentru prorata:
  //  - prima alegere: curs.pret_sedinta (setat explicit)
  //  - fallback LATESTART: curs.pret_anual / sedinte_total_sezon
  let pretPerSedintaProrata: number | null = null
  if (aplicProrata) {
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

  const inserts: InsertDto<'enrollments'>[] = []
  for (let i = 0; i < months.length; i++) {
    const m = months[i]
    const isFirst = i === 0
    if (isFirst && primaLunaESezonStart) {
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
      })
    } else if (isFirst && aplicProrata) {
      const fin = endOfMonth(m)
      const sedinte = countSessionsBetween(
        params.dataIncepere,
        fin,
        curs.zile,
      )
      const sumaBaza = Math.round(sedinte * (pretPerSedintaProrata ?? 0))
      inserts.push({
        client: params.client,
        cursul: params.cursId,
        tip_plata: 'Per luna',
        suma_baza: sumaBaza,
        suma: sumaCuVoucher(sumaBaza, voucher),
        data_incepere: params.dataIncepere,
        data_final: fin,
        activ: true,
        voucher: voucher?.id ?? null,
      })
    } else {
      inserts.push({
        client: params.client,
        cursul: params.cursId,
        tip_plata: 'Per luna',
        suma_baza: sumaLunara,
        suma: sumaCuVoucher(sumaLunara, voucher),
        data_incepere: m,
        data_final: endOfMonth(m),
        activ: true,
        voucher: voucher?.id ?? null,
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

  const voucher = params.voucherId ? await getVoucherById(params.voucherId) : null

  let inserts: InsertDto<'enrollments'>[]

  if (params.tipInrolare === 'facultativ') {
    inserts =
      params.tipPlata === 'Per sedinta'
        ? buildFacultativPerSedinta(params, curs, voucher)
        : buildFacultativPerLuna(params, curs, voucher)
  } else {
    const sezon = await getSezonForDate(params.dataIncepere)
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
