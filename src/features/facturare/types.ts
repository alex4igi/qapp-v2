export type FacturaSursa = 'banca' | 'portal' | 'client'
export type FacturaStatus =
  | 'Pending'
  | 'Matched'
  | 'Emisa'
  | 'Marcata'
  | 'Eroare'
  | 'Ignorata'

// client_id: cui i se atribuie linia când transferul bancar plătește pentru mai mulți
// clienți. Lipsește pe liniile de dinaintea alocărilor și pe fluxurile portal/client.
export type FacturaLinie = { articol: string | null; suma: number; client_id?: string | null }

// Beneficiarii unui transfer bancar. Doar CINE — suma și starea plății se derivă din
// linii[].client_id (vezi alocari.ts), ca banii să nu fie ținuți în două locuri.
export type Alocare = {
  client_id: string
  familia_id: string | null
  nume: string
}

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
  alocari: Alocare[]
}

export type MatchSuggestion = {
  tip: 'client' | 'familie'
  id: string
  nume: string
  familia_id: string | null
  scor: number
  status?: string | null
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
