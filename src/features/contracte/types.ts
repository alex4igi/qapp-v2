import type { SelectOption } from '@/components/ui'

// Mirror manual al `TemplateField` din supabase/functions/_shared/contracte.ts
// (Deno vs Vite — nu pot fi partajate direct). Ține-le sincronizate.
export type TemplateField = {
  key: string
  label: string
  type: 'text' | 'date' | 'checkbox' | 'signature' | 'copii_table'
  source:
    | 'familie.reprezentant'
    | 'familie.cnp'
    | 'familie.adresa'
    | 'familie.ci'
    | 'familie.telefon'
    | 'familie.email'
    | 'copil.nume'
    | 'manual'
    | 'azi'
  required?: boolean
  editable?: boolean
  page: number
  x: number
  y: number
  w: number
  h: number
  fontSize?: number
}

export const FIELD_TYPE_OPTIONS: SelectOption[] = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Dată' },
  { value: 'checkbox', label: 'Bifă' },
  { value: 'signature', label: 'Semnătură' },
  { value: 'copii_table', label: 'Tabel copii' },
]

export const FIELD_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'manual', label: 'Manual (completează familia)' },
  { value: 'azi', label: 'Data de azi (automat)' },
  { value: 'familie.reprezentant', label: 'Nume reprezentant' },
  { value: 'familie.cnp', label: 'CNP reprezentant' },
  { value: 'familie.adresa', label: 'Adresă' },
  { value: 'familie.ci', label: 'Serie/nr. CI' },
  { value: 'familie.telefon', label: 'Telefon' },
  { value: 'familie.email', label: 'Email' },
  { value: 'copil.nume', label: 'Nume copil' },
]

// Dimensiuni implicite (normalizate 0..1) la adăugarea unui câmp nou, per tip.
export const FIELD_DEFAULT_SIZE: Record<TemplateField['type'], { w: number; h: number }> = {
  text: { w: 0.3, h: 0.03 },
  date: { w: 0.18, h: 0.03 },
  checkbox: { w: 0.02, h: 0.02 },
  signature: { w: 0.25, h: 0.08 },
  copii_table: { w: 0.5, h: 0.15 },
}

export const FIELD_DEFAULT_FONT_SIZE = 12
