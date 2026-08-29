import type { ChecklistSpec } from '../types'
import type { Teacher } from '@/types/db'

/** Secțiunea din TeacherForm unde se completează câmpul (deep-link din card). */
export type SectiuneTeacher = 'identitate' | 'contact' | 'hr' | 'altele' | 'cont'

/**
 * Ca la cursuri, checklistul e o funcție pură de rândul `teacheri`: e satisfăcut
 * atât de rândul din DB, cât și de draftul din formular (`teacherCheckInput`).
 * Ce ține de alt tabel — cursurile predate (`cursuri` / `cursuri_teacheri`),
 * locația, evaluările — rămâne DELIBERAT afară: ar cere un query în plus în
 * fiecare din cele patru suprafețe care afișează checklistul.
 *
 * `poza` lipsește tot deliberat: coloana există, dar nicio suprafață din
 * aplicație nu o poate seta — un item roșu nefixabil ar fi doar zgomot.
 */
export type TeacherCheckInput = {
  /** Absent la teacher nou — contul nu se poate lega înainte de salvare. */
  id?: string | null
  nume: string
  prenume: string | null
  telefon: string | null
  email: string | null
  data_nasterii: string | null
  nivelul: Teacher['nivelul']
  marime_tricou: Teacher['marime_tricou']
  link_contract: string | null
  auth_user_id: string | null
}

const completat = (v: string | null | undefined) => Boolean(v && v.trim())

/** Coloanele cerute de checklist — un singur adevăr pentru toți apelanții. */
export const TEACHER_CHECKLIST_COLS = [
  'id', 'nume', 'prenume', 'telefon', 'email', 'data_nasterii', 'nivelul',
  'marime_tricou', 'link_contract', 'auth_user_id',
].join(',')

export const TEACHER_CHECKLIST: ChecklistSpec<TeacherCheckInput> = {
  entitate: 'teacher',
  items: [
    {
      id: 'nume',
      eticheta: 'Nume',
      severitate: 'esential',
      sectiune: 'identitate',
      completat: (t) => completat(t.nume),
    },
    {
      id: 'prenume',
      eticheta: 'Prenume',
      severitate: 'esential',
      sectiune: 'identitate',
      motiv: 'Numele complet apare pe grupe, în salarii și în contracte.',
      completat: (t) => completat(t.prenume),
    },
    {
      id: 'telefon',
      eticheta: 'Telefon',
      severitate: 'esential',
      sectiune: 'contact',
      motiv: 'Fără telefon, instructorul nu poate fi anunțat de schimbări de program.',
      completat: (t) => completat(t.telefon),
    },
    {
      id: 'email',
      eticheta: 'Email',
      severitate: 'esential',
      sectiune: 'contact',
      motiv: 'Emailul e adresa pe care se creează contul de aplicație.',
      completat: (t) => completat(t.email),
    },
    {
      id: 'data_nasterii',
      eticheta: 'Data nașterii',
      severitate: 'esential',
      sectiune: 'hr',
      motiv: 'Necesară la contract și la evidența de personal.',
      completat: (t) => completat(t.data_nasterii),
    },
    {
      id: 'nivel',
      eticheta: 'Nivel (Junior/Senior/Expert)',
      severitate: 'esential',
      sectiune: 'hr',
      motiv: 'Încadrarea e reperul la evaluări și la stabilirea salariului.',
      completat: (t) => t.nivelul != null,
    },
    {
      id: 'link_contract',
      eticheta: 'Link contract',
      severitate: 'esential',
      sectiune: 'altele',
      motiv: 'Fără link, contractul semnat nu se găsește din fișă.',
      completat: (t) => completat(t.link_contract),
    },
    {
      id: 'cont',
      eticheta: 'Cont în aplicație',
      severitate: 'esential',
      sectiune: 'cont',
      // La un teacher nou contul nu are ce lega — se creează după salvare, din
      // tab-ul „Detalii personale". Itemul intră în calcul abia atunci.
      seAplica: (t) => Boolean(t.id),
      motiv: 'Fără cont, instructorul nu-și vede grupele, prezențele și salariul.',
      completat: (t) => completat(t.auth_user_id),
    },
    {
      id: 'marime_tricou',
      eticheta: 'Mărime tricou',
      severitate: 'recomandat',
      sectiune: 'altele',
      motiv: 'Se folosește la comenzile de echipament.',
      completat: (t) => t.marime_tricou != null,
    },
  ],
}
