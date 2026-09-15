import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'
import { buildBulkSms, type SmsRecipient } from '@/features/notificari-sms/templates'

export type CanalContact = Enums<'canal_contact'>
export type RezultatContact = Enums<'rezultat_contact'>

export type WorklistRow = {
  client_id: string
  nume: string
  prenume: string | null
  telefon: string | null
  nume_locatie: string | null
  rest_total: number
  nr_rate_neachitate: number
  zile_depasire: number | null
  ultima_prezenta: string | null
  ultim_apel_at: string | null
  ultim_apel_rezultat: string | null
  promisiune_data: string | null
  promisiune_suma: number | null
  promisiune_logata_at: string | null
  id_locatie: string | null
  cursuri: string | null
  suspendat: boolean
  ultim_sms_at: string | null
  status_client: 'Activ' | 'Inactiv' | 'EXclient' | null
  // Suspendat de cron-ul „50 de zile", nu de un om ⇒ locul așteaptă decizia
  // managerului. Vezi docs/reguli-preturi-reduceri.md §3b.
  suspendat_automat: boolean
}

// Worklist de recuperare: TOȚI clienții (indiferent de status — datoria se
// stinge doar la prescriere) cu cel puțin o rată chiar depășită (nu doar luna
// curentă, neajunsă încă la scadență), sortați după zile de întârziere.
// locatieId/sezonId = uuid sau null = toate (sezonul e aliniat cu
// get_sms_recipients — UI presetează sezonul activ). luna ('YYYY-MM') și cursId
// ȚINTESC clienții (au o rată depășită în luna / pe cursul respectiv), dar
// totalul afișat rămâne cel complet (toate lunile lor restante).
// doarDepasite=false: și clienții cu rest doar pe rate neajunse la scadență
// (atunci și ținta pe lună/curs acceptă rate neajunse la scadență).
export type WorklistFilters = {
  locatieId: string | null
  sezonId?: string | null
  luna?: string | null
  cursId?: string | null
  doarDepasite?: boolean
}

function worklistParams(f: WorklistFilters) {
  return {
    ...(f.locatieId ? { p_locatie: f.locatieId } : {}),
    ...(f.sezonId ? { p_sezon: f.sezonId } : {}),
    ...(f.luna ? { p_luna: `${f.luna}-01` } : {}),
    ...(f.cursId ? { p_curs: f.cursId } : {}),
    ...(f.doarDepasite === false ? { p_doar_depasite: false } : {}),
  }
}

export async function getRestanteWorklist(f: WorklistFilters): Promise<WorklistRow[]> {
  const { data, error } = await supabase.rpc('get_restante_worklist', worklistParams(f))
  if (error) throw error
  return (data ?? []) as unknown as WorklistRow[]
}

// Vederea „Pe rate" (fostul tab Restanțe din /financiar): un rând = o rată
// (lună × curs) a unui client, aceeași bază ca worklist-ul. Aici filtrele de
// lună / curs / depășire se aplică PE RÂND, nu pe client.
export type RateRow = {
  id_enrollment: string
  client_id: string
  nume: string
  prenume: string | null
  telefon: string | null
  id_locatie: string | null
  nume_locatie: string | null
  id_curs: string | null
  nume_curs: string | null
  data_incepere: string
  scadenta: string
  zile_depasire: number
  total_de_plata: number
  platit: number
  rest: number
  status_client: 'Activ' | 'Inactiv' | 'EXclient' | null
  suspendat: boolean
}

export async function getRestanteRate(f: WorklistFilters): Promise<RateRow[]> {
  const { data, error } = await supabase.rpc('get_restante_worklist_rate', worklistParams(f))
  if (error) throw error
  return ((data ?? []) as unknown as RateRow[]).map((r) => ({
    ...r,
    total_de_plata: Number(r.total_de_plata ?? 0),
    platit: Number(r.platit ?? 0),
    rest: Number(r.rest ?? 0),
  }))
}

// O promisiune e „încălcată" dacă data promisă a trecut și clientul e încă în
// worklist (rest > 0) — nu ținem un flag în DB, derivarea e suficientă.
export function promisiuneIncalcata(r: WorklistRow): boolean {
  if (!r.promisiune_data) return false
  return r.promisiune_data <= new Date().toISOString().slice(0, 10)
}

