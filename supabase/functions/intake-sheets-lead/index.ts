// Edge Function: intake lead-uri din Google Sheet (tab „Formular Program de vara 4-25+").
//   Sursa = integrarea Meta Ads → Google Sheet. Un Apps Script de pe sheet
//   trimite aici rândurile noi; ocolim complet API-ul Meta (fără verificare app).
//
//   POST cu header `x-sheets-secret` = SHEETS_INTAKE_SECRET.
//   Body: { rows: SheetRow[], status?: 'nou' | 'nurture' }
//
// Dedup: pe markerul `metasheet:<id>` din observații (id-ul liniei Meta) +
//   pe telefon (insertLead). Idempotent la re-rulări.
import {
  serviceClient,
  resolveCampanie,
  insertLead,
  mapLocatie,
} from '../_shared/intake.ts'

type SheetRow = {
  id?: string // id-ul liniei Meta, ex. „l:1674306713857227"
  created?: string
  nume?: string // „full name"
  prenume?: string // „nume_participant"
  email?: string
  phone?: string // „p:+40…"
  varsta?: string // „25+_ani"
  locatie?: string // „ștefan_cel_mare"
  campaign?: string
  ad_name?: string
  platform?: string // fb / ig
}

// „ștefan_cel_mare" → „ștefan cel mare" ca să prindă aliasurile din mapLocatie.
function normLocatie(v: string | undefined): string | null {
  if (!v) return null
  return mapLocatie(v.replace(/_/g, ' '))
}

function isTestLead(r: SheetRow): boolean {
  const blob = `${r.phone ?? ''}${r.nume ?? ''}${r.email ?? ''}`.toLowerCase()
  return blob.includes('test lead') || blob.includes('dummy')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Doar POST' }, { status: 405 })
  }
  if (req.headers.get('x-sheets-secret') !== Deno.env.get('SHEETS_INTAKE_SECRET')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const rows: SheetRow[] = Array.isArray(body.rows) ? body.rows : []
    const status = body.status === 'nurture' ? 'nurture' : 'nou'
    const supabase = serviceClient()
    const sursaId = await resolveCampanie(supabase, 'Meta Ads')

    // Dedup în masă: scriptul trimite TOT setul la fiecare rulare (conectorul Meta
    // nu adaugă la coadă, ci reordonează), așa că luăm o dată toate id-urile deja
    // importate, nu câte o interogare per rând.
    const seen = new Set<string>()
    const { data: existing } = await supabase
      .from('leads')
      .select('observatii')
      .like('observatii', '%metasheet:%')
    for (const row of existing ?? []) {
      const m = (row.observatii as string | null)?.match(/metasheet:(\S+)/)
      if (m) seen.add(m[1])
    }

    let created = 0
    let skipped = 0
    for (const r of rows) {
      const hasContact = (r.phone ?? '').trim() || (r.email ?? '').trim()
      if (isTestLead(r) || !hasContact) {
        skipped++
        continue
      }

      // Dedup pe id-ul liniei Meta.
      const marker = r.id ? `metasheet:${r.id}` : null
      if (r.id && seen.has(r.id)) {
        skipped++
        continue
      }
      if (r.id) seen.add(r.id) // evită dubluri în același batch

      const note: string[] = []
      if (marker) {
        const src = r.platform === 'ig' ? 'Instagram' : 'Facebook'
        note.push(`Meta Lead Ads (${src}) ${marker}`)
      }
      if (r.campaign) note.push(`Campanie: ${r.campaign}`)
      if (r.ad_name) note.push(`Ad: ${r.ad_name}`)
      if (r.varsta) note.push(`Vârstă declarată: ${r.varsta.replace(/_/g, ' ')}`)

      const result = await insertLead(
        supabase,
        {
          nume: r.nume?.trim() || r.prenume?.trim() || 'Lead Meta',
          prenume: r.prenume,
          telefon: r.phone,
          email: r.email,
          locatia: normLocatie(r.locatie),
          observatii: note.join('\n'),
          utm_source: 'meta',
          utm_medium: 'lead_ads_sheet',
          utm_campaign: r.campaign ?? null,
        },
        sursaId,
        { status },
      )
      if (result.created) created++
      else skipped++
    }

    console.log(`[intake/sheets] create: ${created}, skip: ${skipped}`)
    return Response.json({ created, skipped })
  } catch (e) {
    console.error('[intake/sheets]', e)
    return Response.json({ error: String(e) }, { status: 200 })
  }
})
