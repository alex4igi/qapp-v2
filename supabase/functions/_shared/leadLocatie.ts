// Locația efectivă a unui lead pentru SMS = numele locației ultimei programări
// (sursa de adevăr, derivată din curs/eveniment), cu fallback pe câmpul liber
// leads.locatia (setat manual la recepție, adesea gol). Întoarce și ora ședinței
// din aceeași programare, ca să nu mai facem un query separat la callsite.
//
// Cele 3 locații (Galeriile Stefan cel Mare / Nicolina / Quasar 4 Kids) au adrese
// distincte — vezi maparea din _shared/sms.ts. Citirea greșită din lead.locatia
// (null → fallback Ștefan) a trimis lead-uri q4kids la adresa greșită.

// deno-lint-ignore no-explicit-any
export async function getProgramareSms(
  supabase: any,
  leadId: string,
  fallbackLocatie: string | null,
): Promise<{ ora: string | null; locatie: string | null }> {
  const { data: programare } = await supabase
    .from('programari_leads')
    .select('ora, locatie')
    .eq('lead', leadId)
    .order('data_programarii', { ascending: false })
    .order('created', { ascending: false })
    .limit(1)
    .maybeSingle()

  let locatie = fallbackLocatie
  if (programare?.locatie) {
    const { data: loc } = await supabase
      .from('locatii')
      .select('nume')
      .eq('id', programare.locatie)
      .maybeSingle()
    locatie = loc?.nume ?? fallbackLocatie
  }

  return { ora: programare?.ora ?? null, locatie }
}
