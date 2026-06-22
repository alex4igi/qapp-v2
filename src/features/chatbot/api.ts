// Q-bot widget — apel către edge function `chatbot`. JWT-ul e atașat automat de supabase-js.
// Sursa de adevăr: qbot/widget/. Sincronizat în fiecare app via qbot/sync.mjs.
import { supabase } from '@/lib/supabase'

export type QbotMessage = { role: 'user' | 'assistant'; content: string }

export async function askQbot(messages: QbotMessage[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('chatbot', { body: { messages } })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return (data?.reply as string) ?? ''
}
