// Edge Function: Autofgo — facturare FGO din extrasul de cont bancar (flux 1).
// Acțiuni:
//   ingest        (admin/owner)  — parsează CSV-ul ING, detectează firma după IBAN,
//                                   persistă încasările ca facturi_fgo status 'Pending' (dedup).
//   emite         (front_desk+)  — emite facturi FGO + înregistrează incasari (RPC record_bank_incasare).
//   marcheaza     (front_desk+)  — marchează ca facturat manual (doar registru).
//   retry_portal  (front_desk+)  — reemite o factură de portal eșuată (force).
// Potrivirea fuzzy (match_bank_payer) și warn_existing_incasare se cheamă DIRECT din browser (RPC).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { createHash } from 'node:crypto'
import { emitInvoice, type FgoClient, type FgoFirma } from '../_shared/fgo.ts'
import { emitPortalInvoice } from '../_shared/portal-invoice.ts'
import { emitClientInvoice } from '../_shared/client-invoice.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'missing auth' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: userRes, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userRes.user) return json({ error: 'invalid token' }, 401)
    const role = ((userRes.user.app_metadata ?? {}) as { role?: string }).role ?? 'front_desk'

    const STAFF = ['owner', 'admin', 'manager', 'front_desk']
    const ADMINS = ['owner', 'admin']
    if (!STAFF.includes(role)) return json({ error: 'forbidden' }, 403)

    const body = await req.json()
    const action = body.action as string

    if (action === 'ingest') {
      if (!ADMINS.includes(role)) return json({ error: 'doar adminul încarcă extrasul' }, 403)
      return await handleIngest(admin, body.csv as string)
    }
    if (action === 'emite') {
      return await handleEmite(admin, body.firmaCui as string, body.items as EmitItem[])
    }
    if (action === 'marcheaza') {
      return await handleMarcheaza(admin, body.firmaCui as string, body.items as MarkItem[])
    }
    if (action === 'retry_portal') {
      const r = await emitPortalInvoice(admin, body.orderRef as string, { force: true })
      return json({ result: r })
    }
    if (action === 'emite_portal') {
      // Emitere manuală de recepție: liniile (articol + sumă) sunt alese în UI.
      const linii = (body.linii ?? []) as { denumire: string; suma: number }[]
      if (!Array.isArray(linii) || !linii.length) return json({ error: 'linii obligatorii' }, 400)
      const lines = linii
        .filter((l) => l.denumire && Number(l.suma) > 0)
        .map((l) => ({ denumire: String(l.denumire), pretTotal: Number(l.suma) }))
      if (!lines.length) return json({ error: 'liniile trebuie să aibă articol și sumă' }, 400)
      const r = await emitPortalInvoice(admin, body.orderRef as string, { force: true, lines })
      return json({ result: r })
    }
    if (action === 'portal_pending') {
      return await handlePortalPending(admin)
    }
    if (action === 'emite_client') {
      // Emitere „la cerere" pe o încasare (tab Clienți): liniile sunt alese în UI.
      // dryRun întoarce preview-ul (firmă/client/linii) fără POST la FGO și fără scrieri.
      const linii = (body.linii ?? []) as { denumire: string; suma: number }[]
      if (!Array.isArray(linii) || !linii.length) return json({ error: 'linii obligatorii' }, 400)
      const lines = linii
        .filter((l) => l.denumire && Number(l.suma) > 0)
        .map((l) => ({ denumire: String(l.denumire), pretTotal: Number(l.suma) }))
      if (!lines.length) return json({ error: 'liniile trebuie să aibă articol și sumă' }, 400)
      const r = await emitClientInvoice(admin, body.incasareId as string, {
        lines,
        dryRun: body.dryRun === true,
      })
      return json({ result: r })
    }

    return json({ error: 'acțiune necunoscută' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Acțiuni
// ─────────────────────────────────────────────────────────────────────────────

// „De facturat" (portal): comenzi Netopia confirmate, neîncă facturate și fără niciun
// rând în facturi_fgo (cele cu Eroare sunt deja în lista principală, cu buton Reemite).
// Descrierea = exact ce va scrie emitPortalInvoice pe factură.
async function handlePortalPending(admin: SupabaseClient) {
  const { data: orders } = await admin
    .from('netopia_orders')
    .select('order_ref, client_id, amount, order_type, created')
    .eq('status', 'confirmed')
    .is('fgo_emitat', null)
    .order('created', { ascending: false })
  const list = (orders ?? []) as {
    order_ref: string
    client_id: string | null
    amount: number
    order_type: string | null
    created: string | null
  }[]
  if (!list.length) return json({ items: [] })

  const refs = list.map((o) => o.order_ref)
  const { data: existing } = await admin.from('facturi_fgo').select('ref').in('ref', refs)
  const already = new Set((existing ?? []).map((r) => (r as { ref: string }).ref))
  const pending = list.filter((o) => !already.has(o.order_ref))
  if (!pending.length) return json({ items: [] })

  const ids = [...new Set(pending.map((o) => o.client_id).filter(Boolean))] as string[]
  const nameById = new Map<string, string>()
  if (ids.length) {
    const { data: cs } = await admin.from('clienti').select('id, nume, prenume').in('id', ids)
    for (const c of (cs ?? []) as { id: string; nume: string | null; prenume: string | null }[]) {
      nameById.set(c.id, [c.nume, c.prenume].filter(Boolean).join(' ').trim())
    }
  }

  // Liniile detaliate (exact ce se va emite) — aceeași sursă ca emitPortalInvoice.
  // `certain=false` pe orice linie ⇒ recepția trebuie să aleagă articolul manual.
  const items = await Promise.all(
    pending.map(async (o) => {
      const { data: lineRows } = await admin.rpc('get_portal_invoice_lines', {
        p_order_ref: o.order_ref,
      })
      const linii = (Array.isArray(lineRows) ? lineRows : []) as {
        denumire: string
        suma: number
        articol: string | null
        certain: boolean
      }[]
      const certain = linii.length > 0 && linii.every((l) => l.certain)
      const descriere = linii.length
        ? linii.map((l) => l.denumire).join('; ')
        : 'Necunoscut — alege articolul'
      return {
        order_ref: o.order_ref,
        client_nume: (o.client_id && nameById.get(o.client_id)) || 'Client',
        suma: Number(o.amount),
        descriere,
        linii,
        certain,
        data: (o.created ?? '').slice(0, 10),
      }
    }),
  )
  return json({ items })
}

type FirmaRow = {
  cui: string
  nume: string
  ibans: string[] | null
  serie: string | null
  cota_tva: number | null
  tip_factura: string | null
  judet: string | null
  localitate: string | null
}

async function loadFirme(admin: SupabaseClient): Promise<FirmaRow[]> {
  const { data, error } = await admin
    .from('organizatie_firme')
    .select('cui, nume, ibans, serie, cota_tva, tip_factura, judet, localitate')
  if (error) throw error
  return (data ?? []) as FirmaRow[]
}

async function handleIngest(admin: SupabaseClient, csv: string) {
  if (!csv) return json({ error: 'lipsește conținutul CSV' }, 400)
  const firme = await loadFirme(admin)
  const parsed = parseStatement(csv, firme)

  // dedup vs registrul existent
  const refs = parsed.items.map((i) => i.ref)
  const existing = new Set<string>()
  if (refs.length) {
    const { data } = await admin.from('facturi_fgo').select('ref, status').in('ref', refs)
    for (const r of data ?? []) existing.add((r as { ref: string }).ref)
  }

  const toInsert = parsed.items
    .filter((i) => !existing.has(i.ref))
    .map((i) => ({
      ref: i.ref,
      sursa: 'banca',
      firma_cui: parsed.firma.cui,
      client_nume: i.client,
      suma: i.suma,
      valuta: i.valuta,
      data_tranzactie: i.dataISO,
      descriere: i.descriere,
      status: 'Pending',
    }))

  if (toInsert.length) {
    const { error } = await admin
      .from('facturi_fgo')
      .upsert(toInsert, { onConflict: 'ref', ignoreDuplicates: true })
    if (error) return json({ error: error.message }, 500)
  }

  return json({
    firma: parsed.firma,
    total: parsed.items.length,
    ignored: parsed.ignored,
    inserted: toInsert.length,
    duplicates: parsed.items.length - toInsert.length,
  })
}

type EmitItem = {
  ref: string
  client_nume: string
  suma: number
  data: string // ISO
  descriere: string
  valuta?: string
  client_id?: string | null
  familia_id?: string | null
  linii?: { articol: string; suma: number }[]
}

async function handleEmite(admin: SupabaseClient, firmaCui: string, items: EmitItem[]) {
  if (!firmaCui || !Array.isArray(items)) return json({ error: 'firmaCui și items obligatorii' }, 400)
  const firme = await loadFirme(admin)
  const firmaRow = firme.find((f) => f.cui === firmaCui)
  if (!firmaRow) return json({ error: `firma ${firmaCui} nu există` }, 400)
  const firma: FgoFirma = {
    cui: firmaRow.cui,
    serie: firmaRow.serie ?? '',
    cotaTVA: Number(firmaRow.cota_tva ?? 0),
    tipFactura: firmaRow.tip_factura,
    judet: firmaRow.judet,
    localitate: firmaRow.localitate,
  }

  const results: { ref: string; client: string; status: string; factura?: string; mesaj?: string }[] = []
  for (const item of items) {
    try {
      const fgoClient = await buildClient(admin, item)
      const lines =
        item.linii && item.linii.length
          ? item.linii.map((l) => ({ denumire: l.articol, pretTotal: Number(l.suma) }))
          : [{ denumire: item.descriere, pretTotal: Number(item.suma) }]
      const { numar, link } = await emitInvoice(
        firma,
        fgoClient,
        lines,
        item.valuta || 'RON',
      )
      const { data, error } = await admin.rpc('record_bank_factura', {
        p_ref: item.ref,
        p_sursa: 'banca',
        p_firma_cui: firmaCui,
        p_client_id: item.client_id ?? null,
        p_familia_id: item.familia_id ?? null,
        p_client_nume: fgoClient.denumire,
        p_suma: Number(item.suma),
        p_data: item.data,
        p_descriere: item.descriere,
        p_factura: numar,
        p_factura_link: link,
      })
      if (error) throw new Error(error.message)
      results.push({ ref: item.ref, client: fgoClient.denumire, status: 'emisa', factura: numar })
      void data
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await admin
        .from('facturi_fgo')
        .update({ status: 'Eroare', eroare_mesaj: msg })
        .eq('ref', item.ref)
      results.push({ ref: item.ref, client: item.client_nume, status: 'eroare', mesaj: msg })
    }
  }
  return json({ results })
}

type MarkItem = { ref: string; client_nume: string; suma: number; data: string; descriere: string }

async function handleMarcheaza(admin: SupabaseClient, firmaCui: string, items: MarkItem[]) {
  if (!firmaCui || !Array.isArray(items)) return json({ error: 'firmaCui și items obligatorii' }, 400)
  const results: { ref: string; client: string; status: string; mesaj?: string }[] = []
  for (const item of items) {
    const { error } = await admin.rpc('mark_bank_factura', {
      p_ref: item.ref,
      p_sursa: 'banca',
      p_firma_cui: firmaCui,
      p_client_nume: item.client_nume,
      p_suma: Number(item.suma),
      p_data: item.data,
      p_descriere: item.descriere,
    })
    if (error) results.push({ ref: item.ref, client: item.client_nume, status: 'eroare', mesaj: error.message })
    else results.push({ ref: item.ref, client: item.client_nume, status: 'marcata' })
  }
  return json({ results })
}

// Construiește clientul de facturat: PJ dacă familia are factură pe firmă, altfel PF.
async function buildClient(admin: SupabaseClient, item: EmitItem): Promise<FgoClient> {
  if (item.familia_id) {
    const { data: fam } = await admin
      .from('familii')
      .select('nume_familie, factura_pe_firma, firma_denumire, firma_cif, firma_reg_com, firma_adresa')
      .eq('id', item.familia_id)
      .maybeSingle()
    if (fam?.factura_pe_firma && fam.firma_cif) {
      return {
        tip: 'PJ',
        denumire: fam.firma_denumire || fam.nume_familie || item.client_nume,
        cui: fam.firma_cif,
        regCom: fam.firma_reg_com,
        adresa: fam.firma_adresa,
      }
    }
  }
  // PF: numele de pe factură = plătitorul transferului (nu cursantul din CRM).
  return { tip: 'PF', denumire: item.client_nume }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsare extras ING (CSV cu ;) — portată din Autofgo/server.mjs
// ─────────────────────────────────────────────────────────────────────────────

type ParsedItem = {
  ref: string
  data: string // dd.mm.yyyy (afișare)
  dataISO: string // yyyy-mm-dd
  client: string
  suma: number
  valuta: string
  descriere: string
  dejaFacturata: string | null
  atentie: string | null
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ';' && !inQuotes) {
      fields.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  fields.push(cur)
  return fields.map((f) => f.trim())
}

function parseAmount(s: string): number {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function toISODate(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return s
}

function cleanClientName(name: string): string {
  return name
    .replace(/^\s*(dna\.?|dl\.?|dra\.?|d-na|d-l|doamna|domnul|domnisoara)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isInternalTransfer(clientName: string, firmaNume: string): boolean {
  const norm = (s: string) =>
    s.toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').replace(/\bS R L\b|\bSRL\b/g, '').trim()
  return norm(clientName).includes(norm(firmaNume)) || norm(firmaNume).includes(norm(clientName))
}

function extractBankRef(details: string): string | null {
  const m = details.match(/Referinta bancii\s+([0-9a-f-]{30,40})/i)
  return m ? m[1] : null
}

function cleanDescription(details: string, fallbackDate: string): string {
  const d = details
    .replace(/Referinta bancii\s+[0-9a-f-]{30,40}/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return d || `Servicii conform extras de cont din ${fallbackDate}`
}

function sha1(s: string): string {
  // ref de rezervă când lipsește „Referinta bancii" — hash determinist al rândului
  return createHash('sha1').update(s, 'utf-8').digest('hex')
}

function parseStatement(csvText: string, firme: FirmaRow[]) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) throw new Error('Fișierul CSV pare gol sau nu conține tranzacții.')

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
  const col = (name: string) => header.findIndex((h) => h.includes(name))
  const idx = {
    cont: col('numar cont'),
    data: col('data procesarii'),
    suma: col('suma'),
    valuta: col('valuta'),
    tip: col('tip tranzactie'),
    nume: col('nume beneficiar'),
    detalii: col('detalii tranzactie'),
  }
  if (idx.cont < 0 || idx.suma < 0 || idx.tip < 0) {
    throw new Error(
      'Fișierul nu pare a fi un extras ING în format CSV — lipsesc coloanele așteptate (numar cont, suma, tip tranzactie).',
    )
  }

  const rows = lines.slice(1).map(parseCsvLine).filter((f) => f.length > Math.max(idx.tip, idx.suma))
  if (rows.length === 0) throw new Error('Extrasul nu conține nicio tranzacție.')

  const iban = rows[0][idx.cont]
  const firma = firme.find((f) =>
    (f.ibans || []).map((i) => i.replace(/\s/g, '')).includes(iban.replace(/\s/g, '')),
  )
  if (!firma) {
    throw new Error(
      `IBAN-ul din extras (${iban}) nu corespunde niciunei firme configurate. Adaugă-l la firma potrivită în Setări (organizatie_firme.ibans).`,
    )
  }

  const items: ParsedItem[] = []
  let ignored = 0

  for (const f of rows) {
    const tip = (f[idx.tip] || '').trim().toLowerCase()
    const suma = parseAmount(f[idx.suma] || '')
    if (tip !== 'incasare' || !(suma > 0)) {
      ignored++
      continue
    }

    const data = (f[idx.data] || '').trim()
    const detalii = f[idx.detalii] || ''
    const ref =
      extractBankRef(detalii) ||
      sha1(`${iban}|${data}|${f[idx.suma]}|${f[idx.nume]}|${detalii}`)
    const client = cleanClientName(f[idx.nume] || '')

    let atentie: string | null = null
    if (isInternalTransfer(client, firma.nume)) {
      atentie = 'posibil transfer intern — verifică'
    } else if (
      /\bFF\b/i.test(detalii) ||
      (firma.serie && new RegExp(`\\b${firma.serie}\\s*\\d+`, 'i').test(detalii))
    ) {
      atentie = 'pare plata unei facturi deja emise — verifică'
    }

    items.push({
      ref,
      data,
      dataISO: toISODate(data),
      client,
      suma,
      valuta: (f[idx.valuta] || 'RON').trim() || 'RON',
      descriere: cleanDescription(detalii, data),
      dejaFacturata: null,
      atentie,
    })
  }

  return {
    firma: { nume: firma.nume, cui: firma.cui, iban, serie: firma.serie ?? '' },
    items,
    ignored,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
