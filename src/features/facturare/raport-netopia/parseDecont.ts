import { unzipSync, strFromU8 } from 'fflate'
import { parseCsv } from '@/lib/csv'

// O linie din fișierul unui lot Netopia (batchId.<lot>.<nr>.csv). Fiecare plată apare
// pe trei linii: suma procesată, comisionul fix și comisionul procentual; virarea
// lotului anterior apare ca linie „BankTransfer" fără Id, cu taxa de transfer.
export type DecontLinie = {
  batch_id: number
  linie: number
  comerciant: string
  order_ref: string
  data_platii: string
  data_operatiei: string
  procesat: string
  comision: string
  tva: string
  moneda: string
  descriere: string
}

const COLOANE = {
  batch: '#',
  comerciant: 'Comerciant',
  id: 'Id',
  dataPlatii: 'Data platii',
  dataOperatiei: 'Data operatiei',
  procesat: 'Procesat',
  comision: 'Comision',
  tva: 'TVA',
  moneda: 'Moneda',
  descriere: 'Descriere',
} as const

function parseFisierCsv(nume: string, text: string): DecontLinie[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim())
  const idx = Object.fromEntries(
    Object.entries(COLOANE).map(([k, h]) => [k, header.indexOf(h)]),
  ) as Record<keyof typeof COLOANE, number>
  if (idx.procesat < 0 || idx.comision < 0 || idx.id < 0) {
    throw new Error(`${nume} nu arată ca un fișier de decont Netopia (lipsesc coloanele Id/Procesat/Comision).`)
  }
  const dinNume = /batchId\.(\d+)/i.exec(nume)?.[1]
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

  return rows.slice(1).map((r, i) => {
    const batch = Number(cell(r, idx.batch) || dinNume)
    if (!Number.isFinite(batch) || batch <= 0) {
      throw new Error(`${nume}: linia ${i + 2} nu are numărul lotului.`)
    }
    return {
      batch_id: batch,
      linie: i + 1,
      comerciant: cell(r, idx.comerciant),
      order_ref: cell(r, idx.id),
      data_platii: cell(r, idx.dataPlatii).slice(0, 10),
      data_operatiei: cell(r, idx.dataOperatiei),
      procesat: cell(r, idx.procesat),
      comision: cell(r, idx.comision),
      tva: cell(r, idx.tva),
      moneda: cell(r, idx.moneda),
      descriere: cell(r, idx.descriere),
    }
  })
}

// Netopia dă fiecare lot ca .csv.zip; de multe ori ajung adunate într-un .zip mare.
// Le desfacem pe toate, la orice adâncime.
function dinArhiva(bytes: Uint8Array, out: { nume: string; text: string }[]) {
  const fisiere = unzipSync(bytes)
  for (const [nume, continut] of Object.entries(fisiere)) {
    if (nume.startsWith('__MACOSX/') || nume.split('/').pop()?.startsWith('._')) continue
    const lower = nume.toLowerCase()
    if (lower.endsWith('.zip')) dinArhiva(continut, out)
    else if (lower.endsWith('.csv')) out.push({ nume: nume.split('/').pop() ?? nume, text: strFromU8(continut) })
  }
}

export async function citesteFisiereDecont(files: File[]): Promise<DecontLinie[]> {
  const csvuri: { nume: string; text: string }[] = []
  for (const f of files) {
    if (f.name.toLowerCase().endsWith('.zip')) {
      dinArhiva(new Uint8Array(await f.arrayBuffer()), csvuri)
    } else {
      csvuri.push({ nume: f.name, text: await f.text() })
    }
  }
  if (csvuri.length === 0) throw new Error('Nu am găsit niciun fișier CSV de la Netopia.')

  // Același lot ales de două ori (din arhivă și separat) se ia o singură dată.
  const sursaLotului = new Map<number, number>()
  return csvuri.flatMap((c, i) =>
    parseFisierCsv(c.nume, c.text).filter((l) => {
      const sursa = sursaLotului.get(l.batch_id) ?? i
      sursaLotului.set(l.batch_id, sursa)
      return sursa === i
    }),
  )
}
