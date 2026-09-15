import { supabase } from '@/lib/supabase'
import { invokeEdge } from '@/lib/invokeEdge'
import type { Tables } from '@/types/db'
import type { Json } from '@/types/database'
import type { TemplateField } from './types'

export type ContractTemplate = Tables<'contract_templates'>
export type Contract = Tables<'contracte'>

export type ContractRow = Contract & {
  contract_templates: Pick<ContractTemplate, 'nume' | 'tip'> | null
  familii: { nume_familie: string; telefon: string | null } | null
  clienti: { nume: string; prenume: string | null } | null
}

export async function listTemplates(): Promise<ContractTemplate[]> {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('activ', true)
    .order('created', { ascending: false })
  if (error) throw error
  return data ?? []
}

export type ContracteListParams = {
  status?: string
  tip?: string
}

export async function listContracte(params: ContracteListParams): Promise<ContractRow[]> {
  let query = supabase
    .from('contracte')
    .select(
      '*, contract_templates(nume, tip), familii(nume_familie, telefon), clienti(nume, prenume)',
    )
    .order('created', { ascending: false })
    .limit(500)
  if (params.status) query = query.eq('status', params.status)
  if (params.tip) query = query.eq('contract_templates.tip', params.tip)
  const { data, error } = await query
  if (error) throw error
  let rows = (data ?? []) as ContractRow[]
  // filtrul pe tip via embedded resource nu elimină rândul, doar null-ează join-ul
  if (params.tip) rows = rows.filter((r) => r.contract_templates?.tip === params.tip)
  return rows
}

export type SendTarget = {
  familieId: string
  clientId?: string | null
  campanieId?: string | null
  cursTintaId?: string | null
}

// `ok` = contractul s-a creat; `notificat` = linkul a plecat efectiv pe `canal`.
// Sunt lucruri diferite: un contract creat cu notificarea eșuată e o familie care
// nu știe că are ceva de semnat.
export type SendResult = {
  familieId: string
  ok: boolean
  error?: string
  contractId?: string
  // la refuzul pe dublură: statusul contractului care există deja
  statusExistent?: string
  canal?: 'sms' | 'email' | 'niciunul'
  notificat?: boolean
  amanat?: boolean
  notificareEroare?: string
}

export async function sendContracte(params: {
  templateId: string
  targets: SendTarget[]
}): Promise<SendResult[]> {
  const data = await invokeEdge<{ results: SendResult[] }>('contract-send', params)
  return data.results
}

// ============================================================
// Bulk pe campanie de reînscriere
// ============================================================

export type CampanieOption = { id: string; nume: string }

export async function listCampaniiDeschise(): Promise<CampanieOption[]> {
  const { data, error } = await supabase
    .from('campanii_reinscriere')
    .select('id, nume')
    .is('inchisa_la', null)
    .order('created', { ascending: false })
  if (error) throw error
  return data ?? []
}

export type CampanieTarget = {
  client_id: string
  client_nume: string
  familie_id: string | null
  familie_nume: string | null
  telefon: string | null
  curs_tinta_id: string
  curs_nume: string
  act_status: string
  are_contract: boolean
  email: string | null
}

export async function listTargetsCampanie(campanieId: string): Promise<CampanieTarget[]> {
  const { data, error } = await supabase.rpc('list_targets_campanie', {
    p_campanie_id: campanieId,
  })
  if (error) throw error
  return (data ?? []) as CampanieTarget[]
}

// ============================================================
// Bulk pe selecție de clienți (fără campanie)
// ============================================================

export type ContractTarget = {
  client_id: string
  client_nume: string
  familie_id: string | null
  familie_nume: string | null
  telefon: string | null
  email: string | null
  locatie_nume: string | null
  cursuri: string[]
}

// Un rând per client cu înrolare în curs sau viitoare; filtrele sunt opționale.
export async function listTargetsContracte(params: {
  sezonId?: string | null
  locatieId?: string | null
  cursId?: string | null
}): Promise<ContractTarget[]> {
  const { data, error } = await supabase.rpc('list_targets_contracte', {
    p_sezon: params.sezonId || undefined,
    p_locatie: params.locatieId || undefined,
    p_curs: params.cursId || undefined,
  })
  if (error) throw error
  return (data ?? []) as ContractTarget[]
}

