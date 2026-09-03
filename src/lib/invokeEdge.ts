// Apel de Edge Function care nu înghite mesajul de eroare.
// La răspuns non-2xx, supabase-js aruncă un FunctionsHttpError generic
// („Edge Function returned a non-2xx status code") și ține corpul real în
// error.context (un Response). Îl citim ca staff-ul să vadă cauza adevărată
// (ex. „rol fără drept…", „Template inactiv"), nu un mesaj tehnic fără sens.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export async function invokeEdge<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const j = (await error.context.json().catch(() => null)) as { error?: string } | null
      if (j?.error) throw new Error(j.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}
