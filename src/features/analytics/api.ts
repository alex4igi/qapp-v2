import { supabase } from '@/lib/supabase'
import type { Interval } from '@/features/statistici/api'

// Helper local: interval { fromLuna, toLuna } → date range ISO (prima/ultima zi).
function intervalToDateRange(i: Interval): { from: string; to: string } {
  const bounds = (luna: string, end: boolean) => {
    const [y, m] = luna.split('-').map(Number)
    const d = end ? new Date(Date.UTC(y, m, 0)) : new Date(Date.UTC(y, m - 1, 1))
    return d.toISOString().slice(0, 10)
  }
  const f = i.fromLuna <= i.toLuna ? i.fromLuna : i.toLuna
  const t = i.fromLuna <= i.toLuna ? i.toLuna : i.fromLuna
  return { from: bounds(f, false), to: bounds(t, true) }
}

// ── Pachetul de luni — cele 10 cifre de luni dimineața (Secțiunea 0) ─────────
export type Triplet = { curent: number | null; prev: number | null; yoy: number | null }

export type PachetLuni = {
  saptamana: { start: string; end: string }
  activi: Triplet
  crestere_neta: Triplet & { intrati: number | null; iesiti: number | null }
  leads_noi: Triplet
  inscrieri_noi: Triplet
  conversie_30z: Triplet & { leads: number | null; convertiti: number | null }
  risc: { elevi: number | null }
  prezenta: Triplet & { prezenti: number | null; posibile: number | null }
  churn: { luna: string | null; rata: number | null; pierduti: number | null; baza: number | null; prev: number | null; yoy: number | null }
  umplere: { media: number | null; prev: number | null; yoy: number | null; sub_prag: number | null }
  restante: { suma: number; familii: number; procent_facturare: number | null; prev: number; yoy: number | null }
}

function num(v: unknown): number | null {
  return v == null ? null : Number(v)
}

export async function getPachetLuni(locatieId?: string | null): Promise<PachetLuni | null> {
  const { data, error } = await supabase.rpc('get_pachet_luni', { p_locatie: locatieId ?? undefined })
  if (error) throw error
  if (data == null) return null
  const j = data as Record<string, Record<string, unknown>>
  const triplet = (k: string): Triplet => ({
    curent: num(j[k]?.curent),
    prev: num(j[k]?.prev),
    yoy: num(j[k]?.yoy),
  })
  return {
    saptamana: {
      start: String(j.saptamana?.start ?? ''),
      end: String(j.saptamana?.end ?? ''),
    },
    activi: triplet('activi'),
    crestere_neta: { ...triplet('crestere_neta'), intrati: num(j.crestere_neta?.intrati), iesiti: num(j.crestere_neta?.iesiti) },
    leads_noi: triplet('leads_noi'),
    inscrieri_noi: triplet('inscrieri_noi'),
    conversie_30z: { ...triplet('conversie_30z'), leads: num(j.conversie_30z?.leads), convertiti: num(j.conversie_30z?.convertiti) },
    risc: { elevi: num(j.risc?.elevi) },
    prezenta: { ...triplet('prezenta'), prezenti: num(j.prezenta?.prezenti), posibile: num(j.prezenta?.posibile) },
    churn: {
      luna: j.churn?.luna != null ? String(j.churn.luna) : null,
      rata: num(j.churn?.rata),
      pierduti: num(j.churn?.pierduti),
      baza: num(j.churn?.baza),
      prev: num(j.churn?.prev),
      yoy: num(j.churn?.yoy),
    },
    umplere: { media: num(j.umplere?.media), prev: num(j.umplere?.prev), yoy: num(j.umplere?.yoy), sub_prag: num(j.umplere?.sub_prag) },
    restante: {
      suma: Number(j.restante?.suma ?? 0),
      familii: Number(j.restante?.familii ?? 0),
      procent_facturare: num(j.restante?.procent_facturare),
      prev: Number(j.restante?.prev ?? 0),
      yoy: num(j.restante?.yoy),
    },
  }
}

export type PrezentaGrupaRow = {
  curs_id: string
  curs_nume: string
  locatie_nume: string | null
  prezenti: number
  posibile: number
  rata: number | null
}

export async function getPrezentaSaptamanaGrupe(locatieId?: string | null): Promise<PrezentaGrupaRow[]> {
  const { data, error } = await supabase.rpc('get_prezenta_saptamana_grupe', { p_locatie: locatieId ?? undefined })
  if (error) throw error
  return ((data ?? []) as PrezentaGrupaRow[]).map((r) => ({
    curs_id: String(r.curs_id),
    curs_nume: r.curs_nume ?? '',
    locatie_nume: r.locatie_nume ?? null,
    prezenti: Number(r.prezenti ?? 0),
    posibile: Number(r.posibile ?? 0),
    rata: r.rata != null ? Number(r.rata) : null,
  }))
}

