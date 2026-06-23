// Apeluri către Edge Function-ul provision-client (conturi de portal `parinte`).
// JWT-ul staff curent se trimite automat prin supabase.functions.invoke.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Target = { familieId?: string | null; clientId?: string | null }

// La răspuns non-2xx, supabase-js întoarce un FunctionsHttpError generic
// („Edge Function returned a non-2xx status code") și păstrează corpul real în
// error.context (un Response). Scoatem mesajul {error} de acolo ca staff-ul să
// vadă cauza adevărată (ex. „are deja un cont de portal", email deja folosit).
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('provision-client', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const j = await error.context.json().catch(() => null)
      if (j?.error) throw new Error(j.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

// Parolă sugerată: nume de familie (fără diacritice) + 4 cifre random, ex. „Ignat-4827".
// Prietenoasă de comunicat, dar nu trivială. Editabilă de staff.
export function suggestPortalPassword(nameHint?: string | null): string {
  const base = (nameHint ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
  const word = base ? base[0].toUpperCase() + base.slice(1, 10).toLowerCase() : 'Quasar'
  const digits = Math.floor(1000 + Math.random() * 9000)
  let pwd = `${word}-${digits}`
  while (pwd.length < 8) pwd += Math.floor(Math.random() * 10)
  return pwd
}

export async function createPortalAccount(
  input: Target & { email: string; password: string; notify?: 'email' },
): Promise<{ id: string; email: string | null; emailed?: boolean }> {
  const data = await invoke<{ user: { id: string; email: string | null }; emailed?: boolean }>({
    action: 'create',
    ...input,
  })
  return { ...data.user, emailed: data.emailed }
}

export async function resetPortalPassword(
  userId: string,
  password: string,
  notify?: 'email',
): Promise<{ emailed?: boolean }> {
  return invoke<{ emailed?: boolean }>({ action: 'reset_password', userId, password, notify })
}

export async function unlinkPortalAccount(target: Target): Promise<void> {
  await invoke({ action: 'unlink', ...target })
}
