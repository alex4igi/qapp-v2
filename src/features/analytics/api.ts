import { supabase } from '@/lib/supabase'

/** Opțiuni implicite pentru query-urile de analytics: datele de management nu se schimbă de la secundă la secundă. */
export const ANALYTICS_QO = { staleTime: 5 * 60_000 } as const

// ── Primul ecran: ce se schimbă față de aceeași dată de anul trecut ──────────
// Motivele pentru care un indicator nu se compară vin din testele din SQL
// (`_analytics_indicatori`); aici doar le dăm formă.
export type MotivNecomparabil =
  | 'fara_sezon_ref'
  | 'luna_ref_incompleta'
  | 'luna_curenta_incompleta'
  | 'fara_capacitate_ref'
  | 'fereastra_viitoare'
  | 'calendar_plata'

export type Praguri = { acoperire: number; fara_prezenta_pp: number; plata_in_luna_pp: number }

export type IndicatoriSezon = {
  azi: string
  referinta: string
  praguri: Praguri
  cursanti: {
    valoare: number
    cu_rate_scadente: number | null
    referinta: number
    comparabil: boolean
    motiv: MotivNecomparabil | null
    nota: 'locuri_fara_prezenta' | null
    acoperire: number | null
    acoperire_ref: number | null
    fara_prezenta: number | null
    fara_prezenta_pct: number | null
    fara_prezenta_pct_ref: number | null
  }
  ocupare: {
    ocupate: number
    capacitate: number
    ocupate_ref: number
    capacitate_ref: number
    comparabil: boolean
    motiv: MotivNecomparabil | null
    nota: 'locuri_fara_prezenta' | null
    grupe_fara_capacitate_ref: number
  }
  incasari: {
    de_la: string
    valoare: number
    abonamente: number
    ref_de_la: string | null
    referinta: number | null
    comparabil: boolean
    motiv: MotivNecomparabil | null
    prima_luna_comparabila: string | null
    plata_in_luna: number | null
    plata_in_luna_ref: number | null
  }
  restante: {
    suma: number
    rate: number
    clienti: number
    oneoff: number
    rest_luna: number
    de_incasat_luna: number
  } | null
}

export type IndicatoriLocatie = IndicatoriSezon & { locatie_id: string; locatie_nume: string }

export type AnalyticsSezon = {
  selectie: IndicatoriSezon
  locatii: IndicatoriLocatie[] | null
}

export async function getAnalyticsSezon(locatieId: string | null): Promise<AnalyticsSezon> {
  const { data, error } = await supabase.rpc('get_analytics_sezon', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  return data as unknown as AnalyticsSezon
}

export type CursantiLunaRow = {
  sezon_id: string
  sezon_nume: string
  luna: string
  cursanti: number
  acoperire: number | null
  incomplet: boolean
  in_curs: boolean
}

export async function getCursantiLunar(locatieId: string | null): Promise<CursantiLunaRow[]> {
  const { data, error } = await supabase.rpc('get_cursanti_lunar', {
    p_locatie: locatieId ?? undefined,
  })
  if (error) throw error
  return ((data ?? []) as CursantiLunaRow[]).map((r) => ({
    ...r,
    cursanti: Number(r.cursanti ?? 0),
    acoperire: r.acoperire != null ? Number(r.acoperire) : null,
  }))
}
