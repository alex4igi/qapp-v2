// Trece în FGO, ca „plătită", o factură emisă din aplicație (rândul din facturi_fgo).
// Apelat imediat după emitere (banca, portal, client) și de butonul „Reîncearcă".
// Nu aruncă niciodată: factura e deja emisă, iar un eșec aici rămâne vizibil pe rând
// (fgo_incasare_eroare) ca recepția să marcheze plata manual în FGO.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { incaseazaInvoice, parseNumarFactura, statusInvoice } from './fgo.ts'

// Metodele din `incasari` care ajung în contul bancar. Cash/Card la recepție au bon
// fiscal sau chitanță — rămân de marcat manual în FGO.
const METODE_BANCA = ['Transfer', 'Online', 'Revolut']

export type IncasareFgoResult = { status: 'incasata' | 'skip' | 'eroare'; eroare?: string }

function azi(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(new Date())
}

// Ora încasării: acum pentru plățile de azi, prânzul pentru cele din urmă (extras bancar).
function dataIncasare(data: string): string {
  if (data !== azi()) return `${data} 12:00:00`
  const ora = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date())
  return `${data} ${ora}`
}

export async function incaseazaFacturaFgo(
  admin: SupabaseClient,
  ref: string,
  opts: { suma?: number } = {},
): Promise<IncasareFgoResult> {
  const { data: f } = await admin
    .from('facturi_fgo')
    .select('ref, sursa, firma_cui, factura_fgo, data_tranzactie, status, incasare_id, fgo_incasata_la')
    .eq('ref', ref)
    .maybeSingle()
  if (!f || f.status !== 'Emisa') return { status: 'skip' }
  if (f.fgo_incasata_la) return { status: 'skip' }

  if (f.sursa === 'client') {
    const { data: inc } = await admin.from('incasari').select('metoda').eq('id', f.incasare_id).maybeSingle()
    if (!METODE_BANCA.includes(String(inc?.metoda ?? ''))) return { status: 'skip' }
  }

  const salveaza = (patch: { fgo_incasata_la?: string; fgo_incasare_eroare: string | null }) =>
    admin.from('facturi_fgo').update(patch).eq('ref', ref)

  try {
    const fact = parseNumarFactura(f.factura_fgo as string | null)
    if (!fact) throw new Error(`Numărul facturii „${f.factura_fgo ?? ''}" nu poate fi citit.`)

    // Fără sumă (la reîncercare) plătim doar restul de achitat din FGO — nu dublăm o
    // plată marcată între timp de mână.
    let suma = opts.suma
    if (suma === undefined) {
      const st = await statusInvoice(f.firma_cui as string, fact.serie, fact.nr)
      suma = Math.round((st.valoare - st.achitat) * 100) / 100
    }
    if (suma > 0) {
      await incaseazaInvoice(
        f.firma_cui as string,
        fact.serie,
        fact.nr,
        suma,
        dataIncasare(f.data_tranzactie as string),
      )
    }
    await salveaza({ fgo_incasata_la: new Date().toISOString(), fgo_incasare_eroare: null })
    return { status: 'incasata' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await salveaza({ fgo_incasare_eroare: msg })
    return { status: 'eroare', eroare: msg }
  }
}
