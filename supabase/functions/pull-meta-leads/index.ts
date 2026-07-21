// Edge Function: poller Meta Lead Ads (alternativă la webhook — NU cere publish app).
//   Trage lead-urile direct din Graph API cu un System User token (Standard Access),
//   app rămas în Development mode. Apelat de pg_cron la 15 min.
//
//   Flux: /me/accounts → pentru fiecare pagină /{page}/leadgen_forms →
//         pentru fiecare form cu lead-uri /{form}/leads (fereastră ultimele N zile)
//         → parseLeadFields → insertLead (status 'nou', sursă „Meta Ads").
//   Dedup: marker `leadgen:<lead_id>` în observații (același ca webhook-ul) +
//          telefon (insertLead) — garda anti-dublură față de fluxul Sheet.
//
// Env (supabase secrets set):
//   META_SYSTEM_USER_TOKEN — token long-lived System User (leads_retrieval,
//     pages_show_list, pages_read_engagement, pages_manage_ads, ads_management).
//   META_PULL_DAYS (opțional) — fereastra de timp în zile (default 3).
//   CRON_SECRET (opțional) — dacă e setat, cere Authorization: Bearer <secret>.
import { serviceClient, resolveCampanie, insertLead } from '../_shared/intake.ts'
import { GRAPH, parseLeadFields, type FieldDatum } from '../_shared/meta.ts'

type GraphLead = {
  id: string
  created_time?: string
  ad_name?: string
  campaign_name?: string
  campaign_id?: string
  field_data?: FieldDatum[]
}

async function graphGet(url: string): Promise<Record<string, unknown>> {
  // NU loga url-ul — conține access_token-ul.
  const res = await fetch(url)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (json as { error?: { message?: string } }).error
    throw new Error(`graph ${res.status}: ${err?.message ?? 'eroare'}`)
  }
  return json as Record<string, unknown>
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = Deno.env.get('META_SYSTEM_USER_TOKEN')
  if (!token) {
    return Response.json({ error: 'META_SYSTEM_USER_TOKEN lipsește' }, { status: 500 })
  }
  const days = Number(Deno.env.get('META_PULL_DAYS') ?? '3')
  const sinceTs = Math.floor((Date.now() - days * 86_400_000) / 1000)

  const supabase = serviceClient()
  let created = 0
  let skipped = 0
  let forms = 0
  const errors: string[] = []

  try {
    // Dedup în masă pe `leads.extern_id` (o singură interogare, ca la sheets).
    // Era markerul din observații până în migrația 20260722120000.
    const seen = new Set<string>()
    const { data: existing } = await supabase
      .from('leads')
      .select('extern_id')
      .not('extern_id', 'is', null)
    for (const row of existing ?? []) {
      const id = row.extern_id as string | null
      if (id) seen.add(id)
    }

    const sursaId = await resolveCampanie(supabase, 'Meta Ads')

    // Paginile accesibile System User-ului + page token-ul fiecăreia.
    const accounts = await graphGet(
      `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${token}`,
    )
    const pages = (accounts.data ?? []) as { id: string; access_token: string }[]

    for (const page of pages) {
      const pageToken = page.access_token
      // Formularele paginii — sărim cele goale (leads_count===0) ca să nu irosim apeluri.
      const formsResp = await graphGet(
        `${GRAPH}/${page.id}/leadgen_forms?fields=id,leads_count,status&limit=200&access_token=${pageToken}`,
      )
      const formList = ((formsResp.data ?? []) as {
        id: string
        leads_count?: number
      }[]).filter((f) => (f.leads_count ?? 0) > 0)

      for (const form of formList) {
        forms++
        // Fereastră pe time_created → payload mic; restul prinde dedup-ul.
        const filtering = encodeURIComponent(
          JSON.stringify([
            { field: 'time_created', operator: 'GREATER_THAN', value: sinceTs },
          ]),
        )
        let next: string | null =
          `${GRAPH}/${form.id}/leads` +
          `?fields=id,created_time,ad_name,campaign_name,campaign_id,field_data` +
          `&filtering=${filtering}&limit=50&access_token=${pageToken}`

        let guard = 0
        while (next && guard++ < 20) {
          const page2: Record<string, unknown> = await graphGet(next)
          const leads = (page2.data ?? []) as GraphLead[]

          for (const lead of leads) {
            if (seen.has(lead.id)) {
              skipped++
              continue
            }
            seen.add(lead.id)

            const parsed = parseLeadFields(lead.field_data ?? [])
            // Doar răspunsurile nemapate din formular — alea sunt despre om.
            // Marcajul merge în extern_id, campania în utm_campaign; numele
            // reclamei nu se stochează (se ia din Meta). `observatii` rămâne a
            // recepției.
            const note: string[] = [...parsed.notes]

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
                data_nasterii: parsed.data_nasterii,
                observatii: note.join('\n'),
                extern_id: lead.id,
                utm_source: 'meta',
                utm_medium: 'lead_ads',
                utm_campaign: lead.campaign_name ?? lead.campaign_id ?? null,
              },
              sursaId,
            )
            if (result.created) created++
            else skipped++
          }

          const paging = page2.paging as { next?: string } | undefined
          next = paging?.next ?? null
        }
      }
    }
  } catch (e) {
    errors.push(String((e as Error).message ?? e))
  }

  console.log(
    `[pull/meta] create: ${created}, skip: ${skipped}, forms: ${forms}, erori: ${errors.length}`,
  )
  return Response.json({ created, skipped, forms, errors })
})
