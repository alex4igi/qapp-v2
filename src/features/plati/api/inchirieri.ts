import { supabase } from '@/lib/supabase'
import { normalizeTelefon } from '@/lib/phone'
import {
  computeOraFinal,
  intervalsOverlap,
  timeToMinutes,
} from '@/lib/inchirieriPricing'
import { ZI_TO_JS, getOrePeZi } from '@/features/cursuri/program'
import { sezonActivId } from '@/lib/lookups'
import type { Enums, Inchiriere, InsertDto, TarifInchiriere } from '@/types/db'
import { createDatorie } from './datorii'
import { createIncasari, type Tender } from './incasari'

// ---------- Tarife ----------
export async function listTarifeInchiriere(): Promise<TarifInchiriere[]> {
  const { data, error } = await supabase.from('tarife_inchiriere').select('*')
  if (error) throw error
  return data ?? []
}

// ---------- Verificare conflict (interval overlap) ----------
// Ocuparea vine din 2 surse: alte închirieri pe aceeași sală+dată ȘI cursurile
// recurente care rulează în ziua respectivă în acea sală. Overlap-ul e de interval
// (inclusiv parțial), nu doar fix pe oră.
export type ConflictHit = {
  kind: 'curs' | 'inchiriere'
  label: string
  ora_start: string
  ora_final: string
}

export async function checkInchiriereConflict(params: {
  sala: string
  data: string // YYYY-MM-DD
  oraStart: string
  durataMin: number
  excludeId?: string | null
}): Promise<ConflictHit | null> {
  const startMin = timeToMinutes(params.oraStart)
  const oraFinal = computeOraFinal(params.oraStart, params.durataMin)
  const endMin = timeToMinutes(oraFinal)
  if (startMin == null || endMin == null) return null

  // (a) închirieri existente pe sală + dată
  let q = supabase
    .from('inchirieri')
    .select('id, ora_start, ora_final, teacher, client, guest_nume')
    .eq('sala', params.sala)
    .eq('data', params.data)
  if (params.excludeId) q = q.neq('id', params.excludeId)
  const { data: rentals, error: rErr } = await q
  if (rErr) throw rErr
  for (const r of rentals ?? []) {
    const rs = timeToMinutes(r.ora_start)
    const re = timeToMinutes(r.ora_final)
    if (rs == null || re == null) continue
    if (intervalsOverlap(startMin, endMin, rs, re)) {
      return {
        kind: 'inchiriere',
        label: r.guest_nume ?? 'închiriere',
        ora_start: r.ora_start,
        ora_final: r.ora_final,
      }
    }
  }

  // (b) cursuri recurente care rulează în ziua săptămânii a datei, în acea sală.
  // DOAR sezonul activ: fără filtru, cursurile din sezoanele arhivate (ex. orarul
  // de weekend din sezonul trecut) ar genera conflicte fantomă la rezervare.
  const sezon = await sezonActivId()
  if (!sezon) return null
  const weekday = new Date(`${params.data}T00:00:00`).getDay()
  const { data: cursuri, error: cErr } = await supabase
    .from('cursuri')
    .select('numele, zile, ora, ore_pe_zi, durata_cursului')
    .eq('sala', params.sala)
    .eq('sezon', sezon)
    .eq('suspendat', false)
  if (cErr) throw cErr
  for (const c of cursuri ?? []) {
    const zile = c.zile ?? []
    const zi = zile.find((z) => ZI_TO_JS[z] === weekday)
    if (!zi) continue
    const map = getOrePeZi(c)
    const ora = map?.[zi] ?? c.ora
    const cs = timeToMinutes(ora)
    if (cs == null) continue
    const ce = cs + (c.durata_cursului ?? 60)
    if (intervalsOverlap(startMin, endMin, cs, ce)) {
      return {
        kind: 'curs',
        label: c.numele ?? 'curs',
        ora_start: ora ?? '',
        ora_final: `${String(Math.floor(ce / 60)).padStart(2, '0')}:${String(ce % 60).padStart(2, '0')}`,
      }
    }
  }

  return null
}

// ---------- Detaliu (pentru modalul de editare/anulare) ----------
export type InchiriereDetail = {
  id: string
  sala: string
  locatie: string | null
  data: string
  ora_start: string
  ora_final: string
  durata_min: number
  tier: Enums<'tier_inchiriere'>
  pret: number | null
  status_plata: Enums<'status_plata_inchiriere'>
  teacher: string | null
  client: string | null
  guest_nume: string | null
  guest_tel: string | null
  observatii: string | null
  sala_rel: { nume: string | null } | null
  teacher_rel: { nume: string | null; prenume: string | null } | null
  client_rel: { nume: string | null; prenume: string | null } | null
  incasat: number // suma deja încasată pe această închiriere (rest = pret - incasat)
}