export type ContractActiv = { familie_id: string; client_id: string | null; status: string }

// Contractele vii pe un șablon — oglinda gardului de dublură din contract-send,
// ca lista să arate dinainte cine ar fi refuzat la trimitere.
export async function listContracteActivePeTemplate(templateId: string): Promise<ContractActiv[]> {
  const { data, error } = await supabase
    .from('contracte')
    .select('familie_id, client_id, status')
    .eq('template_id', templateId)
    .in('status', ['trimis', 'deschis', 'semnat', 'finalizat'])
  if (error) throw error
  return data ?? []
}

export type RetrimitereResult = {
  canal: 'sms' | 'email' | 'niciunul'
  notificat: boolean
  amanat: boolean
  notificareEroare?: string
  expiraLa: string
}

// Același link de semnare, valabilitate repornită de azi. Merge și pe contractele
// expirate — cu gardul de dublură în funcție.
export async function retrimiteLink(contractId: string): Promise<RetrimitereResult> {
  return invokeEdge<RetrimitereResult>('contract-resend', { contractId })
}

export function mesajRetrimitere(r: RetrimitereResult): { ok: boolean; text: string } {
  const canal = r.canal === 'email' ? 'email' : 'SMS'
  const pana = new Date(r.expiraLa).toLocaleDateString('ro-RO')
  if (r.amanat) {
    return { ok: true, text: `Link retrimis, valabil până pe ${pana}. SMS-ul a prins zona interzisă — pleacă automat dimineață.` }
  }
  if (r.notificat) return { ok: true, text: `Linkul a fost retrimis prin ${canal}, valabil până pe ${pana}.` }
  return {
    ok: false,
    text: `Valabilitatea e prelungită până pe ${pana}, dar linkul NU a plecat (${canal}): ${
      r.notificareEroare ?? 'eroare necunoscută'
    }.`,
  }
}

// Prin RPC (owner/admin/manager): scrierea directă pe `contracte` e doar is_admin(),
// iar pentru manager ar fi trecut fără eroare fără să anuleze nimic.
export async function anuleazaContract(id: string): Promise<void> {
  const { error } = await supabase.rpc('anuleaza_contract', { p_contract_id: id })
  if (error) throw error
}

export async function getContractEvents(
  contractId: string,
): Promise<Array<{ id: number; tip: string; meta: Record<string, unknown> | null; created: string }>> {
  const { data, error } = await supabase
    .from('contract_events')
    .select('id, tip, meta, created')
    .eq('contract_id', contractId)
    .order('created')
  if (error) throw error
  return (data ?? []) as Array<{
    id: number
    tip: string
    meta: Record<string, unknown> | null
    created: string
  }>
}

export async function getPdfSignedUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from('contracte').createSignedUrl(storagePath, 300)
  return data?.signedUrl ?? null
}

// ============================================================
// Editor vizual de template (Faza 3)
// ============================================================

export type TemplateWithSezon = ContractTemplate & {
  sezoane: { numele_sezonului: string } | null
}

