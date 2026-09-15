// Zonă interzisă SMS (quiet hours) — niciun SMS între `start` și `end` (ora locală
// Europe/Bucharest), implicit 19:30..10:00. Config-ul stă în parametri_aplicatie
// (rândul 'sms_quiet_hours'), editabil din Setări.
//
// GARDIANUL AUTORITAR este `isQuiet(now)` evaluat LA MOMENTUL TRIMITERII (în fiecare
// drain), nu valoarea exactă a lui send_after. `deferUntil` e doar o estimare „spre
// dimineață" ca să nu churn-uim în fiecare minut — dacă pică alături cu o oră la
// schimbarea de oră de vară/iarnă, re-verificarea `isQuiet` corectează automat.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type QuietHoursConfig = {
  enabled: boolean
  start: string // "HH:MM" local
  end: string // "HH:MM" local
}

const DEFAULT_CONFIG: QuietHoursConfig = {
  enabled: true,
  start: '19:30',
  end: '10:00',
}

// Citește config-ul din parametri_aplicatie. Fallback la default dacă rândul lipsește
// sau JSON-ul e invalid — nu blocăm trimiterile pe o eroare de parsare.
export async function getQuietHoursConfig(
  supabase: SupabaseClient,
): Promise<QuietHoursConfig> {
  try {
    const { data } = await supabase
      .from('parametri_aplicatie')
      .select('valoare')
      .eq('titlu', 'sms_quiet_hours')
      .maybeSingle()
    if (!data?.valoare) return DEFAULT_CONFIG
    const parsed = JSON.parse(data.valoare)
    return {
      enabled: parsed.enabled !== false,
      start: typeof parsed.start === 'string' ? parsed.start : DEFAULT_CONFIG.start,
      end: typeof parsed.end === 'string' ? parsed.end : DEFAULT_CONFIG.end,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

// Minutele scurse din ziua locală (Europe/Bucharest) — 0..1439.
function localMinutesBucharest(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d) // "HH:MM"
  const [h, m] = parts.split(':').map(Number)
  return h * 60 + m
}

function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function isQuiet(now: Date, cfg: QuietHoursConfig): boolean {
  if (!cfg.enabled) return false
  const cur = localMinutesBucharest(now)
  const start = parseHM(cfg.start)
  const end = parseHM(cfg.end)
  if (start === end) return false // fereastră degenerată → niciodată
  // Fereastră peste miezul nopții (ex. 19:30..10:00): quiet dacă e după start SAU înainte de end.
  if (start > end) return cur >= start || cur < end
  // Fereastră în aceeași zi (ex. 01:00..06:00): quiet dacă e între start și end.
  return cur >= start && cur < end
}

// Estimare a momentului în care iese din fereastra interzisă (ora locală `end`).
// Rough by design — vezi nota din capul fișierului.
export function deferUntil(now: Date, cfg: QuietHoursConfig): string {
  const cur = localMinutesBucharest(now)
  const end = parseHM(cfg.end)
  const minutesAhead = cur < end ? end - cur : 1440 - cur + end
  return new Date(now.getTime() + minutesAhead * 60_000).toISOString()
}

// Ziua calendaristică locală (Europe/Bucharest) pentru un moment dat — coloanele
// `data_planificata` / `data_trimitere` sunt `date`, nu timestamptz, deci nu pot fi
// derivate din ISO-ul UTC (după 21:00 local ar cădea pe ziua următoare).
export function localDateBucharest(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d) // "YYYY-MM-DD"
}

// Ora locală (0..23) — gardă pentru cron-urile programate pe ambele ore UTC, ca să
// ruleze o singură dată la ora țintă indiferent de ora de vară/iarnă.
export function localHourBucharest(d: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bucharest',
      hour: '2-digit',
      hour12: false,
    }).format(d),
  )
}

// Ziua săptămânii locală, prescurtată în engleză (Mon..Sun).
export function localWeekdayBucharest(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Bucharest',
    weekday: 'short',
  }).format(d)
}
