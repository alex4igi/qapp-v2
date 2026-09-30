import { supabase } from '@/lib/supabase'

export type UtilizareRand = {
  rol: string
  varianta: 'desktop' | 'mobil'
  ruta: string
  tip: 'pagina' | 'clic'
  tinta: string
  n: number
  zile: number
}

export type UtilizarePerioade = {
  luni: string[]
  zile: string[]
  activ_pana_la: string | null
}

export async function getPerioade(): Promise<UtilizarePerioade> {
  const { data, error } = await supabase.rpc('utilizare_perioade')
  if (error) throw error
  const p = data as unknown as UtilizarePerioade
  return {
    luni: [...(p.luni ?? [])].sort().reverse(),
    zile: [...(p.zile ?? [])].sort().reverse(),
    activ_pana_la: p.activ_pana_la,
  }
}

export async function getRaport(deLa: string, panaLa: string): Promise<UtilizareRand[]> {
  const { data, error } = await supabase.rpc('raport_utilizare', {
    p_de_la: deLa,
    p_pana_la: panaLa,
  })
  if (error) throw error
  return (data as unknown as UtilizareRand[]) ?? []
}
