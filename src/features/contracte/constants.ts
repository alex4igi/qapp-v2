import type { BadgeTone } from '@/components/ui'

export const CONTRACT_STATUS_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  trimis: { label: 'Trimis', tone: 'brand' },
  deschis: { label: 'Deschis', tone: 'warn' },
  semnat: { label: 'Semnat', tone: 'success' },
  finalizat: { label: 'Finalizat', tone: 'success' },
  respins: { label: 'Respins', tone: 'danger' },
  expirat: { label: 'Expirat', tone: 'danger' },
  anulat: { label: 'Anulat', tone: 'neutral' },
}

export const CONTRACT_TIP_LABEL: Record<string, string> = {
  contract_educational: 'Contract educațional',
  act_aditional: 'Act adițional',
  tabara: 'Tabără',
  trupa: 'Trupă',
}