// Status de colectare DERIVAT (nu stocat): Loc de anulat > Suspendat >
// Promisiune > Reminder trimis (SMS de restanță în luna curentă) > De contactat.
export type StatusColectare =
  | 'loc_de_anulat'
  | 'suspendat'
  | 'promisiune'
  | 'reminder'
  | 'de_contactat'

export const STATUS_COLECTARE_LABEL: Record<StatusColectare, string> = {
  loc_de_anulat: 'Loc de anulat',
  suspendat: 'Suspendat',
  promisiune: 'Promisiune',
  reminder: 'Reminder trimis',
  de_contactat: 'De contactat',
}

export function statusColectare(r: WorklistRow): StatusColectare {
  // Suspendarea automată cere o decizie (reziliere sau reactivare), cea manuală
  // înseamnă că decizia a fost deja luată de un om.
  if (r.suspendat && r.suspendat_automat) return 'loc_de_anulat'
  if (r.suspendat) return 'suspendat'
  if (r.promisiune_data) return 'promisiune'
  if (r.ultim_sms_at && r.ultim_sms_at.slice(0, 7) === new Date().toISOString().slice(0, 7))
    return 'reminder'
  return 'de_contactat'
}

// Suspendă / reactivează accesul (prezență + rezervări OPEN) — doar manager+,
// gardul real e în RPC. Plata rămâne mereu permisă.
export async function setSuspendareDatornic(
  clientId: string,
  suspendat: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_suspendare_datorii', {
    p_client: clientId,
    p_suspendat: suspendat,
  })
  if (error) throw error
}

// SMS individual de restanță: același template notificare_restante ca fluxul
// bulk (regula „doar template"), pus în coada „De trimis" (situatie_sms_uri).
export async function queueSmsRestanta(r: WorklistRow): Promise<void> {
  if (!r.telefon?.trim()) throw new Error('Clientul nu are un telefon valid.')
  const recipient: SmsRecipient = {
    familia_id: r.client_id,
    telefon: r.telefon,
    locatie_nume: r.nume_locatie,
    scadenta: null,
    membri: [{ nume: `${r.nume} ${r.prenume ?? ''}`.trim(), rest: r.rest_total }],
    total_restanta: r.rest_total,
    zile_depasire: r.zile_depasire,
    client_ids: [r.client_id],
    are_reducere: false, // irelevant pentru notificare_restante (doar reminder_plata îl folosește)
  }
  const { error } = await supabase.from('situatie_sms_uri').insert({
    telefon: r.telefon,
    cod_mesaj: 'notificare_restante',
    locatie: r.id_locatie,
    clienti_vizati: [r.client_id],
    mesaj: buildBulkSms('notificare_restante', recipient),
    status: 'De trimis',
    data_planificata: new Date().toISOString().slice(0, 10),
  })
  if (error) throw error
}

// Agregatul CANONIC al datoriilor (abonamente + one-off), per locație.
// locatieId null → un rând per locație (varianta comparativă „Toate locațiile").
export type DatoriiLocatieRow = {
  id_locatie: string | null
  nume_locatie: string | null
  de_incasat: number
  incasat: number
  rest_net: number
  rest_oneoff: number
  rest_prescris: number
  nr_datornici: number
  // Cifrele lunii curente — pe ele se conduce recuperarea (și bonusul lunar).
  de_incasat_luna: number
  rest_luna: number
  rest_luna_oneoff: number
  recuperat_luna: number
}

