import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Lipsesc variabilele de mediu Supabase. Completează VITE_SUPABASE_URL și VITE_SUPABASE_ANON_KEY în .env.local',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
