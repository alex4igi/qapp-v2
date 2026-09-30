import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import type { Database } from '@/types/database'

// Preînscrierile de campanie (Valea Lupului, 2026) — reguli în docs/reguli-domeniu.md §11.
// Rândurile le scrie doar intake-ul; aplicația schimbă status, grila confirmată și nota.

type Row = Database['public']['Tables']['preinscrieri_campanie']['Row']

export type Preinscriere = Row & {
  lead: { id: string; nume: string; status: string } | null
  client: { id: string; nume: string; prenume: string | null } | null
}

export type StatusPreinscriere =
  | 'primit' | 'contactat' | 'asteapta_programul' | 'programat_demo' | 'inrolat' | 'retras'

export const STATUS_LABEL: Record<StatusPreinscriere, string> = {
  primit: 'Primit',
  contactat: 'Contactat',
  asteapta_programul: 'Așteaptă programul',
  programat_demo: 'Programat la demo',
  inrolat: 'Înscris',
  retras: 'Retras',
}

export const STATUSURI = Object.keys(STATUS_LABEL) as StatusPreinscriere[]

export async function listPreinscrieri(): Promise<Preinscriere[]> {
  const rows = await fetchAllRows(() =>
    supabase
      .from('preinscrieri_campanie')
      .select(
        '*, lead:leads!preinscrieri_campanie_lead_id_fkey(id, nume, status), ' +
          'client:clienti!preinscrieri_campanie_client_id_fkey(id, nume, prenume)',
      )
      .order('created', { ascending: false }),
  )
  return rows as unknown as Preinscriere[]
}

// Școala cu care avem parteneriatul (cursurile se țin la Școala Verde).
export const SCOALA_PARTENERA = 'Școala „Profesor Mihai Dumitriu”'
export const SCOALA_PARTENERA_SCURT = 'Șc. „Prof. Mihai Dumitriu”'

export const CAMPANIE_VL = 'Valea Lupului 2026'

export type Campanie = Database['public']['Tables']['campanii_preinscriere']['Row']
export type StareCampanie = 'nepornita' | 'activa' | 'inchisa'

export const stareCampanie = (c: Pick<Campanie, 'pornita_la' | 'inchisa_la'>): StareCampanie =>
  !c.pornita_la ? 'nepornita' : c.inchisa_la ? 'inchisa' : 'activa'

export async function getCampanie(nume: string): Promise<Campanie | null> {
  const { data, error } = await supabase.from('campanii_preinscriere').select('*').eq('nume', nume).maybeSingle()
  if (error) throw error
  return data
}

// Pornirea/închiderea le decide Alex; RPC-ul acceptă doar owner/admin și scrie în audit_log.
export async function seteazaCampanie(nume: string, actiune: 'porneste' | 'inchide') {
  const { error } = await supabase.rpc('seteaza_campanie_preinscriere', { p_nume: nume, p_actiune: actiune })
  if (error) throw error
}

export type PatchPreinscriere = Partial<
  Pick<Row, 'status' | 'stiluri' | 'disponibilitate' | 'disponibilitate_confirmata_la' | 'nota_staff'>
>

export async function updatePreinscriere(id: string, patch: PatchPreinscriere) {
  const { error } = await supabase.from('preinscrieri_campanie').update(patch).eq('id', id)
  if (error) throw error
}
