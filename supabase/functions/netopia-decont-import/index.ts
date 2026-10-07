// Importul automat al deconturilor Netopia (raportul unui lot virat în cont).
//
// Netopia nu are în API o listă a loturilor: numărul raportului vine doar în emailul
// „Detalii decontare … BatchId" trimis pe alex@quasardance.ro. Un Google Apps Script pe
// acel cont (docs/netopia-decont-apps-script.gs) caută zilnic emailurile noi și trimite
// aici numerele rapoartelor; funcția descarcă fiecare raport prin API-ul admin Netopia
// și îl scrie în `netopia_decont`, la fel ca încărcarea manuală din Facturare FGO.
//
// Apelantul NU are JWT de la noi: se autentifică cu headerul `x-decont-secret` =
// NETOPIA_DECONT_SECRET, un secret doar al acestei funcții (nu CRON_SECRET).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { strFromU8, unzipSync } from 'npm:fflate@0.8.3'
import { liniiDinCsv, type DecontLinie } from '../_shared/netopiaDecont.ts'

const MAX_RAPOARTE = 20

function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}

function csvuriDin(bytes: Uint8Array, nume: string, out: { nume: string; text: string }[]) {
  // Raportul vine fie ca CSV, fie ca arhivă cu CSV-ul (uneori arhivă în arhivă).
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    for (const [n, continut] of Object.entries(unzipSync(bytes))) {
      if (n.startsWith('__MACOSX/')) continue
      if (n.toLowerCase().endsWith('.zip')) csvuriDin(continut, n, out)
      else if (n.toLowerCase().endsWith('.csv')) out.push({ nume: n.split('/').pop() ?? n, text: strFromU8(continut) })
    }
  } else {
    out.push({ nume, text: new TextDecoder().decode(bytes) })
  }
}

async function descarca(reportId: number): Promise<DecontLinie[]> {
  const key = Deno.env.get('NETOPIA_ADMIN_API_KEY') ?? Deno.env.get('NETOPIA_API_KEY')!
  const res = await fetch(`https://admin.netopia-payments.com/api/report/${reportId}/download`, {
    headers: { Authorization: key },
  })
  if (!res.ok) {
    const corp = (await res.text()).slice(0, 300)
    throw new Error(`Netopia a răspuns ${res.status}: ${corp}`)
  }
  const nume = /filename="?([^";]+)/i.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `raport-${reportId}.csv`
  const csvuri: { nume: string; text: string }[] = []
  csvuriDin(new Uint8Array(await res.arrayBuffer()), nume, csvuri)
  if (!csvuri.length) throw new Error('Raportul descărcat nu conține niciun CSV.')
  return csvuri.flatMap((c) => liniiDinCsv(c.nume, c.text))
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('NETOPIA_DECONT_SECRET')
  if (!secret) return json({ error: 'NETOPIA_DECONT_SECRET neconfigurat' }, 500)
  if (req.headers.get('x-decont-secret') !== secret) return json({ error: 'Unauthorized' }, 401)

  let ids: number[]
  try {
    const body = await req.json()
    const brute: unknown[] = Array.isArray(body?.reportIds) ? body.reportIds : []
    ids = [...new Set(brute.map(Number))].filter((n) => Number.isInteger(n) && n > 0)
  } catch {
    return json({ error: 'Corp invalid' }, 400)
  }
  if (!ids.length) return json({ error: 'reportIds lipsă' }, 400)
  if (ids.length > MAX_RAPOARTE) return json({ error: `Maximum ${MAX_RAPOARTE} rapoarte pe apel` }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const rezultate = []
  for (const id of ids) {
    try {
      const linii = await descarca(id)
      const loturi = [...new Set(linii.map((l) => l.batch_id))]
      // Un lot reîncărcat își înlocuiește rândurile — ca importa_decont_netopia.
      const { error: delErr } = await admin.from('netopia_decont').delete().in('batch_id', loturi)
      if (delErr) throw delErr
      const { error: insErr } = await admin.from('netopia_decont').insert(linii)
      if (insErr) throw insErr
      rezultate.push({ reportId: id, ok: true, loturi, linii: linii.length })
    } catch (e) {
      const eroare = e instanceof Error ? e.message : String(e)
      console.error('netopia-decont-import', id, eroare)
      rezultate.push({ reportId: id, ok: false, eroare })
    }
  }
  return json({ rezultate })
})