// maybeSingle: după anulare, refetch-ul tranzitoriu al rândului șters întoarce
// null (fără eroare 406), nu aruncă.
export async function getInchiriereDetail(
  id: string,
): Promise<InchiriereDetail | null> {
  const { data, error } = await supabase
    .from('inchirieri')
    .select(
      'id, sala, locatie, data, ora_start, ora_final, durata_min, tier, pret, status_plata, teacher, client, guest_nume, guest_tel, observatii, sala_rel:sali(nume), teacher_rel:teacheri(nume,prenume), client_rel:clienti(nume,prenume), incasari(suma)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { incasari, ...row } = data as unknown as Omit<
    InchiriereDetail,
    'incasat'
  > & { incasari: { suma: number | null }[] | null }
  const incasat = round2(
    (incasari ?? []).reduce((s, i) => s + (Number(i.suma) || 0), 0),
  )
  return { ...row, incasat }
}

// ---------- Creare închiriere + plată ----------
export type InchiriereRenter =
  | { kind: 'teacher'; teacherId: string; freePractice: boolean }
  | { kind: 'client'; clientId: string }
  | { kind: 'guest'; nume: string; tel: string }

export interface CreateInchiriereParams {
  sala: string
  locatie: string | null
  data: string
  oraStart: string
  durataMin: number
  tier: Enums<'tier_inchiriere'>
  renter: InchiriereRenter
  pret: number
  collected: number // 0..pret încasat acum
  tenders: Tender[]
  descriere: string // rezumat pt observații încasare/datorie (sală, dată, interval, chiriaș)
  observatii?: string | null
  locatieId: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

// 23P01 = exclusion constraint `inchirieri_no_overlap`: altă tranzacție a prins
// slotul între verificarea client-side de conflict și insert/update.
const mapInchiriereError = (e: { code?: string }): unknown =>
  e && typeof e === 'object' && 'code' in e && e.code === '23P01'
    ? new Error('Interval ocupat — altcineva tocmai a rezervat acest slot.')
    : e

export async function createInchiriere(
  params: CreateInchiriereParams,
): Promise<Inchiriere> {
  const oraFinal = computeOraFinal(params.oraStart, params.durataMin)
  if (!oraFinal) throw new Error('Oră de start invalidă.')

  const pret = round2(params.pret)
  const collected = round2(Math.min(Math.max(0, params.collected), pret))
  const rest = round2(pret - collected)

  // Guest (walk-in fără cont) trebuie să achite integral pe loc — n-avem cum să-l urmărim.
  // Client → datoria stă pe cont; teacher → sold neachitat pe rândul închirierii
  // (fără cont, urmărit prin status_plata + încasări legate de inchiriere).
  if (rest > 0.001 && params.renter.kind === 'guest') {
    throw new Error('Guest trebuie să achite integral pe loc.')
  }

  const clientId =
    params.renter.kind === 'client' ? params.renter.clientId : null

  // 1) Datorie (doar client cu rest > 0)
  let datorieId: string | null = null
  if (rest > 0.001 && clientId) {
    const datorie = await createDatorie({
      client: clientId,
      categorie: 'Inchiriere',
      descriere: params.descriere,
      suma_datorata: pret,
      locatie: params.locatieId,
    })
    datorieId = datorie.id
  }

  const status_plata: Enums<'status_plata_inchiriere'> =
    rest <= 0.001 ? 'achitat' : collected > 0.001 ? 'partial' : 'neachitat'

  // 2) Rândul de închiriere
  const insert: InsertDto<'inchirieri'> = {
    sala: params.sala,
    locatie: params.locatie,
    data: params.data,
    ora_start: params.oraStart,
    ora_final: oraFinal,
    durata_min: params.durataMin,
    tier: params.tier,
    teacher: params.renter.kind === 'teacher' ? params.renter.teacherId : null,
    client: clientId,
    guest_nume: params.renter.kind === 'guest' ? params.renter.nume.trim() : null,
    guest_tel:
      params.renter.kind === 'guest'
        ? normalizeTelefon(params.renter.tel)
        : null,
    pret,
    status_plata,
    datorie: datorieId,
    observatii: params.observatii?.trim() || null,
  }
  const { data: inchiriere, error } = await supabase
    .from('inchirieri')
    .insert(insert)
    .select('*')
    .single()
  if (error) throw mapInchiriereError(error)

  // 3) Încasări (dacă s-a încasat ceva). Categorie 'Inchiriere'; legate de datorie
  //    când e plată parțială de client.
  if (collected > 0.001) {
    const tenders =
      params.tenders.length > 0
        ? params.tenders
        : [{ metoda: 'Cash' as Enums<'metoda_plata'>, suma: collected }]
    const payloads: InsertDto<'incasari'>[] = tenders.map((t) => ({
      client: clientId,
      data: params.data,
      suma: round2(t.suma),
      metoda: t.metoda,
      categorie: 'Inchiriere',
      locatie: params.locatieId,
      observatii: params.descriere,
      datorie: datorieId,
      inchiriere: inchiriere.id,
    }))
    await createIncasari(payloads)
  }

  return inchiriere
}

// Încasare ulterioară a soldului rămas pe o închiriere (teacher/guest fără cont, dar și
// client). Adaugă încasările legate de închiriere și recalculează status_plata din suma
// totală încasată vs preț. Pentru client, dacă închirierea are o datorie legată, o leagă și
// pe ea (ca plata să se scadă din restanța de pe cont).
export async function collectInchiriere(
  id: string,
  params: { tenders: Tender[]; data: string; locatieId: string; descriere: string },
): Promise<void> {
  const { data: row, error: rowErr } = await supabase
    .from('inchirieri')
    .select('pret, client, datorie, incasari(suma)')
    .eq('id', id)
    .single()
  if (rowErr) throw rowErr

  const pret = round2(Number(row.pret) || 0)
  const already = round2(
    ((row.incasari as { suma: number | null }[] | null) ?? []).reduce(
      (s, i) => s + (Number(i.suma) || 0),
      0,
    ),
  )
  const adding = round2(params.tenders.reduce((s, t) => s + (Number(t.suma) || 0), 0))
  if (adding <= 0.001) throw new Error('Suma de încasat trebuie să fie mai mare ca 0.')
  if (already + adding > pret + 0.001) {
    throw new Error('Suma depășește restul de plată al închirierii.')
  }

  const payloads: InsertDto<'incasari'>[] = params.tenders.map((t) => ({
    client: (row.client as string | null) ?? null,
    data: params.data,
    suma: round2(t.suma),
    metoda: t.metoda,
    categorie: 'Inchiriere',
    locatie: params.locatieId,
    observatii: params.descriere,
    datorie: (row.datorie as string | null) ?? null,
    inchiriere: id,
  }))
  await createIncasari(payloads)

  const total = round2(already + adding)
  const status_plata: Enums<'status_plata_inchiriere'> =
    total >= pret - 0.001 ? 'achitat' : total > 0.001 ? 'partial' : 'neachitat'
  const { error: updErr } = await supabase
    .from('inchirieri')
    .update({ status_plata })
    .eq('id', id)
  if (updErr) throw updErr
}

// Mutare/editare interval (dată/oră/durată) — recalculează ora_final.
// NB: prețul NU se atinge aici; recalculul + reconcilierea banilor se fac separat
// prin adjustInchirierePrice (durata schimbă treapta de tarif).
export async function updateInchiriere(
  id: string,
  patch: { data: string; oraStart: string; durataMin: number },
): Promise<void> {
  const oraFinal = computeOraFinal(patch.oraStart, patch.durataMin)
  if (!oraFinal) throw new Error('Oră de start invalidă.')
  const { error } = await supabase
    .from('inchirieri')
    .update({
      data: patch.data,
      ora_start: patch.oraStart,
      ora_final: oraFinal,
      durata_min: patch.durataMin,
      updated: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw mapInchiriereError(error)
}

// Ajustare preț la editare, cu reconciliere automată a banilor (datorie/credit).
// Vezi migrația 20260703200000: pentru un client, diferența devine datorie sau
// credit; pentru teacher/guest se reglează manual din Plăți (has_account=false).
export type AdjustInchiriereResult = {
  old_pret: number | null
  new_pret: number
  paid: number
  rest: number
  status: Enums<'status_plata_inchiriere'>
  has_account: boolean
}

export async function adjustInchirierePrice(
  id: string,
  newPret: number,
): Promise<AdjustInchiriereResult> {
  const { data, error } = await supabase.rpc('adjust_inchiriere_price', {
    p_inchiriere: id,
    p_new_pret: round2(newPret),
  })
  if (error) throw error
  return data as AdjustInchiriereResult
}

// Anulare închiriere: șterge rândul (eliberează slotul). Dacă avea o datorie fără
// nicio încasare (neplătită), o șterge și pe ea (fără impact pe bani). Dacă există
// încasări, ele rămân (evidență financiară) → refund manual din Plăți.
export async function cancelInchiriere(
  id: string,
): Promise<{ hadPayments: boolean }> {
  const { data: row, error: fErr } = await supabase
    .from('inchirieri')
    .select('datorie')
    .eq('id', id)
    .single()
  if (fErr) throw fErr

  const { error: dErr } = await supabase.from('inchirieri').delete().eq('id', id)
  if (dErr) throw dErr

  let hadPayments = false
  if (row?.datorie) {
    const { count } = await supabase
      .from('incasari')
      .select('id', { count: 'exact', head: true })
      .eq('datorie', row.datorie)
    if ((count ?? 0) === 0) {
      await supabase.from('datorii').delete().eq('id', row.datorie)
    } else {
      hadPayments = true
    }
  }
  return { hadPayments }
}
