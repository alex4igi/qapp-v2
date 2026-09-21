import { supabase } from '@/lib/supabase'
import type {
  CanalContact,
  CazAbsenta,
  MotivAbandon,
  RezultatContact,
} from './types'

export async function getWorklistAbsente(
  locatii: string[] | null,
  doarNecontactate = false,
): Promise<CazAbsenta[]> {
  const { data, error } = await supabase.rpc('get_absente_21z_worklist', {
    p_locatii: locatii && locatii.length > 0 ? locatii : undefined,
    p_doar_necontactate: doarNecontactate,
  })
  if (error) throw error
  return (data ?? []) as CazAbsenta[]
}

// Câte cazuri DESCHISE are lista de recuperare: tăcuți de 21+ zile, necontactați
// și nereactivați. Count pur (`head: true`) pentru insigna din /overview —
// `getWorklistAbsente` întoarce tot istoricul de cazuri, fără limită temporală,
// deci crește cu fiecare sezon și n-are ce căuta într-un contor.
export async function getAbsente21zCount(
  locatieId: string | null,
  deLaData: string | null,
): Promise<number> {
  let q = supabase
    .from('absente_21z')
    .select('id', { count: 'exact', head: true })
    .is('contactat_la', null)
    .not('reactivat', 'is', true)
  if (locatieId) q = q.eq('locatie', locatieId)
  if (deLaData) q = q.gte('data_intrare', deLaData)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export async function getMotiveAbandon(): Promise<MotivAbandon[]> {
  const { data, error } = await supabase
    .from('motive_abandon')
    .select('id, eticheta')
    .eq('activ', true)
    .order('ordine')
  if (error) throw error
  return data ?? []
}

export async function marcheazaContact(input: {
  absentaId: string
  canal: CanalContact
  rezultat: RezultatContact
  motivId: string | null
  motivLiber: string | null
  pasUrmator: string | null
  observatii: string | null
}) {
  const { error } = await supabase.rpc('marcheaza_contact_absenta', {
    p_absenta_id: input.absentaId,
    p_canal: input.canal,
    p_rezultat: input.rezultat,
    p_motiv_id: input.motivId ?? undefined,
    p_motiv_liber: input.motivLiber ?? undefined,
    p_pas_urmator: input.pasUrmator ?? undefined,
    p_observatii: input.observatii ?? undefined,
  })
  if (error) throw error
}
