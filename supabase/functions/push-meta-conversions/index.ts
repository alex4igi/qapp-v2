// Edge Function: trimite la Meta conversiile offline — „lead-ul ăsta a devenit elev".
//
// De ce există: Meta vede doar completarea formularului. De la lead la înscriere trec
// în mediană 12 zile, iar fereastra lui de atribuire e de 7 — deci înscrierea se
// întâmplă după ce Meta a încetat să se uite. Fără încărcarea asta, algoritmul
// optimizează pentru completatori de formulare, fiindcă ăla e singurul rezultat pe
// care-l vede.
//
// Ce NU face: nu trimite retroactiv. Pragul e constanta `p_from` din
// `conversii_ads_de_trimis` (migrația 20260903120000) — decizia lui Alex, 03-09-2026.
//
// Env (supabase secrets set):
//   META_CAPI_DATASET_ID  — id-ul dataset-ului (Events Manager → Data Sources).
//   META_CAPI_TOKEN       — token cu drept de scriere pe dataset.
//                           Fallback: META_SYSTEM_USER_TOKEN.
//   META_CAPI_EVENT_NAME  — opțional, default 'Purchase'.
//   META_CAPI_TEST_CODE   — opțional. Cât e setat, evenimentele apar în „Test Events"
//                           și NU intră în optimizare — pentru verificare fără efect.
//   CRON_SECRET           — opțional; dacă e setat, cere Authorization: Bearer.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { GRAPH } from '../_shared/meta.ts'
import { refuzaApelStrain } from '../_shared/cronAuth.ts'

type Candidat = {
  lead_id: string
  data_conversie: string
  telefon: string | null
  email: string | null
  valoare: number | null
  platforma: string | null
  campanie: string | null
}

// Meta cere SHA-256 hex peste valoarea NORMALIZATĂ. Normalizarea greșită nu dă
// eroare — dă doar rată de potrivire zero, ceea ce e mai rău decât o eroare.
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Telefon în forma cerută de Meta: doar cifre, cu prefix de țară, fără + sau 00.
// `leads.telefon` e normalizat la +40… de intake, dar rândurile vechi au și 07…
function normPhone(raw: string | null): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('0040')) d = d.slice(4)
  else if (d.startsWith('40')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  if (d.length !== 9 || !d.startsWith('7')) return null
  return `40${d}`
}

function normEmail(raw: string | null): string | null {
  const e = raw?.trim().toLowerCase()
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

Deno.serve(async (req) => {
  const refuz = refuzaApelStrain(req)
  if (refuz) return refuz

  const datasetId = Deno.env.get('META_CAPI_DATASET_ID')
  const token = Deno.env.get('META_CAPI_TOKEN') ?? Deno.env.get('META_SYSTEM_USER_TOKEN')
  if (!datasetId || !token) {
    // Configurare lipsă ≠ eroare de rulare: cronul ar urla zilnic degeaba.
    console.warn('[capi/meta] META_CAPI_DATASET_ID sau token lipsă — nu trimit nimic')
    return Response.json({ trimise: 0, motiv: 'neconfigurat' })
  }
  const eventName = Deno.env.get('META_CAPI_EVENT_NAME') ?? 'Purchase'
  const testCode = Deno.env.get('META_CAPI_TEST_CODE') ?? null

  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: candidati, error } = await supabase.rpc('conversii_ads_de_trimis', {})
  if (error) {
    console.error('[capi/meta] selecție eșuată:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
  const lista = (candidati ?? []) as Candidat[]
  if (!lista.length) {
    console.log('[capi/meta] nimic de trimis')
    return Response.json({ trimise: 0, esuate: 0, sarite: 0 })
  }

  // Construim evenimentele; cele fără nicio cheie de potrivire nu au ce căuta la
  // Meta — un eveniment care nu se potrivește cu nimeni nu învață pe nimeni nimic.
  const evenimente: Record<string, unknown>[] = []
  const trimiseIds: Candidat[] = []
  let sarite = 0
  const countryHash = await sha256('ro')

  for (const c of lista) {
    const ph = normPhone(c.telefon)
    const em = normEmail(c.email)
    if (!ph && !em) {
      sarite++
      continue
    }
    const user_data: Record<string, string[]> = { country: [countryHash] }
    if (ph) user_data.ph = [await sha256(ph)]
    if (em) user_data.em = [await sha256(em)]

    evenimente.push({
      event_name: eventName,
      // Timpul REAL al înscrierii — tot rostul încărcării. Cu `now()` aici,
      // Meta ar crede că toate conversiile s-au produs în noaptea cronului.
      event_time: Math.floor(new Date(c.data_conversie).getTime() / 1000),
      action_source: 'system_generated',
      // Dedup pe partea Meta, peste indexul unic din DB: dacă o rulare scrie în
      // DB și pică înainte de răspuns, retrimiterea nu se numără de două ori.
      event_id: c.lead_id,
      user_data,
      custom_data: {
        currency: 'RON',
        value: Number(c.valoare ?? 0),
        ...(c.campanie ? { content_name: c.campanie } : {}),
      },
    })
    trimiseIds.push(c)
  }

  if (!evenimente.length) {
    console.log(`[capi/meta] ${sarite} candidați fără telefon/email — nimic de trimis`)
    return Response.json({ trimise: 0, esuate: 0, sarite })
  }

  const body: Record<string, unknown> = { data: evenimente, access_token: token }
  if (testCode) body.test_event_code = testCode

  let ok = false
  let raspuns: unknown = null
  let eroare: string | null = null
  try {
    // NU loga url-ul/body-ul: conțin tokenul și PII hash-uit.
    const res = await fetch(`${GRAPH}/${datasetId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    raspuns = await res.json().catch(() => ({}))
    ok = res.ok
    if (!ok) {
      const e = (raspuns as { error?: { message?: string } }).error
      eroare = `graph ${res.status}: ${e?.message ?? 'eroare'}`
    }
  } catch (e) {
    eroare = String((e as Error).message ?? e)
  }

  // Jurnalizăm rezultatul pentru FIECARE lead din lot, reușită sau eșec: la eșec
  // rândul rămâne 'esuat', deci indexul unic parțial lasă reîncercarea de mâine.
  const randuri = trimiseIds.map((c) => ({
    lead: c.lead_id,
    platforma: 'meta',
    event_id: c.lead_id,
    event_name: eventName,
    valoare: c.valoare ?? 0,
    moneda: 'RON',
    rezultat: ok ? 'trimis' : 'esuat',
    eroare,
    raspuns: raspuns as Record<string, unknown> | null,
  }))
  const { error: logErr } = await supabase.from('conversii_ads_trimise').insert(randuri)
  if (logErr) console.error('[capi/meta] jurnalizare eșuată:', logErr.message)

  console.log(
    `[capi/meta] ${ok ? 'trimise' : 'EȘUATE'}: ${evenimente.length}, sărite: ${sarite}` +
      (testCode ? ' [TEST MODE]' : ''),
  )
  return Response.json({
    trimise: ok ? evenimente.length : 0,
    esuate: ok ? 0 : evenimente.length,
    sarite,
    test_mode: !!testCode,
    eroare,
  })
})
