import { supabase } from '@/lib/supabase'

export type Notification = {
  id: string
  kind: string
  title: string
  body: string | null
  payload: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

export async function listNotificari(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as unknown as Notification[]
}

export async function getUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('notifications_unread_count')
  if (error) throw error
  return (data as unknown as number) ?? 0
}

export async function markAsRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function markAllAsRead(): Promise<number> {
  const { data, error } = await supabase.rpc('notifications_mark_all_read')
  if (error) throw error
  return (data as unknown as number) ?? 0
}

export async function dispatchWeeklyAuditDigest(): Promise<number> {
  const { data, error } = await supabase.rpc('audit_digest_dispatch_weekly')
  if (error) throw error
  return (data as unknown as number) ?? 0
}