// ── 1. Retenție pe cohorte ───────────────────────────────────────────────────
export type CohortaRow = {
  cohorta_luna: string
  luni_de_la_start: number
  total_initial: number
  ramasi: number
  procent: number
}

export async function getRetentieCohorte(
  sezonId: string | null = null,
  locatieId: string | null = null,
): Promise<CohortaRow[]> {
  const { data, error } = await supabase.rpc('get_retentie_cohorte', {
    p_sezon: sezonId ?? undefined,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as CohortaRow[]).map((r) => ({
    cohorta_luna: r.cohorta_luna,
    luni_de_la_start: Number(r.luni_de_la_start),
    total_initial: Number(r.total_initial),
    ramasi: Number(r.ramasi),
    procent: Number(r.procent),
  }))
}

// ── 2. Durată medie înscriere + LTV (total ȘI recurent) ─────────────────────
export type DurataLtv = {
  durata_medie_luni: number | null
  ltv_total: number | null
  ltv_recurent: number | null
}

export async function getDurataMedieLtv(locatieId: string | null): Promise<DurataLtv> {
  const { data, error } = await supabase.rpc('get_durata_medie_ltv', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  const row = (data ?? [])[0]
  return {
    durata_medie_luni: row?.durata_medie_luni != null ? Number(row.durata_medie_luni) : null,
    ltv_total: row?.ltv_total != null ? Number(row.ltv_total) : null,
    ltv_recurent: row?.ltv_recurent != null ? Number(row.ltv_recurent) : null,
  }
}

// ── 3. Leads pe lună ─────────────────────────────────────────────────────────
export type LeadsLunaRow = { luna: string; leads: number; convertiti: number }

export async function getLeadsPeLuna(i: Interval, locatieLabel: string | null): Promise<LeadsLunaRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_leads_pe_luna', {
    p_from: from,
    p_to: to,
    ...(locatieLabel ? { p_locatie: locatieLabel } : {}),
  })
  if (error) throw error
  return ((data ?? []) as LeadsLunaRow[]).map((r) => ({
    luna: r.luna,
    leads: Number(r.leads ?? 0),
    convertiti: Number(r.convertiti ?? 0),
  }))
}

// ── 4. Absențe consecutive (risc) ────────────────────────────────────────────
export type AbsentaRow = {
  client_id: string
  client_nume: string
  curs_id: string
  curs_nume: string
  // Câte ședințe a ținut GRUPA de la ultimul semnal al cursantului — nu numărul
  // de absențe bifate. 81,8% din ședințe n-au niciun absent marcat, deci
  // numărarea rândurilor 'Absent' rata aproape toți cursanții care pleacă.
  sedinte_ratate: number
  lectii_pe_saptamana: number
  zile_tacere: number
  ultima_prezenta: string | null
  // Grupa/grupele unde a fost prezent MAI RECENT decât aici. Nu dovedește o
  // mutare formală — doar unde vine omul acum, ca recepția să nu sune degeaba.
  vine_la: string | null
}

// Pragul e în SĂPTĂMÂNI de tăcere: RPC-ul îl înmulțește cu lecțiile/săptămână
// ale grupei (2×/săpt → 4 ședințe ratate, 1×/săpt → 2).
export async function getAbsenteConsecutive(
  locatieId: string | null,
  saptamani = 2,
): Promise<AbsentaRow[]> {
  const { data, error } = await supabase.rpc('get_absente_consecutive', {
    p_locatie: locatieId ?? undefined,
    p_saptamani: saptamani,
  })
  if (error) throw error
  return ((data ?? []) as AbsentaRow[]).map((r) => ({
    client_id: String(r.client_id),
    client_nume: r.client_nume ?? '',
    curs_id: String(r.curs_id),
    curs_nume: r.curs_nume ?? '',
    sedinte_ratate: Number(r.sedinte_ratate ?? 0),
    lectii_pe_saptamana: Math.max(Number(r.lectii_pe_saptamana ?? 1), 1),
    zile_tacere: Number(r.zile_tacere ?? 0),
    ultima_prezenta: r.ultima_prezenta ?? null,
    vine_la: r.vine_la ?? null,
  }))
}

// ── 5. Restanțe aging ────────────────────────────────────────────────────────
export type AgingRow = { bucket: string; total: number; nr: number }

