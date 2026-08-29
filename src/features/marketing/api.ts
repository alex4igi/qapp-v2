import { supabase } from '@/lib/supabase'

// Un rând = o zi × o platformă × o campanie de ads.
//
// `leadsInCrm` și `intakeEvenimente` NU sunt același număr și nici nu trebuie
// să fie: primul e ce a rămas în CRM, al doilea e ce s-a primit de la
// platformă. Diferența e explicată de `intakeDuplicat` (persoane deja în bază,
// respinse la dedup pe telefon) + `intakeRespins` (validare picată).
export type ReconciliereRow = {
  zi: string
  platforma: string
  campanieAds: string
  sursaCrm: string
  leadsInCrm: number
  contactati: number
  prezenti: number
  convertiti: number
  intakeEvenimente: number
  intakeCreat: number
  intakeDuplicat: number
  intakeRespins: number
}

export async function getReconciliere(
  from: string,
  to: string,
): Promise<ReconciliereRow[]> {
  const { data, error } = await supabase.rpc('get_marketing_reconciliere', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    zi: String(r.zi ?? ''),
    platforma: String(r.platforma ?? '—'),
    campanieAds: String(r.campanie_ads ?? '—'),
    sursaCrm: String(r.sursa_crm ?? '—'),
    leadsInCrm: Number(r.leads_in_crm ?? 0),
    contactati: Number(r.contactati ?? 0),
    prezenti: Number(r.prezenti ?? 0),
    convertiti: Number(r.convertiti ?? 0),
    intakeEvenimente: Number(r.intake_evenimente ?? 0),
    intakeCreat: Number(r.intake_creat ?? 0),
    intakeDuplicat: Number(r.intake_duplicat ?? 0),
    intakeRespins: Number(r.intake_respins ?? 0),
  }))
}

export type FunnelRow = {
  sursaNume: string
  leads: number
  contactati: number
  proba: number
  prezenti: number
  convertiti: number
}

// Refolosește `get_lead_funnel` — definiția treptelor stă într-un singur loc
// (vezi migrația 20260828220100 + statistici/api/leads.ts). Nu o duplica aici.
export async function getFunnelPeSursa(
  from: string,
  to: string,
): Promise<FunnelRow[]> {
  const { data, error } = await supabase.rpc('get_lead_funnel', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    sursaNume: String(r.sursa_nume ?? 'Necunoscută'),
    leads: Number(r.leads_total ?? 0),
    contactati: Number(r.contactati ?? 0),
    proba: Number(r.proba ?? 0),
    prezenti: Number(r.prezenti ?? 0),
    convertiti: Number(r.convertiti ?? 0),
  }))
}
