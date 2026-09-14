import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/database'

export type MutareParte = {
  client_id: string
  client_nume: string
  enrollment_id: string
  curs: string | null
  data_incepere: string
  tip_plata: string | null
  total: number
  platit_inainte: number
  platit_dupa: number
}

export type MutareIncasareRezultat = {
  mutat: boolean
  incasare: {
    id: string
    data: string | null
    suma: number
    metoda: Enums<'metoda_plata'> | null
    locatie_nume: string | null
  }
  sursa: MutareParte
  tinta: MutareParte
  avertismente: string[]
}

type MutareParams = {
  incasareId: string
  enrollmentSursaId: string
  enrollmentTintaId: string
}

async function callMutare(
  params: MutareParams & { motiv: string | null; doarVerificare: boolean },
): Promise<MutareIncasareRezultat> {
  const { data, error } = await supabase.rpc('muta_incasare_la_alt_client', {
    p_incasare: params.incasareId,
    p_enrollment_sursa: params.enrollmentSursaId,
    p_enrollment_tinta: params.enrollmentTintaId,
    p_motiv: params.motiv ?? undefined,
    p_doar_verificare: params.doarVerificare,
  })
  if (error) throw error
  return data as unknown as MutareIncasareRezultat
}

// Serverul e sursa regulilor: verificarea rulează aceleași condiții ca mutarea,
// fără să scrie nimic.
export function verificaMutareIncasare(params: MutareParams) {
  return callMutare({ ...params, motiv: null, doarVerificare: true })
}

export function mutaIncasareLaAltClient(params: MutareParams & { motiv: string }) {
  return callMutare({ ...params, doarVerificare: false })
}

export type IncasareLuna = {
  id: string
  data: string | null
  suma: number
  metoda: Enums<'metoda_plata'> | null
  observatii: string | null
}

export async function listIncasariLuna(enrollmentId: string): Promise<IncasareLuna[]> {
  const { data, error } = await supabase
    .from('incasari')
    .select('id, data, suma, metoda, observatii')
    .eq('inregistrare', enrollmentId)
    .order('created', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, suma: Number(r.suma ?? 0) }))
}

export type LunaCuRest = {
  id_enrollment: string
  id_cursant: string
  nume_client: string
  id_curs: string | null
  nume_curs: string | null
  data_incepere: string
  tip_plata: string | null
  total_de_plata: number
  rest: number
}

type LunaRow = {
  id_enrollment: string | null
  id_cursant: string | null
  nume_client: string | null
  prenume_client: string | null
  id_curs: string | null
  nume_curs: string | null
  data_incepere: string | null
  tip_plata: string | null
  total_de_plata: number | null
  rest: number | null
}

const LUNA_COLS =
  'id_enrollment, id_cursant, nume_client, prenume_client, id_curs, nume_curs, data_incepere, tip_plata, total_de_plata, rest'

function toLuna(r: LunaRow): LunaCuRest {
  return {
    id_enrollment: r.id_enrollment!,
    id_cursant: r.id_cursant!,
    nume_client: `${r.nume_client ?? ''} ${r.prenume_client ?? ''}`.trim(),
    id_curs: r.id_curs,
    nume_curs: r.nume_curs,
    data_incepere: r.data_incepere!,
    tip_plata: r.tip_plata,
    total_de_plata: Number(r.total_de_plata ?? 0),
    rest: Number(r.rest ?? 0),
  }
}

function lunaRange(iso: string): { start: string; end: string } {
  const [y, m] = iso.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return { start: `${y}-${pad(m)}-01`, end: `${ny}-${pad(nm)}-01` }
}

// Cea mai des întâlnită greșeală: un coleg din aceeași grupă, cu nume apropiat.
export async function listColegiCuRest(params: {
  cursId: string
  dataIncepere: string
  excludeClientId: string
}): Promise<LunaCuRest[]> {
  const { start, end } = lunaRange(params.dataIncepere)
  const { data, error } = await supabase
    .from('plati_inrolari')
    .select(LUNA_COLS)
    .eq('id_curs', params.cursId)
    .gte('data_incepere', start)
    .lt('data_incepere', end)
    .neq('id_cursant', params.excludeClientId)
    .gt('rest', 0)
    .order('nume_client', { ascending: true })
  if (error) throw error
  return ((data ?? []) as LunaRow[]).filter((r) => r.id_enrollment && r.id_cursant).map(toLuna)
}

export async function listLuniCuRest(clientId: string): Promise<LunaCuRest[]> {
  const { data, error } = await supabase
    .from('plati_inrolari')
    .select(LUNA_COLS)
    .eq('id_cursant', clientId)
    .eq('prescris', false)
    .gt('rest', 0)
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return ((data ?? []) as LunaRow[]).filter((r) => r.id_enrollment && r.id_cursant).map(toLuna)
}
