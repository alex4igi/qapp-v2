export type FormState = {
  numele_sezonului: string
  tip: 'principal' | 'extra'
  data_incepere: string
  data_final: string
}

export const STARE_LABEL: Record<string, string> = {
  planificat: 'PLANIFICAT',
  activ: 'ACTIV',
  arhivat: 'ARHIVAT',
}

export const STARE_CLS: Record<string, string> = {
  planificat: 'bg-blue-100 text-blue-800',
  activ: 'bg-quasar-yellow text-quasar-black',
  arhivat: 'bg-quasar-gray/30 text-quasar-black/70',
}

export const TIP_CLS: Record<string, string> = {
  principal: 'bg-quasar-black text-quasar-white',
  extra: 'bg-purple-100 text-purple-800',
}
