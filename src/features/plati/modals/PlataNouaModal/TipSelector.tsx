import { Tabs } from '@/components/ui'
import { tipTabs, type TipPlata } from './helpers'

type Props = {
  value: TipPlata
  onChange: (tip: TipPlata) => void
}

/**
 * Tipul de încasare. Folosește `Tabs` din liant, nu o copie proprie a marcajului:
 * varianta scrisă de mână nu se derula pe telefon, deci ultimul tip („Taxă")
 * rămânea inaccesibil sub 400px.
 */
export function TipSelector({ value, onChange }: Props) {
  return (
    <Tabs
      tabs={tipTabs}
      active={value}
      onChange={(id) => onChange(id as TipPlata)}
    />
  )
}
