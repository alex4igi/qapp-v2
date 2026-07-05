export type FacturaSursa = 'banca' | 'portal'
export type FacturaStatus =
  | 'Pending'
  | 'Matched'
  | 'Emisa'
  | 'Marcata'
  | 'Eroare'
  | 'Ignorata'

export type FacturaLinie = { articol: string | null; suma: number }

export type FacturaRow = {
  ref: string
  sursa: FacturaSursa
  firma_cui: string
  client_nume: string
  suma: number
  valuta: string
  data_tranzactie: string
  descriere: string | null
  client_id: string | null
  familia_id: string | null
  incasare_id: string | null
  factura_fgo: string | null
  factura_link: string | null
  status: FacturaStatus
  eroare_mesaj: string | null
  emis_la: string | null
  platit_la: string | null
  linii: FacturaLinie[] | null
}

export type MatchSuggestion = {
  tip: 'client' | 'familie'
  id: string
  nume: string
  familia_id: string | null
  scor: number
}

export type IngestSummary = {
  firma: { nume: string; cui: string; iban: string; serie: string }
  total: number
  ignored: number
  inserted: number
  duplicates: number
}

export type EmitResult = {
  ref: string
  client: string
  status: string
  factura?: string
  mesaj?: string
}