export async function getDatoriiDashboard(
  locatieId: string | null,
): Promise<DatoriiLocatieRow[]> {
  const { data, error } = await supabase.rpc('get_datorii_dashboard', {
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as unknown as DatoriiLocatieRow[]).map((r) => ({
    ...r,
    de_incasat: Number(r.de_incasat ?? 0),
    incasat: Number(r.incasat ?? 0),
    rest_net: Number(r.rest_net ?? 0),
    rest_oneoff: Number(r.rest_oneoff ?? 0),
    rest_prescris: Number(r.rest_prescris ?? 0),
    nr_datornici: Number(r.nr_datornici ?? 0),
    de_incasat_luna: Number(r.de_incasat_luna ?? 0),
    rest_luna: Number(r.rest_luna ?? 0),
    rest_luna_oneoff: Number(r.rest_luna_oneoff ?? 0),
    recuperat_luna: Number(r.recuperat_luna ?? 0),
  }))
}

// Sumele KPI globale = suma rândurilor per locație. nr_datornici e „pe locații"
// (un client cu datorii la 2 locații se numără la fiecare) — etichetat în UI.
export function sumDatorii(rows: DatoriiLocatieRow[]): DatoriiLocatieRow {
  const zero: DatoriiLocatieRow = {
    id_locatie: null,
    nume_locatie: null,
    de_incasat: 0,
    incasat: 0,
    rest_net: 0,
    rest_oneoff: 0,
    rest_prescris: 0,
    nr_datornici: 0,
    de_incasat_luna: 0,
    rest_luna: 0,
    rest_luna_oneoff: 0,
    recuperat_luna: 0,
  }
  return rows.reduce(
    (a, r) => ({
      ...a,
      de_incasat: a.de_incasat + r.de_incasat,
      incasat: a.incasat + r.incasat,
      rest_net: a.rest_net + r.rest_net,
      rest_oneoff: a.rest_oneoff + r.rest_oneoff,
      rest_prescris: a.rest_prescris + r.rest_prescris,
      nr_datornici: a.nr_datornici + r.nr_datornici,
      de_incasat_luna: a.de_incasat_luna + r.de_incasat_luna,
      rest_luna: a.rest_luna + r.rest_luna,
      rest_luna_oneoff: a.rest_luna_oneoff + r.rest_luna_oneoff,
      recuperat_luna: a.recuperat_luna + r.recuperat_luna,
    }),
    zero,
  )
}

// Restanța LUNII CURENTE (abonamente + one-off) — cifra „de acțiune" de pe /datorii.
export function restLuna(r: { rest_luna: number; rest_luna_oneoff: number }): number {
  return r.rest_luna + r.rest_luna_oneoff
}

// Restanța cumulată pe toate lunile (fără prescrise) — context, nu titlu.
export function restTotal(r: { rest_net: number; rest_oneoff: number }): number {
  return r.rest_net + r.rest_oneoff
}

// Rata restanțe pe LUNA CURENTĂ: rest ÷ de-încasat pe lună — aceeași formulă ca
// rata de portofoliu din /scorecard (acolo doar abonamente; aici + one-off).
// Lunară pentru că recuperarea se conduce și se bonusează lunar (user 08-25).
export function rataRestantePct(r: {
  de_incasat_luna: number
  rest_luna: number
  rest_luna_oneoff: number
}): number | null {
  if (r.de_incasat_luna <= 0) return null
  return Math.round((restLuna(r) / r.de_incasat_luna) * 1000) / 10
}

// Balanța pe grupe pentru o lună ('YYYY-MM'): încasat în lună (cash-in) ·
// restant luna asta · restant luni anterioare din sezon. Doar grupe cu activitate.
export type BalantaGrupaRow = {
  id_curs: string
  nume_curs: string
  nume_locatie: string | null
  incasat_luna: number
  restant_luna: number
  restant_anterior: number
  nr_clienti_restanti: number
}

export async function getBalantaGrupe(
  luna: string,
  locatieId: string | null,
): Promise<BalantaGrupaRow[]> {
  const { data, error } = await supabase.rpc('get_balanta_grupe', {
    p_luna: `${luna}-01`,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as unknown as BalantaGrupaRow[]).map((r) => ({
    ...r,
    incasat_luna: Number(r.incasat_luna ?? 0),
    restant_luna: Number(r.restant_luna ?? 0),
    restant_anterior: Number(r.restant_anterior ?? 0),
    nr_clienti_restanti: Number(r.nr_clienti_restanti ?? 0),
  }))
}

// Loghează un apel de recuperare pe un client. Suma efectiv recuperată NU se ia
// de aici — se citește din încasările reale care urmează apelului (apel precede
// plata, fereastră de N zile) în get_scorecard_restante.
export async function logRecuperareContact(input: {
  clientId: string
  canal: CanalContact
  rezultat: RezultatContact
  sumaPromisa?: number | null
  promisiuneData?: string | null
  observatii?: string
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase.from('client_contacte').insert({
    client_id: input.clientId,
    user_id: user?.id,
    canal: input.canal,
    rezultat: input.rezultat,
    scop: 'recuperare',
    suma_promisa: input.sumaPromisa ?? null,
    promisiune_data: input.promisiuneData || null,
    observatii: input.observatii?.trim() || null,
  })
  if (error) throw error
}
