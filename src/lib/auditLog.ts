import { supabase } from '@/lib/supabase'

export type AuditAction =
  | 'price_override'
  | 'enrollment_moved'
  | 'enrollment_date_corrected'
  | 'abonament_to_sedinte'
  | 'sedinte_to_abonament'
  | 'enrollment_reziliata'
  | 'enrollment_deleted'
  | 'incasare_modified'
  | 'incasare_deleted'
  | 'incasare_moved'
  | 'lead_deleted'
  | 'curs_archived'
  | 'teacher_archived'
  | 'client_data_changed'
  | 'today_only_activated'

type Jsonish = Record<string, unknown> | unknown[] | null

export async function recordAuditLog(input: {
  action: AuditAction
  entityType: string
  entityId?: string | null
  oldValue?: Jsonish
  newValue?: Jsonish
  reason?: string | null
  locatieId?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('audit_log_record', {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? undefined,
    p_old_value: (input.oldValue ?? null) as never,
    p_new_value: (input.newValue ?? null) as never,
    p_reason: input.reason ?? undefined,
    p_locatie_id: input.locatieId ?? undefined,
  })
  if (error) throw error
}