export async function getRestanteAging(locatieId: string | null): Promise<AgingRow[]> {
  const { data, error } = await supabase.rpc('get_restante_aging', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  return ((data ?? []) as AgingRow[]).map((r) => ({
    bucket: r.bucket,
    total: Number(r.total ?? 0),
    nr: Number(r.nr ?? 0),
  }))
}

// ── 6. Ocupare prime-time ────────────────────────────────────────────────────
export type PrimeTimeRow = {
  slot: string
  grupe: number
  activi: number
  capacitate: number
  procent: number | null
}

export async function getOcuparePrimeTime(locatieId: string | null): Promise<PrimeTimeRow[]> {
  const { data, error } = await supabase.rpc('get_ocupare_prime_time', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  return ((data ?? []) as PrimeTimeRow[]).map((r) => ({
    slot: r.slot,
    grupe: Number(r.grupe ?? 0),
    activi: Number(r.activi ?? 0),
    capacitate: Number(r.capacitate ?? 0),
    procent: r.procent != null ? Number(r.procent) : null,
  }))
}

// ── 7. Rentabilitate grupă ───────────────────────────────────────────────────
export type RentabilitateGrupaRow = {
  curs_id: string
  curs_nume: string
  locatie_nume: string | null
  incasari: number
  salariu_atribuit: number
  marja: number
  activi: number
}

export async function getRentabilitateGrupa(
  i: Interval,
  locatieId: string | null = null,
): Promise<RentabilitateGrupaRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_rentabilitate_grupa', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as RentabilitateGrupaRow[]).map((r) => ({
    curs_id: String(r.curs_id),
    curs_nume: r.curs_nume ?? '',
    locatie_nume: r.locatie_nume ?? null,
    incasari: Number(r.incasari ?? 0),
    salariu_atribuit: Number(r.salariu_atribuit ?? 0),
    marja: Number(r.marja ?? 0),
    activi: Number(r.activi ?? 0),
  }))
}

// ── 8. ARPU trend ────────────────────────────────────────────────────────────
export type ArpuRow = { luna: string; venit: number; clienti_activi: number; arpu: number | null }

export async function getArpuTrend(i: Interval, locatieId: string | null): Promise<ArpuRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_arpu_trend', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as ArpuRow[]).map((r) => ({
    luna: r.luna,
    venit: Number(r.venit ?? 0),
    clienti_activi: Number(r.clienti_activi ?? 0),
    arpu: r.arpu != null ? Number(r.arpu) : null,
  }))
}

// ── 9. Mix recurent vs one-off ───────────────────────────────────────────────
export type RecurentOneoffRow = { tip: string; total: number }

export async function getMixRecurentOneoff(
  i: Interval,
  locatieId: string | null = null,
): Promise<RecurentOneoffRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_mix_recurent_oneoff', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as RecurentOneoffRow[]).map((r) => ({
    tip: r.tip,
    total: Number(r.total ?? 0),
  }))
}

// ── 10. Instructori — clienți + trend (feature „1 click") ────────────────────
export type InstructorTrendRow = {
  teacher_id: string
  teacher_nume: string
  clienti_curent: number
  clienti_prev: number
  delta: number
  retentie_procent: number | null
  serie: number[]
}

export async function getInstructoriClientiTrend(luni = 6): Promise<InstructorTrendRow[]> {
  const { data, error } = await supabase.rpc('get_instructori_clienti_trend', { p_luni: luni })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    teacher_id: String(r.teacher_id),
    teacher_nume: (r.teacher_nume as string) ?? '',
    clienti_curent: Number(r.clienti_curent ?? 0),
    clienti_prev: Number(r.clienti_prev ?? 0),
    delta: Number(r.delta ?? 0),
    retentie_procent: r.retentie_procent != null ? Number(r.retentie_procent) : null,
    serie: ((r.serie as number[]) ?? []).map((x) => Number(x)),
  }))
}

// ── 11. An-la-an pe aceeași lună ─────────────────────────────────────────────
export type YoYRow = { luna_num: number; an_curent: number; an_precedent: number }

export async function getYoYAceeasiLuna(
  metrica: 'venit' | 'activi',
  locatieId: string | null,
): Promise<YoYRow[]> {
  const { data, error } = await supabase.rpc('get_yoy_aceeasi_luna', {
    p_metrica: metrica,
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  return ((data ?? []) as YoYRow[]).map((r) => ({
    luna_num: Number(r.luna_num),
    an_curent: Number(r.an_curent ?? 0),
    an_precedent: Number(r.an_precedent ?? 0),
  }))
}

// ── 12. Cursanți în 2+ stiluri ───────────────────────────────────────────────
export type MultiStil = { total_activi: number; multi_stil: number; procent: number }

export async function getCursantiMultiStil(): Promise<MultiStil> {
  const { data, error } = await supabase.rpc('get_cursanti_multi_stil')
  if (error) throw error
  const row = (data ?? [])[0]
  return {
    total_activi: Number(row?.total_activi ?? 0),
    multi_stil: Number(row?.multi_stil ?? 0),
    procent: Number(row?.procent ?? 0),
  }
}

// ── 13. Familii cu frați ─────────────────────────────────────────────────────
export type FamiliiFrati = {
  total_familii: number
  familii_cu_frati: number
  copii_in_familii_frati: number
}

export async function getFamiliiFrati(): Promise<FamiliiFrati> {
  const { data, error } = await supabase.rpc('get_familii_frati')
  if (error) throw error
  const row = (data ?? [])[0]
  return {
    total_familii: Number(row?.total_familii ?? 0),
    familii_cu_frati: Number(row?.familii_cu_frati ?? 0),
    copii_in_familii_frati: Number(row?.copii_in_familii_frati ?? 0),
  }
}
