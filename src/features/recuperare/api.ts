import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

export type CanalContact = Enums<'canal_contact'>
export type RezultatContact = Enums<'rezultat_contact'>

export type WorklistRow = {
  client_id: string
  nume: string
  prenume: string | null
  telefon: string | null
  nume_locatie: string | null
  rest_total: number
  nr_rate_neachitate: number
  zile_depasire: number | null
  ultima_prezenta: string | null
  ultim_apel_at: string | null
  ultim_apel_rezultat: string | null
}

// Worklist de recuperare: clienți Activ cu ≥2 rate neachitate, sortați după
// zile de întârziere. p_locatie/p_sezon = uuid sau null = toate (sezonul e
// aliniat cu get_sms_recipients — UI presetează sezonul activ).
export async function getRestanteWorklist(
  locatieId: string | null,
  sezonId: string | null = null,
): Promise<WorklistRow[]> {
  const { data, error } = await supabase.rpc('get_restante_worklist', {
    ...(locatieId ? { p_locatie: locatieId } : {}),
    ...(sezonId ? { p_sezon: sezonId } : {}),
  })
  if (error) throw error
  return (data ?? []) as unknown as WorklistRow[]
}

// Loghează un apel de recuperare pe un client. Suma efectiv recuperată NU se ia
// de aici — se citește din încasările reale care urmează apelului (apel precede
// plata, fereastră de N zile) în get_scorecard_restante.
export async function logRecuperareContact(input: {
  clientId: string
  canal: CanalContact
  rezultat: RezultatContact
  sumaPromisa?: number | null
  observatii?: string
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase.from('client_contacte').insert({
    client_id: input.clientId,
    user_id: user?.id,
    canal: input.canal,
    rezultat: input.rezultat,
    scop: 'recuperare',
    suma_promisa: input.sumaPromisa ?? null,
    observatii: input.observatii?.trim() || null,
  })
  if (error) throw error
}
