import { supabase } from '@/lib/supabase'
import { getSmsQuietHours } from '@/features/setari/api/sms'
import type { SituatieSms, InsertDto } from '@/types/db'
import type { SmsBulkCod, SmsRecipient, SmsRecipientMembru } from './templates'
import type { ScadenteSezon } from './calendar'

export const PAGE_SIZE = 25

export type SmsQueueParams = {
  status: string
  page: number
}

export type SmsQueueRow = SituatieSms & { nume: string | null }

export type SmsQueueResult = {
  rows: SmsQueueRow[]
  total: number
}

export async function listSmsQueue({
  status,
  page,
}: SmsQueueParams): Promise<SmsQueueResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('situatie_sms_uri')
    .select('*', { count: 'exact' })
    .order('created', { ascending: false })
    .range(from, to)

  if (status) {
    query = query.eq('status', status as NonNullable<SituatieSms['status']>)
  }

  const { data, error, count } = await query
  if (error) throw error
  const rows = data ?? []
  return { rows: await cuNume(rows), total: count ?? 0 }
}

// Ultimele 9 cifre — singurul numitor comun al formatelor din DB (07…, 40…, +40…).
function nucleuTelefon(t: string | null): string | null {
  const d = (t ?? '').replace(/\D/g, '')
  return d.length >= 9 ? d.slice(-9) : null
}

// Numele de lângă telefon: din `clienti_vizati` când există (rândurile compuse din
// worklist le au), altfel din telefon — rândurile de contract pe familie n-au copil.
async function cuNume(rows: SituatieSms[]): Promise<SmsQueueRow[]> {
  const clientIds = [...new Set(rows.flatMap((r) => r.clienti_vizati ?? []))]

  const numePeClient = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data } = await supabase
      .from('clienti')
      .select('id, nume, prenume')
      .in('id', clientIds)
    for (const c of data ?? []) {
      numePeClient.set(c.id, `${c.nume ?? ''} ${c.prenume ?? ''}`.trim())
    }
  }

  const numeDinVizati = (r: SituatieSms): string | null => {
    const nume = (r.clienti_vizati ?? [])
      .map((id) => numePeClient.get(id))
      .filter((n): n is string => !!n)
    if (nume.length === 0) return null
    return nume.length <= 2 ? nume.join(', ') : `${nume.slice(0, 2).join(', ')} +${nume.length - 2}`
  }

  // Fallback pe telefon, doar pentru rândurile rămase fără nume.
  const nuclee = [
    ...new Set(
      rows
        .filter((r) => !numeDinVizati(r))
        .map((r) => nucleuTelefon(r.telefon))
        .filter((n): n is string => !!n),
    ),
  ]
  const numePeTelefon = new Map<string, string>()
  if (nuclee.length > 0) {
    const filtru = nuclee.map((n) => `telefon.ilike.%${n}`).join(',')
    const [fam, cli] = await Promise.all([
      supabase.from('familii').select('telefon, nume_familie').or(filtru),
      supabase.from('clienti').select('telefon, nume, prenume').or(filtru),
    ])
    // Clientul are prioritate: e mai specific decât numele de familie.
    for (const f of fam.data ?? []) {
      const k = nucleuTelefon(f.telefon)
      if (k && f.nume_familie) numePeTelefon.set(k, `Familia ${f.nume_familie}`)
    }
    for (const c of cli.data ?? []) {
      const k = nucleuTelefon(c.telefon)
      if (k) numePeTelefon.set(k, `${c.nume ?? ''} ${c.prenume ?? ''}`.trim())
    }
  }

  return rows.map((r) => {
    const nucleu = nucleuTelefon(r.telefon)
    return {
      ...r,
      nume: numeDinVizati(r) ?? (nucleu ? numePeTelefon.get(nucleu) ?? null : null),
    }
  })
}

