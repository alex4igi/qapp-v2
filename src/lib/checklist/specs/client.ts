import type { ChecklistSpec } from '../types'

/** Secțiunea din ClientForm unde se completează câmpul (deep-link din card). */
export type SectiuneClient = 'identitate' | 'contact' | 'personale' | 'familie'

/**
 * Funcție pură de rândul `clienti` PLUS lista lui de documente (embed ieftin:
 * câteva sute de rânduri în tot tabelul). Înrolările, prezențele și plățile
 * stau în alte tabele și nu intră aici.
 *
 * Câmpuri LĂSATE AFARĂ deliberat, după ce am măsurat completarea pe cei 477 de
 * clienți activi (29 aug 2026): `sexul` (13%) și `unitate_invatamant` (1%) nu
 * sunt citite de nicio logică din app; `marime_tricou` (2%) și `foto` (0%, fără
 * nicio suprafață care să-l seteze) ar produce doar zgomot. Un item care nu
 * schimbă nimic când îl bifezi nu merită să fie roșu.
 */
export type ClientCheckInput = {
  nume: string
  prenume: string | null
  telefon: string | null
  email: string | null
  data_nasterii: string | null
  familia: string | null
  /**
   * Embed PostgREST `documente:documente_client(tip)`. Singurul item care nu se
   * citește din rândul `clienti` — contractul a devenit un rând în tabul
   * Documente, nu un câmp pe fișă (vezi migrația 20260901200000).
   */
  documente: { tip: string }[] | null
}

const completat = (v: string | null | undefined) => Boolean(v && v.trim())

/** Coloanele cerute de checklist — un singur adevăr pentru toți apelanții. */
export const CLIENT_CHECKLIST_COLS = [
  'id', 'nume', 'prenume', 'telefon', 'email', 'data_nasterii', 'familia',
  'documente:documente_client(tip)',
].join(',')

// Minor la ziua de azi. Fără dată de naștere nu putem ști — atunci regulile care
// depind de vârstă NU se aplică, iar lipsa datei e semnalată de itemul ei.
export function esteMinor(dataNasterii: string | null): boolean {
  if (!dataNasterii) return false
  const n = new Date(dataNasterii)
  if (Number.isNaN(n.getTime())) return false
  const azi = new Date()
  let ani = azi.getFullYear() - n.getFullYear()
  const luna = azi.getMonth() - n.getMonth()
  if (luna < 0 || (luna === 0 && azi.getDate() < n.getDate())) ani--
  return ani < 18
}

export const CLIENT_CHECKLIST: ChecklistSpec<ClientCheckInput> = {
  entitate: 'client',
  items: [
    {
      id: 'nume',
      eticheta: 'Nume',
      severitate: 'esential',
      sectiune: 'identitate',
      completat: (c) => completat(c.nume),
    },
    {
      id: 'prenume',
      eticheta: 'Prenume',
      severitate: 'esential',
      sectiune: 'identitate',
      completat: (c) => completat(c.prenume),
    },
    {
      id: 'telefon',
      eticheta: 'Telefon',
      severitate: 'esential',
      sectiune: 'contact',
      motiv: 'Fără telefon, cursantul nu primește SMS-urile de restanță și de grupă.',
      completat: (c) => completat(c.telefon),
    },
    {
      id: 'data_nasterii',
      eticheta: 'Data nașterii',
      severitate: 'esential',
      sectiune: 'personale',
      motiv: 'Vârsta decide grupa potrivită și categoria la concursuri.',
      completat: (c) => completat(c.data_nasterii),
    },
    {
      id: 'familia',
      eticheta: 'Familie',
      severitate: 'esential',
      sectiune: 'familie',
      // Doar la minori: un adult se plătește singur, deci n-are nevoie de familie.
      seAplica: (c) => esteMinor(c.data_nasterii),
      motiv: 'La un minor, familia e titularul plăților, al contractului și al contului de portal.',
      completat: (c) => completat(c.familia),
    },
    {
      id: 'email',
      eticheta: 'Email',
      severitate: 'recomandat',
      sectiune: 'contact',
      motiv: 'Fără email nu se pot trimite contractul și facturile.',
      completat: (c) => completat(c.email),
    },
    {
      id: 'contract',
      eticheta: 'Contract',
      severitate: 'recomandat',
      // Fără `sectiune`: nu se completează din ClientForm, ci din tabul
      // Documente. Profilul rutează itemul acolo după `id`.
      motiv: 'Contractul se adaugă în tabul Documente al fișei.',
      completat: (c) =>
        (c.documente ?? []).some((d) => d.tip === 'Contract' || d.tip === 'Anexa'),
    },
  ],
}
