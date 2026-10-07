import type { RaportNetopia, RaportPlata } from './api'

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

export function etichetaLuna(luna: string): string {
  const [an, l] = luna.split('-').map(Number)
  return `${LUNI[l - 1]} ${an}`
}

export const lei = (n: number | null | undefined) =>
  n == null
    ? '—'
    : n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const dataRo = (d: string | null | undefined) =>
  d ? d.slice(0, 10).split('-').reverse().join('.') : '—'

const bani = (n: number) => Math.round(n * 100) / 100

export function netPlata(p: RaportPlata): number | null {
  if (p.batch_id == null) return null
  return bani(p.suma + (p.comision ?? 0) + (p.tva_comision ?? 0))
}

export type Totaluri = {
  nrPlati: number
  incasat: number
  nrFacturate: number
  nrDecontate: number
  incasatDecontat: number
  comisioane: number
  netDecontat: number
  restituit: number
}

export function totaluri(r: RaportNetopia): Totaluri {
  const decontate = r.plati.filter((p) => p.batch_id != null)
  return {
    nrPlati: r.plati.length,
    incasat: bani(r.plati.reduce((s, p) => s + p.suma, 0)),
    nrFacturate: r.plati.filter((p) => p.factura && p.factura_status === 'Emisa').length,
    nrDecontate: decontate.length,
    incasatDecontat: bani(decontate.reduce((s, p) => s + p.suma, 0)),
    comisioane: bani(decontate.reduce((s, p) => s + (p.comision ?? 0) + (p.tva_comision ?? 0), 0)),
    netDecontat: bani(decontate.reduce((s, p) => s + (netPlata(p) ?? 0), 0)),
    restituit: bani(
      r.restituiri.filter((x) => x.status === 'efectuata').reduce((s, x) => s + x.suma, 0),
    ),
  }
}

export type Verificare = { nivel: 'atentie' | 'info'; text: string }

// Ce trebuie să știe contabilul înainte să închidă luna. Lista goală = totul se leagă.
export function verificari(r: RaportNetopia): Verificare[] {
  const out: Verificare[] = []

  const faraFactura = r.plati.filter((p) => !p.factura || p.factura_status !== 'Emisa')
  if (faraFactura.length) {
    out.push({
      nivel: 'atentie',
      text: `${faraFactura.length} ${faraFactura.length === 1 ? 'plată nu are' : 'plăți nu au'} factură FGO emisă: ${faraFactura
        .map((p) => `${p.membru ?? p.order_ref} (${lei(p.suma)} lei, ${dataRo(p.data)})`)
        .join('; ')}.`,
    })
  }

  const diferente = r.plati.filter(
    (p) => p.procesat_netopia != null && bani(p.procesat_netopia) !== bani(p.suma),
  )
  for (const p of diferente) {
    out.push({
      nivel: 'atentie',
      text: `${p.order_ref}: în aplicație ${lei(p.suma)} lei, la Netopia ${lei(p.procesat_netopia)} lei.`,
    })
  }

  for (const n of r.necunoscute) {
    out.push({
      nivel: 'atentie',
      text: `Netopia a decontat ${n.order_ref || 'o tranzacție fără referință'} (${lei(n.procesat)} lei, lotul ${n.batch_id}), dar în aplicație ${
        n.status_aplicatie ? `comanda e „${n.status_aplicatie}"` : 'nu există'
      }.`,
    })
  }

  for (const l of r.loturi) {
    if (l.extras_suma != null && bani(l.extras_suma) !== bani(l.net)) {
      out.push({
        nivel: 'atentie',
        text: `Lotul ${l.batch_id}: calculat ${lei(l.net)} lei, în extrasul ING ${lei(l.extras_suma)} lei.`,
      })
    }
  }

  const nevirate = r.plati.filter((p) => p.batch_id == null)
  if (nevirate.length) {
    out.push({
      nivel: 'info',
      text: `${nevirate.length} ${nevirate.length === 1 ? 'plată nu apare' : 'plăți nu apar'} în fișierele Netopia încărcate${
        r.ultim_lot ? ` (ultimul lot încărcat: ${dataRo(r.ultim_lot)})` : ' (niciun fișier încărcat încă)'
      }: ${lei(nevirate.reduce((s, p) => s + p.suma, 0))} lei. Fie n-au fost virate încă, fie lipsește fișierul lotului.`,
    })
  }

  const restituiriDeschise = r.restituiri.filter((x) => x.status === 'in_curs')
  if (restituiriDeschise.length) {
    out.push({
      nivel: 'atentie',
      text: `${restituiriDeschise.length} ${restituiriDeschise.length === 1 ? 'restituire e' : 'restituiri sunt'} încă în curs.`,
    })
  }
  const deStornat = r.restituiri.filter((x) => x.fgo_status === 'de_stornat_manual')
  if (deStornat.length) {
    out.push({
      nivel: 'atentie',
      text: `De stornat manual în FGO: ${deStornat.map((x) => `${x.factura ?? x.order_ref} (${lei(x.suma)} lei)`).join('; ')}.`,
    })
  }

  return out
}

export function tipPlata(p: RaportPlata): string {
  if (p.order_type === 'rezervare') return 'Rezervare'
  if (p.order_type === 'bilet') return 'Bilete'
  return p.plata_integrala ? 'Sezon integral' : 'Abonament'
}
