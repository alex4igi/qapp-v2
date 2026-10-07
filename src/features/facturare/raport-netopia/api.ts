import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type { DecontLinie } from './parseDecont'

export type RaportPlata = {
  order_ref: string
  order_type: string
  plata_integrala: boolean
  data: string
  ora: string
  client_id: string | null
  membru: string | null
  platitor: string | null
  facturat_catre: string | null
  descriere: string
  suma: number
  factura: string | null
  factura_link: string | null
  factura_status: string | null
  batch_id: number | null
  data_virare: string | null
  procesat_netopia: number | null
  comision: number | null
  tva_comision: number | null
}

export type RaportLot = {
  batch_id: number
  data_platii: string
  nr_plati: number
  procesat: number
  comision_tranzactii: number
  taxa_transfer: number
  tva: number
  net: number
  extras_suma: number | null
  extras_data: string | null
}

export type RaportRestituire = {
  order_ref: string
  data: string
  suma: number
  motiv: string | null
  mod: string
  status: string
  fgo_status: string | null
  fgo_storno: string | null
  membru: string | null
  factura: string | null
}

export type RaportNecunoscuta = {
  order_ref: string
  batch_id: number
  data_operatiei: string
  procesat: number
  comerciant: string | null
  status_aplicatie: string | null
}

export type RaportNetopia = {
  luna: string
  plati: RaportPlata[]
  loturi: RaportLot[]
  restituiri: RaportRestituire[]
  necunoscute: RaportNecunoscuta[]
  ultim_lot: string | null
}

export async function getRaportNetopia(luna: string): Promise<RaportNetopia> {
  const { data, error } = await supabase.rpc('raport_netopia_luna', { p_luna: `${luna}-01` })
  if (error) throw error
  return data as unknown as RaportNetopia
}

export async function importaDecont(
  linii: DecontLinie[],
): Promise<{ loturi: number; linii: number }> {
  const { data, error } = await supabase.rpc('importa_decont_netopia', {
    p_linii: linii as unknown as Json,
  })
  if (error) throw error
  return data as unknown as { loturi: number; linii: number }
}
