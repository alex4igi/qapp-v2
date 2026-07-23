import { supabase } from '@/lib/supabase'
import { getCalendarSezon } from './calendar'
import type {
  LectieAfisata,
  LectieAzi,
  Program,
  ProgramDetaliat,
  ProgramLectie,
  ProgresAdmin,
  ProgresTeacher,
  StareProgram,
  TipLectie,
} from '../types'

export async function getPrograme(sezonEticheta: string): Promise<Program[]> {
  const { data, error } = await supabase
    .from('programe_metodologice')
    .select('*')
    .eq('sezon_eticheta', sezonEticheta)
    .order('nume')
  if (error) throw error
  return data ?? []
}

export async function getProgresAdmin(sezonEticheta: string | null): Promise<ProgresAdmin[]> {
  const { data, error } = await supabase.rpc('get_program_progres_admin', {
    p_sezon_eticheta: sezonEticheta ?? undefined,
    p_locatie: undefined,
  })
  if (error) throw error
  return (data as ProgresAdmin[]) ?? []
}

export async function getProgresTeacher(): Promise<ProgresTeacher[]> {
  const { data, error } = await supabase.rpc('get_program_progres_teacher')
  if (error) throw error
  return (data as ProgresTeacher[]) ?? []
}

export async function getLectieAzi(cursId: string, data?: string): Promise<LectieAzi | null> {
  const { data: rows, error } = await supabase.rpc('get_program_lectie_azi', {
    p_curs: cursId,
    p_data: data,
  })
  if (error) throw error
  return ((rows as LectieAzi[]) ?? [])[0] ?? null
}

/**
 * Programul complet pentru afișare: modulele (cu calendarul sezonului atașat) și
 * lecțiile lor, vacanțele separat.
 *
 * `cursId` opțional aplică stratul grupei: adaptările (curs_lectii_override) și
 * confirmările din jurnal. Fără el se vede standardul pur.
 */
export async function getProgramDetaliat(
  programId: string,
  cursId?: string
): Promise<ProgramDetaliat | null> {
  const { data: program, error: eProgram } = await supabase
    .from('programe_metodologice')
    .select('*')
    .eq('id', programId)
    .maybeSingle()
  if (eProgram) throw eProgram
  if (!program) return null

  const [{ data: module, error: eModule }, { data: lectii, error: eLectii }, calendar] =
    await Promise.all([
      supabase.from('program_module').select('*').eq('program_id', programId).order('numar'),
      supabase.from('program_lectii').select('*').eq('program_id', programId).order('nr_sedinta'),
      getCalendarSezon(program.sezon_eticheta),
    ])
  if (eModule) throw eModule
  if (eLectii) throw eLectii

  const overrides = new Map<number, { titlu: string | null; note: string | null }>()
  const jurnal = new Map<number, 'conform' | 'diferit'>()
  if (cursId) {
    const [{ data: ov }, { data: jr }] = await Promise.all([
      supabase.from('curs_lectii_override').select('nr_sedinta,titlu,note').eq('curs_id', cursId),
      supabase.from('program_jurnal').select('nr_sedinta,status').eq('curs_id', cursId),
    ])
    for (const o of ov ?? []) overrides.set(o.nr_sedinta, { titlu: o.titlu, note: o.note })
    for (const j of jr ?? []) jurnal.set(j.nr_sedinta, j.status as 'conform' | 'diferit')
  }

  const decoreaza = (l: ProgramLectie): LectieAfisata => {
    const ov = overrides.get(l.nr_sedinta)
    return {
      ...l,
      titluAfisat: ov?.titlu ?? l.titlu,
      noteAfisate: ov?.note ?? l.note,
      adaptat: Boolean(ov),
      jurnal: jurnal.get(l.nr_sedinta) ?? null,
    }
  }

  return {
    program,
    module: (module ?? []).map((m) => ({
      modul: m,
      calendar: calendar.find((c) => c.tip === 'modul' && c.numar === m.numar) ?? null,
      lectii: (lectii ?? []).filter((l) => l.modul_id === m.id).map(decoreaza),
    })),
    vacante: calendar.filter((c) => c.tip === 'vacanta').sort((a, b) => a.numar - b.numar),
    totalSedinte: (lectii ?? []).length,
  }
}

// ── mutații: standardul (management) ────────────────────────────────────────

