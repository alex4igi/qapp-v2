// Surse pentru drop-down-urile din PlataNouaModal: bilete (din evenimente +
// concursuri) și articole de inventar (workflow merch).
import { supabase } from '@/lib/supabase'

export type BiletSursaOption = {
  value: string
  label: string
  pret?: number | null
  isWorkshop?: boolean
  nume?: string
}

export async function listBiletSurse(): Promise<BiletSursaOption[]> {
  const [evRes, coRes] = await Promise.all([
    supabase
      .from('evenimente')
      .select('id, nume_eveniment, pret_bilet, data, tip')
      .order('data', { ascending: false, nullsFirst: false }),
    supabase
      .from('concursuri')
      .select('id, numele_concursului, data_evenimentului')
      .order('data_evenimentului', { ascending: false, nullsFirst: false }),
  ])
  if (evRes.error) throw evRes.error
  if (coRes.error) throw coRes.error
  const out: BiletSursaOption[] = []
  for (const e of evRes.data ?? []) {
    const isWorkshop = e.tip === 'Workshop'
    const prefix = isWorkshop ? 'Workshop' : 'Eveniment'
    out.push({
      value: e.id,
      label: `${prefix} · ${e.nume_eveniment}${e.data ? ' · ' + e.data : ''}`,
      pret: e.pret_bilet,
      isWorkshop,
      nume: e.nume_eveniment,
    })
  }
  for (const c of coRes.data ?? []) {
    out.push({
      value: c.id,
      label: `Concurs · ${c.numele_concursului}${c.data_evenimentului ? ' · ' + c.data_evenimentului : ''}`,
    })
  }
  return out
}

export type InventarOptionRow = {
  value: string
  label: string
  pret: string | null
  stoc: number | null
}

export async function listInventarOptiuni(): Promise<InventarOptionRow[]> {
  const { data, error } = await supabase
    .from('inventar')
    .select('id, articol, pret, stoc')
    .order('articol', { ascending: true })
  if (error) throw error
  return (data ?? []).map((a) => ({
    value: a.id,
    label: a.pret ? `${a.articol} — ${a.pret}` : a.articol,
    pret: a.pret,
    stoc: a.stoc,
  }))
}
