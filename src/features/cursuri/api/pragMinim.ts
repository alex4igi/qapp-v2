import { supabase } from '@/lib/supabase'

// Pragul minim de existență al grupei: 8 cursanți plătitori (6 în SCM Studio 2),
// stocat pe sală. Trei luni încheiate la rând sub prag ⇒ grupa e propusă pentru
// suspendare; decizia rămâne a managerului. Toată regula stă în DB
// (`_grupe_sub_minim`, migrația 20260914110000) — cronul lunar și UI-ul citesc
// același răspuns.

export type StarePragMinim =
  | 'in_rodaj'
  | 'ok'
  | 'in_observatie'
  | 'de_suspendat'
  | 'suspendat'

export type LunaPragMinim = {
  /** "YYYY-MM" */
  luna: string
  /** null când grupa a fost suspendată în luna aia */
  cursanti: number | null
  activ: boolean
  sub: boolean
}

export type GrupaPragMinim = {
  cursId: string
  cursNume: string
  salaNume: string | null
  teacherNume: string | null
  minim: number
  lunaLansare: string
  luni: LunaPragMinim[]
  luniSubConsecutive: number
  cursantiLunaCurenta: number | null
  stare: StarePragMinim
  sezonInCurs: boolean
}

/** După câte luni încheiate la rând sub minim grupa e propusă pentru suspendare. */
export const LUNI_PANA_LA_PROPUNERE = 3

export async function getGrupeSubMinim(params: {
  sezonId?: string | null
  cursId?: string | null
}): Promise<GrupaPragMinim[]> {
  const { data, error } = await supabase.rpc('get_grupe_sub_minim', {
    p_sezon: params.sezonId ?? undefined,
    p_curs: params.cursId ?? undefined,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    cursId: r.curs_id,
    cursNume: r.curs_nume,
    salaNume: r.sala_nume,
    teacherNume: r.teacher_nume,
    minim: r.minim,
    lunaLansare: r.luna_lansare,
    luni: (r.luni as unknown as LunaPragMinim[]) ?? [],
    luniSubConsecutive: r.luni_sub_consecutive,
    cursantiLunaCurenta: r.cursanti_luna_curenta,
    stare: r.stare as StarePragMinim,
    sezonInCurs: r.sezon_in_curs,
  }))
}

const LUNI_SCURT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function lunaScurta(luna: string): string {
  return LUNI_SCURT[Number(luna.slice(5, 7)) - 1] ?? luna
}

/** Lunile din șirul de sub minim, cele mai vechi primele: „oct 5 · nov 4 · dec 5". */
export function serieSubMinim(g: GrupaPragMinim): string {
  return g.luni
    .slice(-g.luniSubConsecutive)
    .map((l) => `${lunaScurta(l.luna)} ${l.cursanti ?? 0}`)
    .join(' · ')
}

// Avertizarea timpurie (decisă 21 sept. 2026): grupa e sub minim în luna în
// CURS, cât încă se mai poate umple. Nu atinge regula de suspendare — aceea
// testează doar lunile încheiate de după luna lansării. Grupele deja în
// observație sau propuse pentru suspendare au semnalul lor, mai tare.
export function subMinimLunaAsta(g: GrupaPragMinim): boolean {
  return (
    g.sezonInCurs &&
    g.stare !== 'suspendat' &&
    g.stare !== 'in_observatie' &&
    g.stare !== 'de_suspendat' &&
    g.cursantiLunaCurenta != null &&
    g.cursantiLunaCurenta < g.minim
  )
}

/** Luna în curs e luna lansării grupei — nu se numără la cele 3 luni. */
export function eLunaLansarii(g: GrupaPragMinim): boolean {
  const d = new Date()
  const azi = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return g.lunaLansare.slice(0, 7) === azi
}

export function motivSuspendareSubMinim(g: GrupaPragMinim): string {
  return `Sub minimul de ${g.minim} cursanți ${g.luniSubConsecutive} luni la rând (${serieSubMinim(g)}).`
}