export async function updateProgram(
  id: string,
  patch: { nume?: string; descriere?: string | null; stare?: StareProgram }
): Promise<void> {
  const { error } = await supabase
    .from('programe_metodologice')
    .update({ ...patch, updated: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateModul(
  id: string,
  patch: { tema: string | null; subtitlu: string | null }
): Promise<void> {
  const { error } = await supabase.from('program_module').update(patch).eq('id', id)
  if (error) throw error
}

export async function updateLectie(
  id: string,
  patch: { titlu: string; note: string | null; tip: TipLectie }
): Promise<void> {
  const { error } = await supabase
    .from('program_lectii')
    .update({ ...patch, updated: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/**
 * Inserează o lecție după `dupaNr` și împinge restul cu 1.
 *
 * Renumerotarea merge descrescător: `unique(program_id, nr_sedinta)` ar sări în aer
 * dacă am muta crescător peste rânduri care încă există.
 */
export async function insereazaLectie(
  programId: string,
  modulId: string,
  dupaNr: number
): Promise<void> {
  const { data: deMutat, error: eSelect } = await supabase
    .from('program_lectii')
    .select('id,nr_sedinta')
    .eq('program_id', programId)
    .gt('nr_sedinta', dupaNr)
    .order('nr_sedinta', { ascending: false })
  if (eSelect) throw eSelect

  for (const l of deMutat ?? []) {
    const { error } = await supabase
      .from('program_lectii')
      .update({ nr_sedinta: l.nr_sedinta + 1 })
      .eq('id', l.id)
    if (error) throw error
  }

  const { error } = await supabase.from('program_lectii').insert({
    program_id: programId,
    modul_id: modulId,
    nr_sedinta: dupaNr + 1,
    titlu: 'Lecție nouă',
    tip: 'lectie',
  })
  if (error) throw error
}

export async function stergeLectie(programId: string, id: string, nr: number): Promise<void> {
  const { error: eDelete } = await supabase.from('program_lectii').delete().eq('id', id)
  if (eDelete) throw eDelete

  const { data: deMutat, error: eSelect } = await supabase
    .from('program_lectii')
    .select('id,nr_sedinta')
    .eq('program_id', programId)
    .gt('nr_sedinta', nr)
    .order('nr_sedinta', { ascending: true })
  if (eSelect) throw eSelect

  for (const l of deMutat ?? []) {
    const { error } = await supabase
      .from('program_lectii')
      .update({ nr_sedinta: l.nr_sedinta - 1 })
      .eq('id', l.id)
    if (error) throw error
  }
}

export async function duplicaStructuraSezon(sursa: string, tinta: string): Promise<number> {
  const { data, error } = await supabase.rpc('duplica_structura_sezon', {
    p_sursa: sursa,
    p_tinta: tinta,
  })
  if (error) throw error
  return (data as number) ?? 0
}

// Duplică un program într-o copie-ciornă (același sezon) și întoarce id-ul nou.
export async function duplicaProgram(programId: string, nume?: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplica_program', {
    p_program: programId,
    p_nume: nume,
  })
  if (error) throw error
  return data as string
}

// Ștergere program. force=true îl șterge chiar dacă e asociat unor grupe (le
// dezasociază). Garda + errcode QD409 vin din RPC (vezi DeleteConfirmModal).
export async function stergeProgram(programId: string, force = false): Promise<void> {
  const { error } = await supabase.rpc('sterge_program', {
    p_program: programId,
    p_force: force,
  })
  if (error) throw error
}

/**
 * Programă nouă de la zero (ciornă), cu câte un modul gol per modul din calendarul
 * sezonului — ca structura să se alinieze cu sezonul, iar userul doar să adauge
 * ședințe și teme.
 */
export async function creeazaProgram(sezonEticheta: string, nume: string): Promise<string> {
  const { data: prog, error: eProg } = await supabase
    .from('programe_metodologice')
    .insert({ nume, sezon_eticheta: sezonEticheta, stare: 'ciorna', sedinte_pe_saptamana: 2 })
    .select('id')
    .single()
  if (eProg) throw eProg

  const { data: cal, error: eCal } = await supabase
    .from('sezon_calendar')
    .select('numar')
    .eq('sezon_eticheta', sezonEticheta)
    .eq('tip', 'modul')
    .order('numar')
  if (eCal) throw eCal

  if (cal && cal.length) {
    const { error: eMod } = await supabase
      .from('program_module')
      .insert(cal.map((c) => ({ program_id: prog.id, numar: c.numar, tema: null, subtitlu: null })))
    if (eMod) throw eMod
  }

  return prog.id
}

/** Adaugă o ședință la finalul unui modul, cu numerotarea continuă recalculată. */
export async function adaugaLectie(programId: string, modulId: string): Promise<void> {
  const [{ data: module, error: eMod }, { data: lectii, error: eLec }] = await Promise.all([
    supabase.from('program_module').select('id,numar').eq('program_id', programId),
    supabase.from('program_lectii').select('nr_sedinta,modul_id').eq('program_id', programId),
  ])
  if (eMod) throw eMod
  if (eLec) throw eLec

  const numarById = new Map((module ?? []).map((m) => [m.id, m.numar]))
  const modulNumar = numarById.get(modulId) ?? 0

  // Poziția de inserare = ultima ședință din acest modul; dacă modulul e gol,
  // ultima ședință a modulelor dinainte (după numărul modulului); altfel 0.
  const panaLaModul = (lectii ?? []).filter((l) => (numarById.get(l.modul_id) ?? 0) <= modulNumar)
  const dupaNr = panaLaModul.length ? Math.max(...panaLaModul.map((l) => l.nr_sedinta)) : 0

  await insereazaLectie(programId, modulId, dupaNr)
}
