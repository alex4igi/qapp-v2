import { supabase } from '@/lib/supabase'
import type {
  GrilaSumar,
  KpiDefinitie,
  LinieGrila,
  Sablon,
  Titular,
} from './types'

export async function getDefinitiiKpi(): Promise<KpiDefinitie[]> {
  const { data, error } = await supabase
    .from('kpi_definitii')
    .select('*')
    .order('ordine')
  if (error) throw error
  return (data ?? []) as unknown as KpiDefinitie[]
}

export async function getSabloane(): Promise<Sablon[]> {
  const { data, error } = await supabase
    .from('kpi_sabloane')
    .select('*')
    .order('post')
  if (error) throw error
  return (data ?? []) as Sablon[]
}

export async function getGrile(): Promise<GrilaSumar[]> {
  const { data, error } = await supabase.rpc('get_grile_kpi')
  if (error) throw error
  return (data ?? []) as GrilaSumar[]
}

export async function getTitulari(): Promise<Titular[]> {
  const { data, error } = await supabase.rpc('get_titulari_kpi', {
    p_include_teacheri: true,
  })
  if (error) throw error
  return (data ?? []) as Titular[]
}

export type GrilaDetaliu = {
  grila: {
    id: string
    titular_nume: string
    post: string
    perioada: string
    cota_manager: number
    zile_min_evaluare: number
    valabil_de_la: string
    valabil_pana_la: string | null
    stare: string
    nota: string | null
  }
  locatii: string[]
  linii: LinieGrila[]
}

export async function getGrilaDetaliu(id: string): Promise<GrilaDetaliu> {
  const [grila, locatii, linii] = await Promise.all([
    supabase.from('kpi_grile').select('*').eq('id', id).single(),
    supabase.from('kpi_grila_locatii').select('locatie').eq('grila_id', id),
    supabase.from('kpi_grila_linii').select('*').eq('grila_id', id).order('ordine'),
  ])
  if (grila.error) throw grila.error
  if (locatii.error) throw locatii.error
  if (linii.error) throw linii.error
  return {
    grila: grila.data as GrilaDetaliu['grila'],
    locatii: (locatii.data ?? []).map((l) => l.locatie),
    linii: (linii.data ?? []) as unknown as LinieGrila[],
  }
}

export async function atribuieGrila(input: {
  sablonId: string
  titularTip: 'user' | 'teacher'
  titularId: string
  locatii: string[]
  valabilDeLa: string
  titularNume?: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('kpi_atribuie_grila', {
    p_sablon: input.sablonId,
    p_titular_tip: input.titularTip,
    p_titular_id: input.titularId,
    p_locatii: input.locatii,
    p_valabil_de_la: input.valabilDeLa,
  })
  if (error) throw error
  const id = data as unknown as string
  // Numele vine din cont, iar conturile de recepție n-au nume real (azi apare
  // emailul). Dacă adminul l-a corectat în modal, îl salvăm peste.
  if (input.titularNume) {
    const { error: e2 } = await supabase
      .from('kpi_grile')
      .update({ titular_nume: input.titularNume })
      .eq('id', id)
    if (e2) throw e2
  }
  return id
}

export async function salveazaLinii(grilaId: string, linii: LinieGrila[]) {
  const { error } = await supabase.rpc('kpi_grila_seteaza_linii', {
    p_grila: grilaId,
    p_linii: linii as unknown as never,
  })
  if (error) throw error
}

export async function activeazaGrila(
  grilaId: string,
): Promise<{ activata: boolean; probleme?: string[] }> {
  const { data, error } = await supabase.rpc('kpi_grila_activeaza', {
    p_grila: grilaId,
  })
  if (error) throw error
  return data as unknown as { activata: boolean; probleme?: string[] }
}

export async function salveazaDefinitieKpi(input: {
  id: string | null
  cheie: string
  denumire: string
  descriere: string | null
  tipValoare: string
  unitate: string | null
}) {
  const { error } = await supabase.rpc('salveaza_definitie_kpi', {
    // Funcția acceptă null pentru „creează nou"; tipul generat cere string.
    p_id: input.id as unknown as string,
    p_cheie: input.cheie,
    p_denumire: input.denumire,
    p_descriere: input.descriere ?? undefined,
    p_tip_valoare: input.tipValoare,
    p_unitate: input.unitate ?? undefined,
  })
  if (error) throw error
}
