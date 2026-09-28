// Fișierele clienților anonimizați (GDPR). `anonimizeaza_client` le notează în
// `gdpr_fisiere_de_sters`, fiindcă din SQL nu se poate șterge din Storage. Aici se
// șterg cele din Storage; link-urile Drive (bucket null) rămân pentru mână.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export async function stergeFisiereGdpr(
  supabase: SupabaseClient,
  errors: string[],
): Promise<number> {
  const { data, error } = await supabase
    .from('gdpr_fisiere_de_sters')
    .select('id, bucket, cale')
    .is('sters_la', null)
    .not('bucket', 'is', null)
    .limit(200)
  if (error) {
    errors.push(`gdpr fisiere: ${error.message}`)
    return 0
  }
  let sterse = 0
  for (const f of data ?? []) {
    const { error: e } = await supabase.storage.from(f.bucket as string).remove([f.cale as string])
    if (e) {
      errors.push(`gdpr fisier ${f.id}: ${e.message}`)
      continue
    }
    await supabase
      .from('gdpr_fisiere_de_sters')
      .update({ sters_la: new Date().toISOString() })
      .eq('id', f.id)
    sterse++
  }
  return sterse
}
