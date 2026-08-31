import { supabase } from '@/lib/supabase'

// Înscrierea la o clasă demo trăiește în liant, nu într-un modul: o folosesc și
// `evenimente` (rosterul clasei demo), și `leads` (programarea din LeadModal).
// Vezi regula de spargere 4 din ARCHITECTURE.md.

export type SursaInscriere = 'receptie' | 'walk_in' | 'recomandare'

// RPC atomic: blochează slotul (`for update`), verifică capacitatea și e idempotent
// — reînscrierea pe același eveniment actualizează, nu inserează (indexul unic
// parțial pe (lead, eveniment_programat) ar da 23505).
export async function inscrieLaDemo(input: {
  evenimentId: string
  leadId?: string | null
  clientId?: string | null
  sursa?: SursaInscriere
  adusDe?: string | null
  permiteOverbook?: boolean
  /** Ziua programării, când diferă de data evenimentului (implicit: data lui). */
  dataProgramarii?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('inscrie_la_demo', {
    p_eveniment: input.evenimentId,
    p_lead: input.leadId ?? undefined,
    p_client: input.clientId ?? undefined,
    p_sursa: input.sursa ?? 'receptie',
    p_adus_de: input.adusDe ?? undefined,
    p_permite_overbook: input.permiteOverbook ?? false,
    p_data_programarii: input.dataProgramarii ?? undefined,
  })
  if (error) throw error
  return data as string
}
