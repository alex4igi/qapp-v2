// Data de la care există log de contacte (aplicarea migrației lead_contacte).
// Lunile anterioare reflectă doar conversii și show-rate (vezi banner-ul de
// backfill din ScorecardPage). NU se citește din DB.
export const DATA_LANSARE_SCORECARD = '2026-06-09'

// Locațiile pentru filtrul de scorecard. leads.locatia e TEXT label (nu uuid),
// deci aici trimitem LABEL-ul, identic cu LOCATII din features/leads/constants.
export const LOCATII_SCORECARD = ['Ștefan cel Mare', 'Nicolina'] as const

export type Clasa = 'sub' | 'standard' | 'peste' | null

export const CLASA_LABEL: Record<'sub' | 'standard' | 'peste', string> = {
  sub: 'Sub-standard',
  standard: 'Standard',
  peste: 'Peste-standard',
}
