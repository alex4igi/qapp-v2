import { supabase } from '@/lib/supabase'

// ---------- Zonă interzisă SMS (quiet hours) ----------
// Config stocat ca JSON în parametri_aplicatie (rândul 'sms_quiet_hours'). Citit și
// de edge functions (_shared/quietHours.ts). Rândul e seedat de migrație.
export type QuietHoursConfig = {
  enabled: boolean
  start: string // "HH:MM" local (Europe/Bucharest)
  end: string // "HH:MM" local
}

const QUIET_HOURS_DEFAULT: QuietHoursConfig = {
  enabled: true,
  start: '19:30',
  end: '10:00',
}

export async function getSmsQuietHours(): Promise<QuietHoursConfig> {
  const { data, error } = await supabase
    .from('parametri_aplicatie')
    .select('valoare')
    .eq('titlu', 'sms_quiet_hours')
    .maybeSingle()
  if (error) throw error
  if (!data?.valoare) return QUIET_HOURS_DEFAULT
  try {
    const parsed = JSON.parse(data.valoare)
    return {
      enabled: parsed.enabled !== false,
      start: typeof parsed.start === 'string' ? parsed.start : QUIET_HOURS_DEFAULT.start,
      end: typeof parsed.end === 'string' ? parsed.end : QUIET_HOURS_DEFAULT.end,
    }
  } catch {
    return QUIET_HOURS_DEFAULT
  }
}

export async function saveSmsQuietHours(cfg: QuietHoursConfig): Promise<void> {
  const valoare = JSON.stringify(cfg)
  // Rândul e seedat de migrație; update după titlu (RLS: doar admin/owner).
  const { data, error } = await supabase
    .from('parametri_aplicatie')
    .update({ valoare, updated: new Date().toISOString() })
    .eq('titlu', 'sms_quiet_hours')
    .select('id')
  if (error) throw error
  // Fallback dacă rândul lipsește (migrație neaplicată într-un mediu vechi).
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('parametri_aplicatie')
      .insert({ titlu: 'sms_quiet_hours', valoare })
    if (insErr) throw insErr
  }
}
