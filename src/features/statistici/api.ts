import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'
import { getGradOcupare, getCrestereNeta } from '@/features/ansamblu/api'

export type Kpis = {
  incasari: number
  cheltuieli: number
  profit: number
  restanteTotal: number
}

export type LunaBalanta = {
  luna: string
  incasat: number
  datorie: number
}

export type MetodaPunct = {
  metoda: Enums<'metoda_plata'> | 'Necunoscut'
  total: number
}

export type Interval = {
  fromLuna: string
  toLuna: string
}

function lunaToBounds(luna: string): { from: string; to: string } {
  const [y, m] = luna.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(start), to: iso(end) }
}

export function lunaCurenta(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function lunaCuOffset(offset: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function getSezonActiv(): Promise<Interval | null> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('data_incepere, data_final')
    .eq('activ', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.data_incepere || !data?.data_final) return null
  return {
    fromLuna: data.data_incepere.slice(0, 7),
    toLuna: data.data_final.slice(0, 7),
  }
}

export function lunileInInterval(fromLuna: string, toLuna: string): string[] {
  if (fromLuna > toLuna) return []
  const out: string[] = []
  const [fy, fm] = fromLuna.split('-').map(Number)
  const [ty, tm] = toLuna.split('-').map(Number)
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function intervalToDateRange(i: Interval): { from: string; to: string } {
  return {
    from: lunaToBounds(i.fromLuna).from,
    to: lunaToBounds(i.toLuna).to,
  }
}

export async function getKpis(i: Interval): Promise<Kpis> {
  const { from, to } = intervalToDateRange(i)

  const [incRes, chelRes, restRes] = await Promise.all([
    supabase.from('incasari').select('suma').gte('data', from).lte('data', to),
    supabase
      .from('cheltuieli')
      .select('valoare')
      .gte('data', from)
      .lte('data', to),
    supabase.from('plati_inrolari').select('rest').gt('rest', 0),
  ])

  if (incRes.error) throw incRes.error
  if (chelRes.error) throw chelRes.error
  if (restRes.error) throw restRes.error

  const incasari = (incRes.data ?? []).reduce(
    (acc, r) => acc + Number(r.suma ?? 0),
    0,
  )
  const cheltuieli = (chelRes.data ?? []).reduce(
    (acc, r) => acc + Number(r.valoare ?? 0),
    0,
  )
  const restanteTotal = (restRes.data ?? []).reduce(
    (acc, r) => acc + Number(r.rest ?? 0),
    0,
  )

  return {
    incasari,
    cheltuieli,
    profit: incasari - cheltuieli,
    restanteTotal,
  }
}

async function fetchBalanta(
  i: Interval,
  filterColumn: 'locatie' | 'curs' | null,
  filterValue: string | null,
): Promise<LunaBalanta[]> {
  let qDe = supabase
    .from('de_incasat_pe_luna')
    .select('luna, de_incasat, locatie, curs')
    .gte('luna', i.fromLuna)
    .lte('luna', i.toLuna)
  let qInc = supabase
    .from('incasat_pe_luna')
    .select('luna, incasat, locatie, curs')
    .gte('luna', i.fromLuna)
    .lte('luna', i.toLuna)

  if (filterColumn && filterValue) {
    qDe = qDe.eq(filterColumn, filterValue)
    qInc = qInc.eq(filterColumn, filterValue)
  }

  const [deRes, incRes] = await Promise.all([qDe, qInc])
  if (deRes.error) throw deRes.error
  if (incRes.error) throw incRes.error

  const byLuna = new Map<string, { de_incasat: number; incasat: number }>()
  for (const row of deRes.data ?? []) {
    const luna = row.luna ?? ''
    if (!luna) continue
    const cur = byLuna.get(luna) ?? { de_incasat: 0, incasat: 0 }
    cur.de_incasat += Number(row.de_incasat ?? 0)
    byLuna.set(luna, cur)
  }
  for (const row of incRes.data ?? []) {
    const luna = row.luna ?? ''
    if (!luna) continue
    const cur = byLuna.get(luna) ?? { de_incasat: 0, incasat: 0 }
    cur.incasat += Number(row.incasat ?? 0)
    byLuna.set(luna, cur)
  }

  const luniInterval = lunileInInterval(i.fromLuna, i.toLuna)
  return luniInterval.map((luna) => {
    const v = byLuna.get(luna) ?? { de_incasat: 0, incasat: 0 }
    const datorie = Math.max(0, v.de_incasat - v.incasat)
    return { luna, incasat: v.incasat, datorie }
  })
}

export async function getBalantaLocatie(
  i: Interval,
  locatieId: string | null,
): Promise<LunaBalanta[]> {
  return fetchBalanta(i, locatieId ? 'locatie' : null, locatieId)
}

export async function getBalantaCurs(
  i: Interval,
  cursId: string | null,
): Promise<LunaBalanta[]> {
  return fetchBalanta(i, cursId ? 'curs' : null, cursId)
}

export type CategoriePunct = { categorie: string; total: number }

export async function getMixCategoriiIncasari(
  i: Interval,
): Promise<CategoriePunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase
    .from('incasari')
    .select('suma, categorie')
    .gte('data', from)
    .lte('data', to)
  if (error) throw error

  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const key = r.categorie ?? 'Necunoscut'
    map.set(key, (map.get(key) ?? 0) + Number(r.suma ?? 0))
  }
  return Array.from(map.entries())
    .map(([categorie, total]) => ({ categorie, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

export async function getMixCategoriiCheltuieli(
  i: Interval,
): Promise<CategoriePunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase
    .from('cheltuieli')
    .select('valoare, categorie')
    .gte('data', from)
    .lte('data', to)
  if (error) throw error

  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const key = r.categorie ?? 'Necunoscut'
    map.set(key, (map.get(key) ?? 0) + Number(r.valoare ?? 0))
  }
  return Array.from(map.entries())
    .map(([categorie, total]) => ({ categorie, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

// ============================================================================
// KPI-uri reînscrieri & sezoane
// ============================================================================

export type SezonOption = {
  id: string
  numele_sezonului: string
  stare: string
  tip: string
}

export async function listSezoaneTinta(): Promise<SezonOption[]> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului, stare, tip')
    .eq('tip', 'principal')
    .in('stare', ['planificat', 'activ'])
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return (data ?? []) as SezonOption[]
}

export type IncasariSezonRow = {
  sezon_id: string
  numele_sezonului: string
  tip: string
  stare: string
  data_incepere: string | null
  data_final: string | null
  total_incasari: number
}

export async function getIncasariPerSezon(): Promise<IncasariSezonRow[]> {
  const { data, error } = await supabase.rpc('get_incasari_per_sezon')
  if (error) throw error
  return ((data ?? []) as IncasariSezonRow[])
    .map((r) => ({
      ...r,
      total_incasari: Number(r.total_incasari ?? 0),
    }))
    // Cronologic (vechi → nou), ca restul graficelor; sezoanele fără dată la final.
    .sort((a, b) => {
      if (!a.data_incepere) return 1
      if (!b.data_incepere) return -1
      return a.data_incepere.localeCompare(b.data_incepere)
    })
}

// ============================================================================
// Prezențe pe achitare (model lună-cu-lună, mărginit la intervalul afișat)
// ============================================================================

export type PrezentaAchitareRow = {
  luna: string
  achitate: number
  neachitate: number
  din_trecut: number
}

export async function getStatisticaPrezenteAchitare(
  i: Interval,
  locatieId: string | null,
  teacherId: string | null,
): Promise<PrezentaAchitareRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_statistica_prezente_achitare', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
    ...(teacherId ? { p_teacher: teacherId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as PrezentaAchitareRow[]).map((r) => ({
    luna: r.luna,
    achitate: Number(r.achitate ?? 0),
    neachitate: Number(r.neachitate ?? 0),
    din_trecut: Number(r.din_trecut ?? 0),
  }))
}

// ============================================================================
// Overview „luna curentă" (independent de selectorul de interval)
// ============================================================================

export type RataPrezentaLuna = {
  global: { prezenti: number; posibile: number; rata: number }
  perLocatie: {
    nume: string
    prezenti: number
    posibile: number
    rata: number
  }[]
}

function rata(prezenti: number, posibile: number): number {
  return posibile > 0 ? Math.round((100 * prezenti) / posibile) : 0
}

// Rată prezență (engagement) pe luna curentă, doar cursuri recurent + trupă.
// global = sumă peste locații; perLocatie = defalcare.
export async function getRataPrezentaLuna(): Promise<RataPrezentaLuna> {
  const { data, error } = await supabase.rpc('get_rata_prezenta_luna')
  if (error) throw error

  const rows = (data ?? []).map((r) => ({
    nume: r.locatie_nume ?? 'Necunoscut',
    prezenti: Number(r.prezenti ?? 0),
    posibile: Number(r.posibile ?? 0),
    rata: rata(Number(r.prezenti ?? 0), Number(r.posibile ?? 0)),
  }))

  const prezenti = rows.reduce((a, r) => a + r.prezenti, 0)
  const posibile = rows.reduce((a, r) => a + r.posibile, 0)

  return {
    global: { prezenti, posibile, rata: rata(prezenti, posibile) },
    perLocatie: rows.sort((a, b) => b.posibile - a.posibile),
  }
}

export type OcupareTotala = {
  activi: number
  capacitate: number
  procent: number
}

// Grad de ocupare total al grupelor (luna curentă) — sumă peste get_grad_ocupare.
// Doar recurent + trupă (facultativ=false): la open class capacitatea e o limită
// per ședință, nu locuri de grupă — ar amesteca unități diferite. Consistent cu
// rata de prezență.
export async function getOcupareTotala(): Promise<OcupareTotala> {
  const rows = await getGradOcupare(null)
  let activi = 0
  let capacitate = 0
  for (const r of rows) {
    if (r.facultativ) continue
    const cap = Number(r.capacitate ?? 0)
    if (cap <= 0) continue
    activi += Number(r.activi ?? 0)
    capacitate += cap
  }
  return { activi, capacitate, procent: rata(activi, capacitate) }
}

export type RetentieLuna = {
  retinuti: number
  pierduti: number
  bazaPrev: number
  rata: number
}

// Retenție membri (înrolare): din cei activi luna trecută, câți au rămas luna asta.
// rata = (activi_prev − pierduti_curent) / activi_prev.
export async function getRetentieLuna(): Promise<RetentieLuna> {
  const rows = await getCrestereNeta(null, 2)
  if (rows.length < 2) {
    return { retinuti: 0, pierduti: 0, bazaPrev: 0, rata: 0 }
  }
  const prev = rows[rows.length - 2]
  const curent = rows[rows.length - 1]
  const bazaPrev = Number(prev.activi ?? 0)
  const pierduti = Number(curent.pierduti ?? 0)
  const retinuti = Math.max(0, bazaPrev - pierduti)
  return { retinuti, pierduti, bazaPrev, rata: rata(retinuti, bazaPrev) }
}

// ============================================================================
// Funnel leads — Lead → Contact → Probă → Prezent → Înscriere → Retenție 90z
// ============================================================================

export type FunnelSursaRow = {
  sursaId: string | null
  sursaNume: string
  leads: number
  contactati: number
  proba: number
  prezenti: number
  convertiti: number
  retentieEligibili: number
  retentie90z: number
}

export type LeadFunnel = {
  global: Omit<FunnelSursaRow, 'sursaId' | 'sursaNume'>
  perSursa: FunnelSursaRow[]
}

// Cohortă pe data intrării lead-ului; trepte cumulative (vezi RPC). Retenția
// 90z se raportează la baza „eligibilă" (convertiți maturi ≥90z), nu la toți.
export async function getLeadFunnel(
  i: Interval,
  locatieId: string | null,
  locatieLabel?: string | null,
): Promise<LeadFunnel> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_lead_funnel', {
    p_from: from,
    p_to: to,
    // RPC filtrează pe leads.locatia (TEXT label), nu pe uuid
    ...(locatieId && locatieLabel ? { p_locatie: locatieLabel } : {}),
  })
  if (error) throw error

  const perSursa: FunnelSursaRow[] = ((data ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({
      sursaId: (r.sursa_id as string) ?? null,
      sursaNume: (r.sursa_nume as string) ?? 'Necunoscută',
      leads: Number(r.leads_total ?? 0),
      contactati: Number(r.contactati ?? 0),
      proba: Number(r.proba ?? 0),
      prezenti: Number(r.prezenti ?? 0),
      convertiti: Number(r.convertiti ?? 0),
      retentieEligibili: Number(r.retentie_eligibili ?? 0),
      retentie90z: Number(r.retentie_90z ?? 0),
    }),
  )

  const global = perSursa.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      contactati: acc.contactati + r.contactati,
      proba: acc.proba + r.proba,
      prezenti: acc.prezenti + r.prezenti,
      convertiti: acc.convertiti + r.convertiti,
      retentieEligibili: acc.retentieEligibili + r.retentieEligibili,
      retentie90z: acc.retentie90z + r.retentie90z,
    }),
    {
      leads: 0,
      contactati: 0,
      proba: 0,
      prezenti: 0,
      convertiti: 0,
      retentieEligibili: 0,
      retentie90z: 0,
    },
  )

  return { global, perSursa }
}

// Venit (încasări) pe luna curentă.
export async function getVenitLunaCurenta(): Promise<number> {
  const { from, to } = lunaToBounds(lunaCurenta())
  const { data, error } = await supabase
    .from('incasari')
    .select('suma')
    .gte('data', from)
    .lte('data', to)
  if (error) throw error
  return (data ?? []).reduce((acc, r) => acc + Number(r.suma ?? 0), 0)
}

export async function getMixMetode(i: Interval): Promise<MetodaPunct[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase
    .from('incasari')
    .select('metoda, suma')
    .gte('data', from)
    .lte('data', to)
  if (error) throw error

  const map = new Map<string, number>()
  for (const r of data ?? []) {
    const key = r.metoda ?? 'Necunoscut'
    map.set(key, (map.get(key) ?? 0) + Number(r.suma ?? 0))
  }
  return Array.from(map.entries())
    .map(([metoda, total]) => ({
      metoda: metoda as MetodaPunct['metoda'],
      total,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}
