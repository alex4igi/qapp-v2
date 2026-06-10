// Edge Function: webhook Facebook/Instagram Lead Ads.
//   GET  — verificarea webhook-ului de către Meta (hub.challenge).
//   POST — notificare lead nou: ia leadgen_id, aduce datele din Graph API
//          și creează un lead în status 'nou'.
//
// Env necesare (setate cu `supabase secrets set`):
//   META_VERIFY_TOKEN        — token-ul de verificare ales în Meta App.
//   META_PAGE_ACCESS_TOKEN   — token-ul paginii, pentru Graph API.
// Setup complet: docs/integrare-meta-lead-ads.md.
import {
  serviceClient,
  resolveCampanie,
  insertLead,
  mapInteres,
  mapLocatie,
} from '../_shared/intake.ts'

const GRAPH = 'https://graph.facebook.com/v21.0'

type FieldDatum = { name: string; values: string[] }

const STANDARD_FIELDS = new Set([
  'full_name', 'nume', 'name', 'first_name', 'prenume', 'last_name',
  'phone_number', 'telefon', 'phone', 'email',
])

const GRUPA_VALUES = new Set([
  'Tiny', 'Junior', 'Varsity', 'Teens', 'Students', 'Adults',
])

// Extrage nume/telefon/email + întrebările custom din field_data-ul Meta.
// Numele câmpurilor custom = întrebarea formularului, snake_case — le mapăm
// euristic pe interes/locație/grupă; restul ajung brute în observații.
function parseFields(fields: FieldDatum[]) {
  const get = (...names: string[]) => {
    for (const f of fields) {
      if (names.includes(f.name.toLowerCase())) return f.values?.[0] ?? null
    }
    return null
  }
  const fullName = get('full_name', 'nume', 'name')
  const firstName = get('first_name', 'prenume')
  const lastName = get('last_name')

  let interes: string | null = null
  let locatia: string | null = null
  let grupa: string | null = null
  const custom: string[] = []
  for (const f of fields) {
    const name = f.name.toLowerCase()
    if (STANDARD_FIELDS.has(name)) continue
    const value = f.values?.[0]?.trim()
    if (!value) continue
    if (!interes && (name.includes('interes') || name.includes('curs'))) {
      interes = mapInteres(value)
      if (interes) continue
    }
    if (!locatia && name.includes('locat')) {
      locatia = mapLocatie(value)
      if (locatia) continue
    }
    if (!grupa && (name.includes('grupa') || name.includes('varsta'))) {
      const match = [...GRUPA_VALUES].find(
        (g) => g.toLowerCase() === value.toLowerCase(),
      )
      if (match) {
        grupa = match
        continue
      }
    }
    custom.push(`${f.name}: ${value}`)
  }

  return {
    nume: lastName || fullName || 'Lead Meta',
    prenume: firstName,
    telefon: get('phone_number', 'telefon', 'phone'),
    email: get('email'),
    interes,
    locatia,
    grupa_varsta: grupa,
    custom,
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // --- GET: verificarea webhook-ului ---
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === Deno.env.get('META_VERIFY_TOKEN')) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Doar GET/POST' }, { status: 405 })
  }

  // --- POST: notificare lead ---
  try {
    const pageToken = Deno.env.get('META_PAGE_ACCESS_TOKEN')
    const body = await req.json().catch(() => ({}))
    const supabase = serviceClient()
    let created = 0
    let skipped = 0

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue
        const leadgenId = change.value?.leadgen_id
        if (!leadgenId) continue

        if (!pageToken) {
          console.error('[intake/meta] META_PAGE_ACCESS_TOKEN lipsește')
          skipped++
          continue
        }

        // Dedup pe leadgen_id — Meta retrimite webhook-ul la timeout/retry.
        // Markerul `leadgen:<id>` din observații e gardul idempotent.
        const marker = `leadgen:${leadgenId}`
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .like('observatii', `%${marker}%`)
          .limit(1)
          .maybeSingle()
        if (existing) {
          skipped++
          continue
        }

        // Aduce datele lead-ului din Graph API, cu context de campanie.
        // NU loga URL-ul (conține token-ul).
        const res = await fetch(
          `${GRAPH}/${leadgenId}` +
            `?fields=field_data,form_id,ad_id,ad_name,campaign_id,campaign_name,created_time` +
            `&access_token=${pageToken}`,
        )
        if (!res.ok) {
          console.error('[intake/meta] Graph API status:', res.status)
          skipped++
          continue
        }
        const data = await res.json()
        const parsed = parseFields(data.field_data ?? [])

        const note = [
          `Meta Lead Ads (form ${data.form_id ?? change.value?.form_id ?? '?'}) ${marker}`,
        ]
        if (data.campaign_name) note.push(`Campanie: ${data.campaign_name}`)
        if (data.ad_name) note.push(`Ad: ${data.ad_name}`)
        if (parsed.custom.length) note.push(...parsed.custom)

        const sursaId = await resolveCampanie(supabase, 'Meta Ads')
        const result = await insertLead(
          supabase,
          {
            nume: parsed.nume,
            prenume: parsed.prenume,
            telefon: parsed.telefon,
            email: parsed.email,
            interes: parsed.interes,
            locatia: parsed.locatia,
            grupa_varsta: parsed.grupa_varsta,
            observatii: note.join('\n'),
            utm_source: 'meta',
            utm_medium: 'lead_ads',
            utm_campaign: data.campaign_name ?? data.campaign_id ?? null,
          },
          sursaId,
        )
        if (result.created) created++
        else skipped++
      }
    }

    console.log(`[intake/meta] create: ${created}, skip: ${skipped}`)
    // 200 mereu — Meta reîncearcă agresiv la non-2xx.
    return Response.json({ created, skipped })
  } catch (e) {
    console.error('[intake/meta]', e)
    return Response.json({ error: String(e) }, { status: 200 })
  }
})
