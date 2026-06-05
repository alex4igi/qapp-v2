// Cele 10 abilități de dans evaluate, în ordinea din raportul de evaluare.
// `key` se mapează 1:1 pe coloanele tabelului `evaluari`.

import type { Evaluare } from '@/types/db'

export type SkillKey = Extract<keyof Evaluare, `skill_${string}`>

export type SkillDef = {
  key: SkillKey
  label: string
}

export const skills: SkillDef[] = [
  { key: 'skill_ritm',          label: 'Poate să țină ritmul și să se miște pe muzică' },
  { key: 'skill_pasi_baza',     label: 'Poate executa pașii de bază (top rock, basic step, bounce, groove)' },
  { key: 'skill_coregrafie',    label: 'Poate reține și reproduce o coregrafie scurtă' },
  { key: 'skill_izolari',       label: 'Poate realiza izolări ale corpului (cap, umeri, piept, șolduri)' },
  { key: 'skill_coordonare',    label: 'Poate coordona mișcările brațelor cu cele ale picioarelor' },
  { key: 'skill_freeze',        label: 'Poate executa freeze-uri și poziții stabile la finalul mișcării' },
  { key: 'skill_sincronizare',  label: 'Poate dansa sincronizat cu grupul' },
  { key: 'skill_improvizatie',  label: 'Poate improviza pași simpli în freestyle' },
  { key: 'skill_expresivitate', label: 'Își exprimă personalitatea și emoția prin mișcare (atitudine, expresivitate)' },
  { key: 'skill_prezentare',    label: 'Poate prezenta o coregrafie în fața publicului cu încredere' },
]

export const SCALE_LEFT  = 'cu foarte mult ajutor'
export const SCALE_RIGHT = 'reușește independent'
