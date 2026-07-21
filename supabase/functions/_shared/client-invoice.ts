// Emitere factură FGO „la cerere" pentru o încasare (tab Clienți din /facturare).
// Oglinda lui emitPortalInvoice, dar ancorată pe incasari.id (ref = 'INC-<id>').
// dryRun întoarce preview-ul (firmă + client + linii) fără POST la FGO și fără scrieri.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { emitInvoice, type FgoFirma, type FgoLine } from './fgo.ts'
import { buildFgoClientForClient } from './fgo-client.ts'

// Firma care facturează online (singura cu cheie FGO) — Quasar Dance Studio SRL.
const EMITENT_CUI = Deno.env.get('NETOPIA_FGO_CUI') || '49361270'

type ClientInvoiceResult = {
  status: 'emisa' | 'idempotent' | 'eroare' | 'skip' | 'dry'
  factura?: string | null
  error?: string
  preview?: unknown
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function emitClientInvoice(
  admin: SupabaseClient,
  incasareId: string,
  opts: { lines: FgoLine[]; dryRun?: boolean },
): Promise<ClientInvoiceResult> {
  const { data: inc } = await admin
    .from('incasari')
    .select('id, client, suma, data')
    .eq('id', incasareId)
    .maybeSingle()
  if (!inc) return { status: 'skip', error: 'incasare_not_found' }

  const ref = `INC-${inc.id}`
  const { data: existing } = await admin
    .from('facturi_fgo')
    .select('ref, status, factura_fgo')
    .eq('ref', ref)
    .maybeSingle()
  if (existing && ['Emisa', 'Marcata'].includes(existing.status as string)) {
    return { status: 'idempotent', factura: existing.factura_fgo as string | null }
  }

  const { data: firmaRow } = await admin
    .from('organizatie_firme')
    .select('cui, serie, cota_tva, tip_factura, judet, localitate')
    .eq('cui', EMITENT_CUI)
    .maybeSingle()
  if (!firmaRow) return { status: 'skip', error: 'firma_missing' }

  const { fgoClient, familiaId, clientNume } = await buildFgoClientForClient(
    admin,
    inc.client as string | null,
  )

  const lines = (opts.lines ?? []).filter((l) => l.denumire && Number(l.pretTotal) > 0)
  if (!lines.length) return { status: 'skip', error: 'linii_lipsa' }
  const descriere = lines.map((l) => l.denumire).join('; ').slice(0, 500)

  const firma: FgoFirma = {
    cui: firmaRow.cui,
    serie: firmaRow.serie,
    cotaTVA: Number(firmaRow.cota_tva ?? 0),
    tipFactura: firmaRow.tip_factura,
    judet: firmaRow.judet,
    localitate: firmaRow.localitate,
  }

  if (opts.dryRun) {
    return { status: 'dry', preview: { firma, client: fgoClient, lines } }
  }

  const base = {
    ref,
    sursa: 'client',
    firma_cui: firma.cui,
    client_nume: clientNume,
    suma: Number(inc.suma),
    data_tranzactie: (inc.data as string | null) ?? today(),
    descriere,
    client_id: inc.client,
    familia_id: familiaId,
    incasare_id: inc.id,
    linii: lines.map((l) => ({ articol: l.denumire, suma: l.pretTotal })),
  }

  try {
    const { numar, link } = await emitInvoice(firma, fgoClient, lines)
    await admin.from('facturi_fgo').upsert(
      {
        ...base,
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
      { ...base, status: 'Eroare', eroare_mesaj: msg },
      { onConflict: 'ref' },
    )
    return { status: 'eroare', error: msg }
  }
}
