// Flux 2 — emitere automată factură FGO la o plată confirmată din portal (Netopia).
// Apelat de `netopia-webhook` (respectă toggle-ul) și de acțiunea de retry din `autofgo` (force).
// Idempotent pe netopia_orders.fgo_emitat. Niciodată nu aruncă către apelant — întoarce un rezultat.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { emitInvoice, type FgoClient, type FgoFirma, type FgoLine } from './fgo.ts'

// CUI-ul firmei pe care e contractul Netopia (Quasar Dance Studio SRL).
const NETOPIA_CUI = Deno.env.get('NETOPIA_FGO_CUI') || '49361270'

type PortalInvoiceResult = {
  status: 'emisa' | 'idempotent' | 'eroare' | 'off' | 'skip'
  factura?: string | null
  error?: string
}

function fullName(c: { nume?: string | null; prenume?: string | null } | null): string {
  if (!c) return ''
  return [c.nume, c.prenume].filter(Boolean).join(' ').trim()
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function emitPortalInvoice(
  admin: SupabaseClient,
  orderRef: string,
  opts: { force?: boolean } = {},
): Promise<PortalInvoiceResult> {
  const { data: order } = await admin
    .from('netopia_orders')
    .select('id, order_ref, client_id, amount, order_type, status, fgo_emitat, fgo_factura')
    .eq('order_ref', orderRef)
    .maybeSingle()
  if (!order) return { status: 'skip', error: 'order_not_found' }
  if (order.fgo_emitat) return { status: 'idempotent', factura: order.fgo_factura }
  if (order.status !== 'confirmed') return { status: 'skip', error: 'not_confirmed' }

  const { data: firmaRow } = await admin
    .from('organizatie_firme')
    .select('cui, serie, cota_tva, tip_factura, judet, localitate, auto_factura_portal')
    .eq('cui', NETOPIA_CUI)
    .maybeSingle()
  if (!firmaRow) return { status: 'skip', error: 'firma_missing' }
  if (!opts.force && !firmaRow.auto_factura_portal) return { status: 'off' }

  // Client + date de facturare (PJ dacă familia are factură pe firmă, altfel PF).
  const { data: client } = await admin
    .from('clienti')
    .select('id, nume, prenume, familia')
    .eq('id', order.client_id)
    .maybeSingle()

  let fgoClient: FgoClient = { tip: 'PF', denumire: fullName(client) || 'Client' }
  let familiaId: string | null = null
  if (client?.familia) {
    const { data: fam } = await admin
      .from('familii')
      .select('id, nume_familie, factura_pe_firma, firma_denumire, firma_cif, firma_reg_com, firma_adresa')
      .eq('id', client.familia)
      .maybeSingle()
    familiaId = fam?.id ?? null
    if (fam?.factura_pe_firma && fam.firma_cif) {
      fgoClient = {
        tip: 'PJ',
        denumire: fam.firma_denumire || fam.nume_familie || 'Firmă',
        cui: fam.firma_cif,
        regCom: fam.firma_reg_com,
        adresa: fam.firma_adresa,
      }
    }
  }

  // Liniile facturii, detaliate per serviciu vândut (RPC comună cu preview-ul din „De facturat").
  const { data: lineRows } = await admin.rpc('get_portal_invoice_lines', { p_order_ref: orderRef })
  const rows = (Array.isArray(lineRows) ? lineRows : []) as { denumire: string; suma: number }[]
  const lines: FgoLine[] = rows.length
    ? rows.map((l) => ({ denumire: String(l.denumire), pretTotal: Number(l.suma) }))
    : [{ denumire: 'Abonament cursuri (plată online)', pretTotal: Number(order.amount) }]
  const descriere = lines.map((l) => l.denumire).join('; ').slice(0, 500)

  const firma: FgoFirma = {
    cui: firmaRow.cui,
    serie: firmaRow.serie,
    cotaTVA: Number(firmaRow.cota_tva ?? 0),
    tipFactura: firmaRow.tip_factura,
    judet: firmaRow.judet,
    localitate: firmaRow.localitate,
  }

  try {
    const { numar, link } = await emitInvoice(firma, fgoClient, lines)
    await admin
      .from('netopia_orders')
      .update({ fgo_emitat: new Date().toISOString(), fgo_factura: numar })
      .eq('id', order.id)

    // Leagă încasarea creată de confirm_netopia_payment (observatii conține orderRef).
    const { data: inc } = await admin
      .from('incasari')
      .select('id')
      .ilike('observatii', `%Netopia ${orderRef}%`)
      .limit(1)
      .maybeSingle()

    await admin.from('facturi_fgo').upsert(
      {
        ref: orderRef,
        sursa: 'portal',
        firma_cui: firma.cui,
        client_nume: fullName(client),
        suma: order.amount,
        data_tranzactie: today(),
        descriere,
        client_id: order.client_id,
        familia_id: familiaId,
        incasare_id: inc?.id ?? null,
        factura_fgo: numar,
        factura_link: link,
        status: 'Emisa',
        eroare_mesaj: null,
        emis_la: new Date().toISOString(),
      },
      { onConflict: 'ref' },
    )
    return { status: 'emisa', factura: numar }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin.from('facturi_fgo').upsert(
      {
        ref: orderRef,
        sursa: 'portal',
        firma_cui: firma.cui,
        client_nume: fullName(client),
        suma: order.amount,
        data_tranzactie: today(),
        descriere,
        client_id: order.client_id,
        familia_id: familiaId,
        status: 'Eroare',
        eroare_mesaj: msg,
      },
      { onConflict: 'ref' },
    )
    return { status: 'eroare', error: msg }
  }
}
