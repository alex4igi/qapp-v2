import { supabase } from '@/lib/supabase'

export type AuditLogRow = {
  id: string
  actor_id: string | null
  actor_role: string
  action: string
  entity_type: string
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  reason: string | null
  locatie_id: string | null
  created: string
  // joined fields
  actor_email?: string | null
  locatie_nume?: string | null
}

export type AuditFilters = {
  from?: string | null
  to?: string | null
  action?: string | null
  actorRole?: string | null
  sezonId?: string | null
}

export type SezonAuditOption = {
  id: string
  numele_sezonului: string
  data_incepere: string | null
  data_final: string | null
  stare: string
}

export async function listSezoaneForAudit(): Promise<SezonAuditOption[]> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului, data_incepere, data_final, stare')
    .order('data_incepere', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as SezonAuditOption[]
}

export async function listAuditLog(filters: AuditFilters = {}): Promise<AuditLogRow[]> {
  let q = supabase
    .from('audit_log')
    .select('id, actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, reason, locatie_id, created, locatii(nume)')
    .order('created', { ascending: false })
    .limit(500)

  // Filtrul de sezon are precedență: dacă e setat, suprascrie from/to cu intervalul sezonului.
  if (filters.sezonId) {
    const { data: sez } = await supabase
      .from('sezoane')
      .select('data_incepere, data_final')
      .eq('id', filters.sezonId)
      .maybeSingle()
    if (sez?.data_incepere) q = q.gte('created', sez.data_incepere)
    if (sez?.data_final) {
      // Inclusiv ultima zi a sezonului: până la 23:59:59
      q = q.lte('created', `${sez.data_final}T23:59:59`)
    }
  } else {
    if (filters.from) q = q.gte('created', filters.from)
    if (filters.to) q = q.lte('created', filters.to)
  }

  if (filters.action) q = q.eq('action', filters.action)
  if (filters.actorRole) q = q.eq('actor_role', filters.actorRole)

  const { data, error } = await q
  if (error) throw error

  type Raw = AuditLogRow & { locatii: { nume: string | null } | null }
  const rows = (data as unknown as Raw[] | null) ?? []
  return rows.map((r) => ({
    ...r,
    locatie_nume: r.locatii?.nume ?? null,
  }))
}

// Optional: enrich cu email-uri actor via auth.users (admin doar)
// Lăsăm pentru viitor — momentan afișăm actor_id + actor_role
