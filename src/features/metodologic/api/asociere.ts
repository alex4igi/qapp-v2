import { supabase } from '@/lib/supabase'
import { NIVEL_PROGRAMA_TO_CURS, ZILE_WEEKEND } from '../constants'
import type { Program } from '../types'

// Asocierea program ↔ curs. Trigger-ul din DB refuză programele în ciornă, deci
// aici oferim doar programele active ale sezonului.

export type CursDeAsociat = {
  id: string
  numele: string
  nivelul: string | null
  varsta: string | null
  zile: string[] | null
  ora: string | null
  sezon: string | null
  program_metodologic: string | null
}

export async function getProgrameActive(sezonEticheta: string): Promise<Program[]> {
  const { data, error } = await supabase
    .from('programe_metodologice')
    .select('*')
    .eq('sezon_eticheta', sezonEticheta)
    .eq('stare', 'activ')
    .order('nume')
  if (error) throw error
  return data ?? []
}

export async function setProgramCurs(cursId: string, programId: string | null): Promise<void> {
  const { error } = await supabase
    .from('cursuri')
    .update({ program_metodologic: programId })
    .eq('id', cursId)
  if (error) throw error
}

/**
 * Programul potrivit pentru un curs, după nivel + ritm săptămânal.
 *
 * Programele sunt denumite generat la import („Începători copii · weekend"), deci
 * potrivim pe `nivel_eticheta` + `sedinte_pe_saptamana` + tiparul zilelor din nume.
 * Când rămân mai multe candidate, nu ghicim — UI-ul cere alegerea manuală.
 */
export function sugereazaProgram(
  curs: Pick<CursDeAsociat, 'nivelul' | 'varsta' | 'zile'>,
  programe: Program[]
): Program | null {
  const zile = curs.zile ?? []
  if (zile.length === 0 || !curs.nivelul) return null

  const eWeekend = zile.every((z) => ZILE_WEEKEND.includes(z))
  const eCopil = curs.varsta ? /^(Tiny|Junior)/i.test(curs.varsta) : false

  const candidate = programe.filter((p) => {
    if (p.sedinte_pe_saptamana !== zile.length) return false

    const niveleProgram = (p.nivel_eticheta ?? '')
      .split('/')
      .map((n) => NIVEL_PROGRAMA_TO_CURS[n.trim()])
      .filter(Boolean)
    if (!niveleProgram.includes(curs.nivelul as string)) return false

    // Ritmul e codificat în nume la import; „1×/săpt." se potrivește deja prin
    // sedinte_pe_saptamana, deci verificăm doar dihotomia weekend/săptămână.
    if (zile.length > 1) {
      const programWeekend = p.nume.includes('weekend')
      if (programWeekend !== eWeekend) return false
    }

    // Categoria de vârstă apare în nume doar când programul e dedicat unui segment.
    const dedicatCopiilor = p.nume.includes('copii')
    const dedicatMarilor = p.nume.includes('Teen/Varsity')
    if (dedicatCopiilor && !eCopil) return false
    if (dedicatMarilor && eCopil) return false

    return true
  })

  return candidate.length === 1 ? candidate[0] : null
}
