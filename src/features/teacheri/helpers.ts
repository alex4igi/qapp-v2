import type { Teacher, UpdateDto } from '@/types/db'
import type { TeacherCheckInput } from '@/lib/checklist/specs/teacher'

export type FormState = {
  nume: string
  prenume: string
  data_nasterii: string
  telefon: string
  email: string
  nivelul: string
  marime_tricou: string
  link_contract: string
  observatii: string
}

export function initialState(teacher?: Teacher | null): FormState {
  return {
    nume: teacher?.nume ?? '',
    prenume: teacher?.prenume ?? '',
    data_nasterii: teacher?.data_nasterii ?? '',
    telefon: teacher?.telefon ?? '',
    email: teacher?.email ?? '',
    nivelul: teacher?.nivelul ?? '',
    marime_tricou: teacher?.marime_tricou ?? '',
    link_contract: teacher?.link_contract ?? '',
    observatii: teacher?.observatii ?? '',
  }
}

export type TeacherPayload = UpdateDto<'teacheri'> & { nume: string }

// Extras din corpul mutației ca salvarea și checklistul live să evalueze exact
// același obiect — altfel cele două se despart tăcut în timp.
export function buildTeacherPayload(form: FormState): TeacherPayload {
  return {
    nume: form.nume.trim(),
    prenume: form.prenume.trim() || null,
    data_nasterii: form.data_nasterii || null,
    telefon: form.telefon.trim() || null,
    email: form.email.trim() || null,
    nivelul: (form.nivelul || null) as Teacher['nivelul'],
    marime_tricou: (form.marime_tricou || null) as Teacher['marime_tricou'],
    link_contract: form.link_contract.trim() || null,
    observatii: form.observatii.trim() || null,
  }
}

// Draftul din formular NU acoperă tot ce verifică checklistul: contul de
// aplicație se leagă din tab-ul „Detalii personale", nu din modal. Le luăm din
// rândul salvat, ca rail-ul să nu raporteze lipsă pentru ce e deja completat.
export function teacherCheckInput(
  form: FormState,
  teacher?: Teacher | null,
): TeacherCheckInput {
  const p = buildTeacherPayload(form)
  return {
    id: teacher?.id ?? null,
    nume: p.nume ?? '',
    prenume: p.prenume ?? null,
    telefon: p.telefon ?? null,
    email: p.email ?? null,
    data_nasterii: p.data_nasterii ?? null,
    nivelul: p.nivelul ?? null,
    marime_tricou: p.marime_tricou ?? null,
    link_contract: p.link_contract ?? null,
    auth_user_id: teacher?.auth_user_id ?? null,
  }
}
