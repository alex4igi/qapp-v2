import { supabase } from '@/lib/supabase'
import { type Interval, intervalToDateRange } from './interval'

// ============================================================================
// Prezențe pe achitare (model lună-cu-lună). `achitate`/`neachitate` partiționează
// prezențele lunilor din interval; `din_trecut` privește până la 24 de luni în
// urmă față de luna stingerii, deci și dinaintea intervalului ales.
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
  cursId: string | null,
): Promise<PrezentaAchitareRow[]> {
  const { from, to } = intervalToDateRange(i)
  const { data, error } = await supabase.rpc('get_statistica_prezente_achitare', {
    p_from: from,
    p_to: to,
    ...(locatieId ? { p_locatie: locatieId } : {}),
    ...(teacherId ? { p_teacher: teacherId } : {}),
    ...(cursId ? { p_curs: cursId } : {}),
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

export type RetentieLuna = {
  retinuti: number
  pierduti: number
  bazaPrev: number
  rata: number
}

// Retenție membri pe PREZENȚĂ: din cei prezenți acum două luni, câți au mai fost
// prezenți luna trecută (ambele luni încheiate). Înrolarea nu poate măsura churn
// aici — recurentele „Per luna" au data_final NULL, deci acoperă orice lună la
// nesfârșit (rata ar fi ~100% mereu). Vezi RPC get_retentie_membri.
export async function getRetentieLuna(locatieId: string | null = null): Promise<RetentieLuna> {
  const { data, error } = await supabase.rpc('get_retentie_membri', {
    ...(locatieId ? { p_locatie: locatieId } : {}),
  })
  if (error) throw error
  const row = (data ?? [])[0]
  const bazaPrev = Number(row?.baza_prev ?? 0)
  const retinuti = Number(row?.retinuti ?? 0)
  const pierduti = Number(row?.pierduti ?? 0)
  return { retinuti, pierduti, bazaPrev, rata: rata(retinuti, bazaPrev) }
}

