import type { Lead } from '@/types/db'
import type { LeadForm } from '../api'

export const STEP_ORDER = ['nou', 'contactat', 'programat', 'convertit'] as const
export const EXIT_KEYS = ['waiting_list', 'a_venit', 'nu_a_venit', 'nurture', 'pierdut'] as const

export function ageFromDob(dob: string): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 && a < 120 ? a : null
}

export function initialsOf(prenume: string, nume: string): string {
  const a = (prenume || '').trim()[0] ?? ''
  const b = (nume || '').trim()[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

export const EMPTY: LeadForm = {
  prenume: '',
  nume: '',
  nume_parinte: '',
  telefon: '',
  email: '',
  data_nasterii: '',
  sursa: '',
  interes: '',
  grupa_varsta: '',
  status: 'nou',
  sub_status: '',
  motiv_pierdut: '',
  locatia: '',
  data_programare: '',
  data_callback_dorit: '',
  observatii: '',
}

export function fromLead(lead: Lead): LeadForm {
  return {
    prenume: lead.prenume ?? '',
    nume: lead.nume,
    nume_parinte: lead.nume_parinte ?? '',
    telefon: lead.telefon ?? '',
    email: lead.email ?? '',
    data_nasterii: lead.data_nasterii ?? '',
    sursa: lead.sursa ?? '',
    interes: lead.interes ?? '',
    grupa_varsta: lead.grupa_varsta ?? '',
    status: lead.status,
    sub_status: lead.sub_status ?? '',
    motiv_pierdut: lead.motiv_pierdut ?? '',
    locatia: lead.locatia ?? '',
    data_programare: lead.data_programare
      ? lead.data_programare.slice(0, 10)
      : '',
    data_callback_dorit: lead.data_callback_dorit
      ? lead.data_callback_dorit.slice(0, 10)
      : '',
    observatii: lead.observatii ?? '',
  }
}
