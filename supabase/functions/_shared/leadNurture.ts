// Cine NU are voie să fie trimis automat în Nurture.
//
// Nurture e pool-ul de REACTIVARE: are sens doar pentru cine nu mai vine. Un
// lead legat de un client încă Activ sau Inactiv e altceva — de obicei o
// conversie neînregistrată (omul s-a înscris, dar lead-ul a rămas în 'nou' /
// 'a_venit'). Cronurile îl vedeau doar ca pe un rând vechi și îl scoteau din
// pipeline: în ultima săptămână din august 2026 au dispărut așa trei oameni,
// doi dintre ei veniți la demo cu trei zile înainte.
//
// Flagul de prioritate rămâne — un astfel de lead TREBUIE să iasă în „De lucrat
// azi", ca cineva să-l închidă cum trebuie. Doar ieșirea automată din pipeline
// e blocată.

// deno-lint-ignore no-explicit-any
type Client = any

type LeadCuClient = { id: string; id_client?: string | null }

// Întoarce id-urile de lead care NU pot fi auto-nurturate. La eroare de citire
// întoarce toate id-urile (fail-closed): o rulare care nu poate verifica nu are
// voie să scoată pe nimeni din pipeline — cronul reia mâine.
export async function leaduriProtejate(
  supabase: Client,
  leads: LeadCuClient[],
): Promise<Set<string>> {
  const cuClient = leads.filter((l) => l.id_client)
  if (cuClient.length === 0) return new Set()

  const clientIds = [...new Set(cuClient.map((l) => l.id_client as string))]
  const activi = new Set<string>()
  for (let i = 0; i < clientIds.length; i += 200) {
    const { data, error } = await supabase
      .from('clienti')
      .select('id')
      .in('id', clientIds.slice(i, i + 200))
      .neq('status', 'EXclient')
    if (error) return new Set(cuClient.map((l) => l.id))
    for (const c of data ?? []) activi.add(c.id)
  }
  return new Set(
    cuClient.filter((l) => activi.has(l.id_client as string)).map((l) => l.id),
  )
}
