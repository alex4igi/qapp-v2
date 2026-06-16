// Apeluri către Edge Function-ul provision-client (conturi de portal `parinte`).
// JWT-ul staff curent se trimite automat prin supabase.functions.invoke.
import { supabase } from '@/lib/supabase'

type Target = { familieId?: string | null; clientId?: string | null }

export async function createPortalAccount(
  input: Target & { email: string; password: string },
): Promise<{ id: string; email: string | null }> {
  const { data, error } = await supabase.functions.invoke('provision-client', {
    body: { action: 'create', ...input },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.user
}

export async function resetPortalPassword(
  userId: string,
  password: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('provision-client', {
    body: { action: 'reset_password', userId, password },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function unlinkPortalAccount(target: Target): Promise<void> {
  const { data, error } = await supabase.functions.invoke('provision-client', {
    body: { action: 'unlink', ...target },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}