export async function createSmsQueueEntry(
  dto: InsertDto<'situatie_sms_uri'>,
): Promise<SituatieSms> {
  const { data, error } = await supabase
    .from('situatie_sms_uri')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Prin RPC, nu delete direct: pentru un rând 'Amanat' mesajul real stă în
// `sms_amanate` și ștergerea doar din listă i-ar ascunde trimiterea, nu ar opri-o.
// RPC-ul returnează false dacă rândul nu mai exista (altcineva l-a șters între timp).
export async function deleteSmsQueueEntry(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_sms_queue_entry', { p_id: id })
  if (error) throw error
  if (data === false) throw new Error('Rândul nu mai există — lista era veche.')
}

export type ProcessResult = {
  total: number
  sent: number
  failed: number
  // Rânduri „De trimis" cu `data_planificata` în viitor — rămân în coadă până la
  // termenul lor, procesorul nu le atinge.
  programate?: number
  // Prezent doar când drain-ul a picat în zona interzisă: rândurile au trecut pe
  // 'Amanat' și pleacă singure dimineața.
  deferred?: number
  quiet?: boolean
  error?: string
}

export async function processSmsQueue(): Promise<ProcessResult> {
  const { data, error } = await supabase.functions.invoke('process-sms-queue', {
    body: {},
  })
  if (error) throw error
  return data as ProcessResult
}

// ============================================================
// Flux bulk plăți/restanțe (double-check)
// ============================================================

export type SmsRecipientsParams = {
  locatie?: string
  sezon?: string
  cod: SmsBulkCod
}

// Extrage destinatarii (familii) cu restanțe / activi, grupați pe telefon.
export async function getSmsRecipients({
  locatie,
  sezon,
  cod,
}: SmsRecipientsParams): Promise<SmsRecipient[]> {
  const { data, error } = await supabase.rpc('get_sms_recipients', {
    p_locatie: locatie || undefined,
    p_sezon: sezon || undefined,
    p_cod: cod,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    familia_id: r.familia_id,
    telefon: r.telefon ?? '',
    locatie_nume: r.nume_locatie ?? null,
    scadenta: r.scadenta ?? null,
    membri: (r.membri as unknown as SmsRecipientMembru[]) ?? [],
    total_restanta: Number(r.total_restanta ?? 0),
    zile_depasire: r.zile_depasire,
    client_ids: r.client_ids ?? [],
    are_reducere: r.are_reducere ?? false,
  }))
}

// Termenele sezonului, din care se calculează calendarul trimiterilor.
export async function getScadenteSezon(sezonId: string): Promise<ScadenteSezon> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('data_incepere, data_final, scadenta_prima_rata, scadenta_ultima_rata')
    .eq('id', sezonId)
    .single()
  if (error) throw error
  return data
}

// Inserare în lot a SMS-urilor compuse în coadă (status 'De trimis').
export async function createSmsQueueBatch(
  rows: InsertDto<'situatie_sms_uri'>[],
): Promise<number> {
  if (rows.length === 0) return 0
  const { error } = await supabase.from('situatie_sms_uri').insert(rows)
  if (error) throw error
  return rows.length
}

// Clienții cărora li s-a programat deja un anumit cod de mesaj în luna curentă —
// folosit pentru pre-bifare (dedup), ca în v1 (Enabled = !Status).
export async function getClientiVizatiLunaCurenta(
  cod: SmsBulkCod,
): Promise<Set<string>> {
  const startLuna = new Date()
  startLuna.setDate(1)
  startLuna.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('situatie_sms_uri')
    .select('clienti_vizati')
    .eq('cod_mesaj', cod)
    .gte('created', startLuna.toISOString())
  if (error) throw error

  const set = new Set<string>()
  for (const row of data ?? []) {
    for (const id of row.clienti_vizati ?? []) set.add(id)
  }
  return set
}

// ============================================================
// SMS-uri amânate de zona interzisă (status 'Amanat')
// ============================================================

export type SmsAmanateInfo = {
  count: number
  // Ora locală la care iese din fereastra interzisă ("HH:MM"), din config.
  oraPlecare: string
  // true dacă ora de ieșire e azi (încă n-a trecut), false → mâine dimineață.
  azi: boolean
}

// Minutele scurse din ziua locală (Europe/Bucharest) — aceeași convenție ca în
// _shared/quietHours.ts, ca bannerul să nu mintă când browserul e pe alt fus.
function minuteLocale(d: Date): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .split(':')
    .map(Number)
  return h * 60 + m
}

export async function getSmsAmanateInfo(): Promise<SmsAmanateInfo> {
  const [{ count, error }, cfg] = await Promise.all([
    supabase
      .from('situatie_sms_uri')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Amanat'),
    // Config-ul e citibil doar de admin/owner; pentru restul cade pe același default
    // ca edge functions, ca bannerul să nu dispară pe rolurile mici.
    getSmsQuietHours().catch(() => ({ enabled: true, start: '19:30', end: '10:00' })),
  ])
  if (error) throw error

  const [h, m] = cfg.end.split(':').map(Number)
  const acum = minuteLocale(new Date())
  return {
    count: count ?? 0,
    oraPlecare: cfg.end,
    azi: acum < (h || 0) * 60 + (m || 0),
  }
}
