// Parsarea raportului unui lot Netopia (batchId.<lot>.<nr>.csv), pentru importul automat.
// Aceleași coloane ca parserul din aplicație (src/features/facturare/raport-netopia/parseDecont.ts);
// dacă Netopia schimbă formatul, se schimbă în ambele locuri.

export type DecontLinie = {
  batch_id: number
  linie: number
  comerciant: string | null
  order_ref: string | null
  data_platii: string | null
  data_operatiei: string | null
  procesat: number
  comision: number
  tva: number
  moneda: string | null
  descriere: string | null
}

function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const pushRow = () => {
    row.push(field)
    field = ''
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') pushRow()
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) pushRow()
  return rows
}

const gol = (s: string) => (s === '' ? null : s)
const numar = (s: string) => (s === '' ? 0 : Number(s))

export function liniiDinCsv(nume: string, text: string): DecontLinie[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim())
  const col = (h: string) => header.indexOf(h)
  const idx = {
    batch: col('#'),
    comerciant: col('Comerciant'),
    id: col('Id'),
    dataPlatii: col('Data platii'),
    dataOperatiei: col('Data operatiei'),
    procesat: col('Procesat'),
    comision: col('Comision'),
    tva: col('TVA'),
    moneda: col('Moneda'),
    descriere: col('Descriere'),
  }
  if (idx.procesat < 0 || idx.comision < 0 || idx.id < 0) {
    throw new Error(`${nume} nu arată ca un decont Netopia (lipsesc coloanele Id/Procesat/Comision).`)
  }
  const dinNume = /batchId\.(\d+)/i.exec(nume)?.[1] ?? ''
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

  return rows.slice(1).map((r, i) => {
    const batch = Number(cell(r, idx.batch) || dinNume)
    if (!Number.isFinite(batch) || batch <= 0) throw new Error(`${nume}: linia ${i + 2} nu are numărul lotului.`)
    return {
      batch_id: batch,
      linie: i + 1,
      comerciant: gol(cell(r, idx.comerciant)),
      order_ref: gol(cell(r, idx.id)),
      data_platii: gol(cell(r, idx.dataPlatii).slice(0, 10)),
      data_operatiei: gol(cell(r, idx.dataOperatiei)),
      procesat: numar(cell(r, idx.procesat)),
      comision: numar(cell(r, idx.comision)),
      tva: numar(cell(r, idx.tva)),
      moneda: gol(cell(r, idx.moneda)),
      descriere: gol(cell(r, idx.descriere)),
    }
  })
}
