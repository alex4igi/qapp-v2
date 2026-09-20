import { supabase } from '@/lib/supabase'

// Corectare / ștergere încasare — cu motiv obligatoriu + audit.
// Forma de plată o corectează și recepția; suma, data și ștergerea doar manager+.

export type IncasareEditable = {
  id: string
  data: string | null
  suma: number | null
  metoda: string | null
  observatii: string | null
  categorie: string | null
  locatie: string | null
  client_nume: string | null
  detalii: string | null
}

export async function getIncasareForEdit(id: string): Promise<IncasareEditable> {
  const { data, error } = await supabase
    .from('incasari_lista')
    .select('id, data, suma, metoda, observatii, categorie, locatie, client_nume, detalii')
    .eq('id', id)
    .single()
  if (error) throw error
  return {
    ...data,
    id: data.id!,
    suma: data.suma === null ? null : Number(data.suma),
  }
}

// Modificarea și ștergerea trec prin RPC-uri `security definer`: ele scriu rândul
// din audit_log în ACEEAȘI tranzacție cu modificarea, iar `authenticated` nu mai
// are UPDATE/DELETE direct pe `incasari` (migrația 20260920151546). Înainte,
// jurnalul era un al doilea apel din browser — care putea pur și simplu să lipsească.
export async function updateIncasareWithAudit(params: {
  id: string
  patch: { data?: string | null; suma?: number; metoda?: string | null; observatii?: string | null }
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  // RPC-ul suprascrie toate cele patru coloane → completăm din valorile curente.
  const cur = await getIncasareForEdit(params.id)
  const { error } = await supabase.rpc('edit_incasare', {
    p_id: params.id,
    p_motiv: motiv,
    p_data: (params.patch.data ?? cur.data) ?? undefined,
    p_suma: (params.patch.suma ?? cur.suma) ?? undefined,
    p_metoda: (params.patch.metoda ?? cur.metoda) ?? undefined,
    p_observatii: (params.patch.observatii ?? cur.observatii) ?? undefined,
  })
  if (error) throw error
}

// Recepția poate corecta DOAR forma de plată (meniul „Corectează forma de plată").
// RPC separat, cu gard de rol propriu — vezi migrația 20260920152400.
export async function corecteazaMetodaIncasare(params: {
  id: string
  metoda: string | null
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')
  const { error } = await supabase.rpc('corecteaza_metoda_incasare', {
    p_id: params.id,
    p_motiv: motiv,
    p_metoda: params.metoda ?? undefined,
  })
  if (error) throw error
}

export async function deleteIncasareWithAudit(params: {
  id: string
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')
  const { error } = await supabase.rpc('delete_incasare', {
    p_id: params.id,
    p_motiv: motiv,
  })
  if (error) throw error
}
