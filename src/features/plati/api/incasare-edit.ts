import { supabase } from '@/lib/supabase'
import { recordAuditLog } from '@/lib/auditLog'
import type { Enums } from '@/types/db'

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

export async function updateIncasareWithAudit(params: {
  id: string
  patch: { data?: string | null; suma?: number; metoda?: string | null; observatii?: string | null }
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  const cur = await getIncasareForEdit(params.id)
  const next = {
    data: params.patch.data ?? cur.data,
    suma: params.patch.suma ?? cur.suma,
    metoda: params.patch.metoda ?? cur.metoda,
    observatii: params.patch.observatii ?? cur.observatii,
  }

  const { error: uErr } = await supabase
    .from('incasari')
    .update({
      data: next.data,
      suma: next.suma,
      metoda: next.metoda as Enums<'metoda_plata'> | null,
      observatii: next.observatii,
      updated: new Date().toISOString(),
    })
    .eq('id', params.id)
  if (uErr) throw uErr

  await recordAuditLog({
    action: 'incasare_modified',
    entityType: 'incasare',
    entityId: params.id,
    oldValue: {
      data: cur.data,
      suma: cur.suma,
      metoda: cur.metoda,
      observatii: cur.observatii,
    },
    newValue: next,
    reason: motiv,
    locatieId: cur.locatie,
  })
}

export async function deleteIncasareWithAudit(params: {
  id: string
  motiv: string
}): Promise<void> {
  const motiv = params.motiv.trim()
  if (!motiv) throw new Error('Motivul e obligatoriu.')

  const cur = await getIncasareForEdit(params.id)

  const { error: dErr } = await supabase.from('incasari').delete().eq('id', params.id)
  if (dErr) throw dErr

  await recordAuditLog({
    action: 'incasare_deleted',
    entityType: 'incasare',
    entityId: params.id,
    oldValue: {
      data: cur.data,
      suma: cur.suma,
      metoda: cur.metoda,
      categorie: cur.categorie,
      client: cur.client_nume,
      detalii: cur.detalii,
    },
    newValue: null,
    reason: motiv,
    locatieId: cur.locatie,
  })
}
