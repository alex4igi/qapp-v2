import type { ChecklistSpec } from '../types'

/**
 * Secțiunea unde se completează câmpul. `firma` NU e în modalul de editare, ci
 * în secțiunea „Date facturare pe firmă" din tab-ul „Detalii personale" —
 * cardul deschide tab-ul, nu formularul (la fel ca itemul de cont al teacherului).
 */
export type SectiuneFamilie = 'identitate' | 'reprezentant' | 'contact' | 'firma'

/**
 * Funcție pură de rândul `familii`. Membrii familiei, plățile și înrolările lor
 * stau în alte tabele — nu intră aici.
 *
 * `metoda_plata` și `metoda_comunicare` sunt lăsate AFARĂ: completate la 0 din
 * 656 de familii și necitite de nicio logică din app (măsurat 29 aug 2026).
 */
export type FamilieCheckInput = {
  nume_familie: string
  nume_reprezentant: string | null
  prenume_reprezentant: string | null
  telefon: string | null
  email: string | null
  factura_pe_firma: boolean
  firma_denumire: string | null
  firma_cif: string | null
  firma_adresa: string | null
}

const completat = (v: string | null | undefined) => Boolean(v && v.trim())
const peFirma = (f: FamilieCheckInput) => f.factura_pe_firma

/** Coloanele cerute de checklist — un singur adevăr pentru toți apelanții. */
export const FAMILIE_CHECKLIST_COLS = [
  'id', 'nume_familie', 'nume_reprezentant', 'prenume_reprezentant', 'telefon',
  'email', 'factura_pe_firma', 'firma_denumire', 'firma_cif', 'firma_adresa',
].join(',')

export const FAMILIE_CHECKLIST: ChecklistSpec<FamilieCheckInput> = {
  entitate: 'familie',
  items: [
    {
      id: 'nume_familie',
      eticheta: 'Nume familie',
      severitate: 'esential',
      sectiune: 'identitate',
      completat: (f) => completat(f.nume_familie),
    },
    {
      id: 'nume_reprezentant',
      eticheta: 'Nume reprezentant',
      severitate: 'esential',
      sectiune: 'reprezentant',
      motiv: 'Reprezentantul e persoana cu care se semnează contractul.',
      completat: (f) => completat(f.nume_reprezentant),
    },
    {
      id: 'prenume_reprezentant',
      eticheta: 'Prenume reprezentant',
      severitate: 'esential',
      sectiune: 'reprezentant',
      completat: (f) => completat(f.prenume_reprezentant),
    },
    {
      id: 'telefon',
      eticheta: 'Telefon',
      severitate: 'esential',
      sectiune: 'contact',
      motiv: 'Fără telefon, familia nu primește SMS-urile de restanță.',
      completat: (f) => completat(f.telefon),
    },
    {
      id: 'firma_denumire',
      eticheta: 'Denumire firmă',
      severitate: 'esential',
      sectiune: 'firma',
      seAplica: peFirma,
      motiv: 'Facturarea pe firmă e activă — fără denumire, factura nu se poate emite.',
      completat: (f) => completat(f.firma_denumire),
    },
    {
      id: 'firma_cif',
      eticheta: 'CUI firmă',
      severitate: 'esential',
      sectiune: 'firma',
      seAplica: peFirma,
      motiv: 'Facturarea pe firmă e activă — fără CUI, factura nu se poate emite.',
      completat: (f) => completat(f.firma_cif),
    },
    {
      id: 'firma_adresa',
      eticheta: 'Adresă firmă',
      severitate: 'esential',
      sectiune: 'firma',
      seAplica: peFirma,
      completat: (f) => completat(f.firma_adresa),
    },
    {
      id: 'email',
      eticheta: 'Email',
      severitate: 'recomandat',
      sectiune: 'contact',
      motiv: 'Fără email nu se pot trimite contractul și facturile.',
      completat: (f) => completat(f.email),
    },
  ],
}
