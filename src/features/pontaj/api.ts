import { supabase } from '@/lib/supabase'

export type PontajRow = {
  id: string
  user_id: string
  locatie_id: string | null
  start_at: string
  end_at: string | null
  source: string | null
  // joined
  locatie_nume: string | null
}

export async function listPontaj(params: {
  from?: string | null
  to?: string | null
}): Promise<PontajRow[]> {
  let q = supabase
    .from('staff_pontaj')
    .select('id, user_id, locatie_id, start_at, end_at, source, locatii(nume)')
    .order('start_at', { ascending: false })
    .limit(500)

  if (params.from) q = q.gte('start_at', params.from)
  if (params.to) q = q.lte('start_at', params.to + 'T23:59:59')

  const { data, error } = await q
  if (error) throw error
  type Raw = PontajRow & { locatii: { nume: string | null } | null }
  const rows = (data as unknown as Raw[] | null) ?? []
  return rows.map((r) => ({ ...r, locatie_nume: r.locatii?.nume ?? null }))
}
