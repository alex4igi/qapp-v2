// Liste de opțiuni pentru câmpurile enum — folosite în formulare și filtre.
import type { SelectOption } from '@/components/ui'

const opts = (...values: string[]): SelectOption[] =>
  values.map((v) => ({ label: v, value: v }))

export const sexOptions = opts('B', 'F')

export const statusClientOptions = opts('Activ', 'Inactiv', 'EXclient')

export const marimeTricouOptions = opts(
  '110cm/4ani',
  '122cm/6ani',
  '134cm/8ani',
  '146cm/10ani',
  '158cm/12ani',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
)

export const nivelCursOptions = opts(
  'Incepator',
  'Intermediar',
  'Avansat',
  'Trupa',
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

export const metodaPlataOptions = opts('Cash', 'Card', 'Transfer', 'Revolut')

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

export const tipFeedbackOptions = opts('Sesizare', 'Review')

export const statusSmsOptions = opts(
  'De trimis',
  'In curs de trimitere',
  'Trimis',
  'Esuat',
)

export const categorieIncasareOptions = opts(
  'Abonament',
  'Bilet',
  'Merch',
  'Taxa',
)

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
