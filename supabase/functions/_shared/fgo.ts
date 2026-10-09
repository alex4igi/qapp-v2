// Helper comun FGO.ro — emitere, încasare, stornare factură + util SHA-1.
// Folosit de edge functions `autofgo` (extras bancar) și `netopia-webhook` (plată portal).
// Cheia API per firmă stă DOAR în secretul `FGO_KEYS` (JSON { "<cui>": "<privateKey>" }),
// niciodată în DB sau în git.

import { createHash } from 'node:crypto'

export type FgoFirma = {
  cui: string
  serie: string
  cotaTVA: number
  tipFactura?: string | null
  judet?: string | null
  localitate?: string | null
}

// Client de facturat: persoană fizică (nume + opțional CNP/adresă) sau persoană juridică (firmă).
export type FgoClient =
  | {
      tip: 'PF'
      denumire: string
      cnp?: string | null
      adresa?: string | null
      judet?: string | null
      localitate?: string | null
    }
  | {
      tip: 'PJ'
      denumire: string
      cui: string
      regCom?: string | null
      adresa?: string | null
      judet?: string | null
      localitate?: string | null
    }

export type FgoLine = { denumire: string; pretTotal: number; um?: string }

// numar = „SERIE NR" (forma din facturi_fgo); serie/nr separat pentru operațiile ulterioare.
export type FgoEmitResult = { numar: string; link: string | null; serie?: string; nr?: string }

const API_BASE = Deno.env.get('FGO_API_BASE') || 'https://api.fgo.ro/v1'
const PLATFORMA_URL = Deno.env.get('FGO_PLATFORMA_URL') || 'https://quasardance.ro'

// FGO limitează operațiile pe facturi la 1 cerere/secundă per utilizator API. Emiterea
// urmată imediat de încasare (sau un lot de emiteri) ar depăși limita fără pauză.
let ultimaCerereFgo = 0
async function respectaLimitaFgo(): Promise<void> {
  const asteapta = ultimaCerereFgo + 1100 - Date.now()
  if (asteapta > 0) await new Promise((r) => setTimeout(r, asteapta))
  ultimaCerereFgo = Date.now()
}

async function postFgo(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  await respectaLimitaFgo()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  let body: Record<string, unknown> | null = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  if (!(body ? (body.Success ?? body.success) === true : false)) {
    throw new Error(
      (body?.Message as string) || (body?.message as string) || `HTTP ${res.status}: ${text.slice(0, 300)}`,
    )
  }
  return body as Record<string, unknown>
}

export function sha1Upper(s: string): string {
  return createHash('sha1').update(s, 'utf-8').digest('hex').toUpperCase()
}

// Cheia privată FGO pentru un CUI, din secretul `FGO_KEYS`.
export function fgoPrivateKey(cui: string): string | null {
  const raw = Deno.env.get('FGO_KEYS')
  if (!raw) return null
  try {
    const map = JSON.parse(raw) as Record<string, string>
    return map[cui] || null
  } catch {
    return null
  }
}

export async function emitInvoice(
  firma: FgoFirma,
  client: FgoClient,
  lines: FgoLine[],
  valuta = 'RON',
): Promise<FgoEmitResult> {
  const privateKey = fgoPrivateKey(firma.cui)
  if (!privateKey) {
    throw new Error(`Lipsește cheia API FGO pentru CUI ${firma.cui} (secret FGO_KEYS).`)
  }
  if (!firma.serie) throw new Error(`Lipsește seria de facturi pentru CUI ${firma.cui}.`)

  const params = new URLSearchParams()
  params.set('CodUnic', firma.cui)
  // Hash autentificare: SHA1(CodUnic + privateKey + Client[Denumire]) — ca în SDK-ul FGO.
  params.set('Hash', sha1Upper(firma.cui + privateKey + client.denumire))
  params.set('PlatformaUrl', PLATFORMA_URL)
  params.set('Serie', firma.serie)
  params.set('Valuta', valuta || 'RON')
  params.set('TipFactura', firma.tipFactura || 'Factura')

  params.set('Client[Denumire]', client.denumire)
  params.set('Client[Tip]', client.tip)
  params.set('Client[Tara]', 'RO')
  const judet = client.judet ?? firma.judet
  const localitate = client.localitate ?? firma.localitate
  if (judet) params.set('Client[Judet]', judet)
  if (localitate) params.set('Client[Localitate]', localitate)
  if (client.tip === 'PJ') {
    params.set('Client[CUI]', client.cui)
    if (client.regCom) params.set('Client[NrRegCom]', client.regCom)
    if (client.adresa) params.set('Client[Adresa]', client.adresa)
  } else {
    // PF: FGO acceptă CNP în Client[CodUnic] (factură pe altă persoană decât cursantul).
    if (client.cnp) params.set('Client[CodUnic]', client.cnp)
    if (client.adresa) params.set('Client[Adresa]', client.adresa)
  }

  lines.forEach((line, i) => {
    params.set(`Continut[${i}][Denumire]`, line.denumire.slice(0, 1000))
    params.set(`Continut[${i}][NrProduse]`, '1')
    params.set(`Continut[${i}][UM]`, line.um || 'BUC')
    params.set(`Continut[${i}][CotaTVA]`, String(firma.cotaTVA ?? 0))
    params.set(`Continut[${i}][PretTotal]`, line.pretTotal.toFixed(2))
  })

  await respectaLimitaFgo()
  const res = await fetch(`${API_BASE}/factura/emitere`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(30000),
  })

  const text = await res.text()
  let body: Record<string, unknown> | null = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }

  const success = body ? (body.Success ?? body.success) === true : res.ok
  if (!success) {
    const msg =
      (body?.Message as string) ||
      (body?.message as string) ||
      `HTTP ${res.status}: ${text.slice(0, 300)}`
    throw new Error(msg)
  }

  const fact = (body?.Factura as Record<string, unknown>) || body || {}
  const serie = String(fact.Serie ?? firma.serie ?? '')
  const nr = String(fact.Numar ?? fact.numar ?? '')
  const numar = [serie, nr].filter(Boolean).join(' ').trim()
  return {
    numar: numar || '(număr nealocat în răspuns)',
    link: (fact.Link as string) || (fact.link as string) || null,
    serie,
    nr,
  }
}

