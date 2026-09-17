import { supabase } from '@/lib/supabase'
import type { CampManual, RandLista, RaportKpi, ValoriManuale } from './types'

export async function getRapoarte(anul: number, luna: number): Promise<RandLista[]> {
  const { data, error } = await supabase.rpc('get_rapoarte_kpi', {
    p_anul: anul,
    p_luna: luna,
  })
  if (error) throw error
  return (data ?? []) as RandLista[]
}

export async function calculeazaRaport(
  grilaId: string,
  anul: number,
  luna: number,
): Promise<RaportKpi> {
  const { data, error } = await supabase.rpc('calculeaza_raport_kpi', {
    p_grila: grilaId,
    p_anul: anul,
    p_luna: luna,
  })
  if (error) throw error
  return data as unknown as RaportKpi
}

export async function deschideRaport(
  grilaId: string,
  anul: number,
  luna: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('deschide_raport_kpi', {
    p_grila: grilaId,
    p_anul: anul,
    p_luna: luna,
  })
  if (error) throw error
  return data as unknown as string
}

/**
 * Câmpurile manuale ale raportului. Scriere directă pe coloană: RLS permite
 * doar `manual`/`zile_*` și doar cât timp luna e în lucru — restul trece prin
 * RPC-uri. Salvare explicită, niciodată optimistă: sunt bani.
 */
export async function salveazaManual(
  raportId: string,
  manual: ValoriManuale,
  zile: { lucrate: number | null; baza: number | null },
) {
  const { error } = await supabase
    .from('raport_kpi_lunar')
    .update({
      manual: manual as never,
      zile_lucrate: zile.lucrate,
      zile_baza: zile.baza,
    })
    .eq('id', raportId)
  if (error) throw error
}

export async function getManual(raportId: string): Promise<{
  manual: ValoriManuale
  zile_lucrate: number | null
  zile_baza: number | null
  stare: 'draft' | 'inchis'
  kpi: RaportKpi | null
}> {
  const { data, error } = await supabase
    .from('raport_kpi_lunar')
    .select('manual, zile_lucrate, zile_baza, stare, kpi')
    .eq('id', raportId)
    .single()
  if (error) throw error
  return {
    manual: (data.manual ?? {}) as ValoriManuale,
    zile_lucrate: data.zile_lucrate,
    zile_baza: data.zile_baza,
    stare: data.stare as 'draft' | 'inchis',
    kpi: (data.kpi ?? null) as unknown as RaportKpi | null,
  }
}

export async function inchideLuna(raportId: string): Promise<RaportKpi> {
  const { data, error } = await supabase.rpc('inchide_raport_kpi', {
    p_raport: raportId,
  })
  if (error) throw error
  return data as unknown as RaportKpi
}

export async function redeschideLuna(raportId: string, motiv: string) {
  const { error } = await supabase.rpc('redeschide_raport_kpi', {
    p_raport: raportId,
    p_motiv: motiv,
  })
  if (error) throw error
}

/** Catalogul câmpurilor manuale, pentru formularul randat din configurație. */
export async function getCampuriManuale(): Promise<CampManual[]> {
  const { data, error } = await supabase
    .from('kpi_campuri')
    .select('*')
    .order('ordine')
  if (error) throw error
  return (data ?? []) as CampManual[]
}
