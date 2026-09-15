// Liste de opțiuni pentru câmpurile enum — folosite în formulare și filtre.
import type { SelectOption } from '@/components/ui'

const opts = (...values: string[]): SelectOption[] =>
  values.map((v) => ({ label: v, value: v }))

export const sexOptions = opts('B', 'F')

export const statusClientOptions = opts('Activ', 'Inactiv', 'EXclient')

// Grupate „Copii"/„Adulți": mărimile pe vârstă și cele pe litere stau în
// dropdown sub antete separate (Select le randează ca <optgroup>).
const grup = (group: string, ...values: string[]): SelectOption[] =>
  values.map((v) => ({ label: v, value: v, group }))

export const marimeTricouOptions: SelectOption[] = [
  ...grup('Copii', '110cm/4ani', '122cm/6ani', '134cm/8ani', '146cm/10ani', '158cm/12ani'),
  ...grup('Adulți', 'XS', 'S', 'M', 'L', 'XL', 'XXL'),
]

export const nivelCursOptions = opts(
  'Incepator',
  'Intermediar',
  'Avansat',
  'Trupa',
)

// `cursuri.stil` e coloană text, nu enum în DB — lista de aici e singurul lucru
// care ține vocabularul închis. A fost text liber până în 09-2026 și derivase pe
// locații („Streetdance" la Ștefan cel Mare vs „Street Dance" la Nicolina), deci
// aceeași disciplină se număra de mai multe ori în orice grupare pe stil.
export const stilCursOptions = opts(
  'Street Dance',
  'Gimnastica',
  'K-Pop',
  'Teatru',
  'Zumba',
  'Open',
)

export const varstaCursOptions = opts(
  'Tiny 4-7',
  'Junior 7-10',
  'Varsity 11-15',
  'Teens 15-20',
  'Students 20-25',
  'Adults 25+',
  'Mixt',
)

export const zileOptions = opts(
  'Luni',
  'Marti',
  'Miercuri',
  'Joi',
  'Vineri',
  'Sambata',
  'Duminica',
)

export const tipPlataOptions = opts('Per sedinta', 'Per luna', 'Per an')

export const tipVoucherOptions = opts('Valoare', 'Procent')

export const metodaPlataOptions = opts('Cash', 'Card', 'Transfer', 'Revolut', 'Online')

export const statusPrezentaOptions = opts('Prezent', 'Absent', 'Motivat')

export const nivelTeacherOptions = opts('Junior', 'Senior', 'Expert')

export const categorieInventarOptions = opts(
  'Haine',
  'Accesorii',
  'Costume',
  'Merch',
  'Consumabil',
)

export const statusEvenimentOptions = opts('Urmator', 'Finalizat', 'Anulat')

export const tipEvenimentOptions = opts(
  'Eveniment',
  'Workshop',
  'Auditie',
  'DEMO Class',
)

export const tipDocumentOptions = opts(
  'Contract',
  'Anexa',
  'Reziliere',
  'Medical',
  'Declaratie',
  'Altul',
)

export const tipFeedbackOptions = opts('Sesizare', 'Review')

export const statusSmsOptions = opts(
  'De trimis',
  'In curs de trimitere',
  'Trimis',
  'Esuat',
  'Amanat',
)

// Valorile enum-ului din DB n-au diacritice; eticheta e cea afișată.
export const categorieIncasareLabel: Record<string, string> = {
  Abonament: 'Abonament',
  Bilet: 'Bilet',
  Merch: 'Merch',
  Taxa: 'Taxă',
  Workshop: 'Workshop',
  Auditie: 'Audiție',
  Inchiriere: 'Închiriere',
}

export const categorieIncasareOptions: SelectOption[] = Object.entries(
  categorieIncasareLabel,
).map(([value, label]) => ({ value, label }))

export const categorieCheltuialaOptions = opts(
  'Administrativa',
  'Salariala',
  'Alta',
)

export const canalComunicareOptions = opts('Online', 'Offline')

export const canaleOnlineOptions = opts(
  'Meta ADS',
  'Google ADS',
  'TikTok Ads',
  'Organic',
)