// Spre deosebire de listTemplates() (folosit de selectorul de trimitere,
// doar activ=true), aici vrem TOATE — inclusiv drafturi/versiuni superseded.
export async function listAllTemplatesForEditor(): Promise<TemplateWithSezon[]> {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*, sezoane(numele_sezonului)')
    .order('tip', { ascending: true })
    .order('sezon', { ascending: true })
    .order('versiune', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as TemplateWithSezon[]
}

// Tipurile existente în DB — nu mai e un enum fix, userul poate adăuga oricâte
// vrea; le oferim ca sugestii (datalist) în loc de dropdown închis.
export async function listDistinctTipuri(): Promise<string[]> {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('tip')
    .order('tip', { ascending: true })
  if (error) throw error
  return Array.from(new Set((data ?? []).map((r) => r.tip)))
}

export async function getTemplate(id: string): Promise<TemplateWithSezon | null> {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*, sezoane(numele_sezonului)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as unknown as TemplateWithSezon | null
}

// Prima versiune liberă pentru o combinație tip+sezon. `sezonId` null trebuie
// interogat cu `.is()`, nu `.eq()` — Postgres tratează NULL distinct în unique().
export async function suggestNextVersiune(tip: string, sezonId: string | null): Promise<number> {
  let q = supabase.from('contract_templates').select('versiune').eq('tip', tip)
  q = sezonId ? q.eq('sezon', sezonId) : q.is('sezon', null)
  const { data, error } = await q.order('versiune', { ascending: false }).limit(1)
  if (error) throw error
  return (data?.[0]?.versiune ?? 0) + 1
}

export type CreateTemplateDto = {
  tip: string
  sezon: string | null
  nume: string
  versiune: number
  pdf_storage_path: string
  fields: TemplateField[]
  valabilitate_zile: number
}

export async function createTemplate(dto: CreateTemplateDto): Promise<string> {
  const { data, error } = await supabase
    .from('contract_templates')
    .insert({ ...dto, fields: dto.fields as unknown as Json, activ: false })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateTemplateFields(
  id: string,
  patch: { fields: TemplateField[]; pdf_storage_path?: string },
): Promise<void> {
  const { error } = await supabase
    .from('contract_templates')
    .update({ ...patch, fields: patch.fields as unknown as Json })
    .eq('id', id)
  if (error) throw error
}

export async function updateTemplateMeta(
  id: string,
  patch: { nume?: string; valabilitate_zile?: number },
): Promise<void> {
  const { error } = await supabase.from('contract_templates').update(patch).eq('id', id)
  if (error) throw error
}

export async function setTemplateActiv(id: string, activ: boolean): Promise<void> {
  const { error } = await supabase.from('contract_templates').update({ activ }).eq('id', id)
  if (error) throw error
}

// Clonează un template blocat într-un draft nou (versiune+1, inactiv, editabil)
// și dezactivează sursa — altfel ar apărea dublu în selectorul de trimitere.
export async function cloneTemplateToNewVersion(source: TemplateWithSezon): Promise<string> {
  const nextVersiune = await suggestNextVersiune(source.tip, source.sezon)
  const slug = source.sezoane?.numele_sezonului ?? null
  const tip = source.tip
  const toPath = `${tip}/${slug ? slugifyClientSide(slug) : 'fara-sezon'}-v${nextVersiune}.pdf`
  await invokeTemplateStorage({ action: 'copy', fromPath: source.pdf_storage_path, toPath })
  const { data, error } = await supabase
    .from('contract_templates')
    .insert({
      tip,
      sezon: source.sezon,
      nume: source.nume,
      versiune: nextVersiune,
      pdf_storage_path: toPath,
      fields: source.fields,
      activ: false,
      valabilitate_zile: source.valabilitate_zile,
    })
    .select('id')
    .single()
  if (error) throw error
  await setTemplateActiv(source.id, false)
  return data.id
}

// Slug identic cu cel din edge function (pentru a calcula path-ul de destinație
// al clonării fără un round-trip suplimentar doar pentru asta).
function slugifyClientSide(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function invokeTemplateStorage<T = unknown>(body: Record<string, unknown>): Promise<T> {
  return invokeEdge<T>('contract-template-storage', body)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function uploadTemplatePdf(params: {
  tip: string
  sezonNume: string | null
  versiune: number
  file: File
}): Promise<string> {
  const fileBase64 = await fileToBase64(params.file)
  const { path } = await invokeTemplateStorage<{ path: string }>({
    action: 'upload',
    tip: params.tip,
    sezonNume: params.sezonNume,
    versiune: params.versiune,
    fileBase64,
  })
  return path
}

export async function getTemplateFileSignedUrl(path: string): Promise<string> {
  const { url } = await invokeTemplateStorage<{ url: string }>({ action: 'read-url', path })
  return url
}