// „QDS 1697" → { serie: 'QDS', nr: '1697' }. Facturile marcate „manual (FGO)" n-au număr.
export function parseNumarFactura(numar: string | null | undefined): { serie: string; nr: string } | null {
  const m = numar?.trim().match(/^(\S+)\s+(\d+)$/)
  return m ? { serie: m[1], nr: m[2] } : null
}

// Înregistrează plata pe o factură emisă (o trece „plătită" în FGO). Doar abonament
// Premium/Enterprise. TipIncasare vine din nomenclatorul FGO /nomenclator/tipincasare
// (Banca, Bon, Chitanta, Voucher, Retur Casa, Plata Speciala).
export async function incaseazaInvoice(
  cui: string,
  serie: string,
  nr: string,
  suma: number,
  dataIncasare: string, // yyyy-mm-dd hh:mm:ss
  tipIncasare = 'Banca',
): Promise<void> {
  const privateKey = fgoPrivateKey(cui)
  if (!privateKey) throw new Error(`Lipsește cheia API FGO pentru CUI ${cui} (secret FGO_KEYS).`)
  const params = new URLSearchParams()
  params.set('CodUnic', cui)
  params.set('Hash', sha1Upper(cui + privateKey + nr))
  params.set('PlatformaUrl', PLATFORMA_URL)
  params.set('SerieFactura', serie)
  params.set('NumarFactura', nr)
  params.set('TipIncasare', tipIncasare)
  params.set('SumaIncasata', suma.toFixed(2))
  params.set('DataIncasare', dataIncasare)
  await postFgo('/factura/incasare', params)
}

// Valoarea facturii și cât e deja achitat în FGO.
export async function statusInvoice(
  cui: string,
  serie: string,
  nr: string,
): Promise<{ valoare: number; achitat: number }> {
  const privateKey = fgoPrivateKey(cui)
  if (!privateKey) throw new Error(`Lipsește cheia API FGO pentru CUI ${cui} (secret FGO_KEYS).`)
  const params = new URLSearchParams()
  params.set('CodUnic', cui)
  params.set('Hash', sha1Upper(cui + privateKey + nr))
  params.set('PlatformaUrl', PLATFORMA_URL)
  params.set('Serie', serie)
  params.set('Numar', nr)
  const body = await postFgo('/factura/getstatus', params)
  const f = (body.Factura as Record<string, unknown>) || {}
  return { valoare: Number(f.Valoare ?? 0), achitat: Number(f.ValoareAchitata ?? 0) }
}

// Stornare TOTALĂ a unei facturi emise (FGO nu stornează parțial prin API).
// Hash pe operațiile cu o factură existentă: SHA1(CodUnic + cheie + Numar).
export async function stornoInvoice(cui: string, serie: string, numar: string): Promise<FgoEmitResult> {
  const privateKey = fgoPrivateKey(cui)
  if (!privateKey) throw new Error(`Lipsește cheia API FGO pentru CUI ${cui} (secret FGO_KEYS).`)

  const params = new URLSearchParams()
  params.set('CodUnic', cui)
  params.set('Hash', sha1Upper(cui + privateKey + numar))
  params.set('PlatformaUrl', PLATFORMA_URL)
  params.set('Serie', serie)
  params.set('Numar', numar)

  const body = await postFgo('/factura/stornare', params)
  const fact = (body.Factura as Record<string, unknown>) || body
  const nr = [fact.Serie ?? serie, fact.Numar ?? fact.numar ?? ''].filter(Boolean).join(' ').trim()
  return {
    numar: nr || '(număr nealocat în răspuns)',
    link: (fact.Link as string) || (fact.link as string) || null,
  }
}
