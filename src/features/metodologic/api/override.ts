import { supabase } from '@/lib/supabase'

// Adaptarea grupei: teacherul suprascrie titlul/notele unei lecții DOAR pentru
// grupa lui. Standardul (program_lectii) rămâne neatins.
// titlu/note null = câmpul revine la standard; ambele null = adaptarea dispare.

export async function setOverride(
  cursId: string,
  nrSedinta: number,
  patch: { titlu: string | null; note: string | null },
  teacherId: string | null
): Promise<void> {
  if (!patch.titlu && !patch.note) {
    await stergeOverride(cursId, nrSedinta)
    return
  }
  const { error } = await supabase.from('curs_lectii_override').upsert(
    {
      curs_id: cursId,
      nr_sedinta: nrSedinta,
      titlu: patch.titlu,
      note: patch.note,
      updated_by: teacherId,
      updated: new Date().toISOString(),
    },
    { onConflict: 'curs_id,nr_sedinta' }
  )
  if (error) throw error
}

export async function stergeOverride(cursId: string, nrSedinta: number): Promise<void> {
  const { error } = await supabase
    .from('curs_lectii_override')
    .delete()
    .eq('curs_id', cursId)
    .eq('nr_sedinta', nrSedinta)
  if (error) throw error
}
