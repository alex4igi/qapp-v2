// Preînscrierile de campanie (prima: „Quasar Dance vine în Valea Lupului", 2026).
// Un formular = un contact + 1..5 participanți; fiecare participant devine un rând în
// `preinscrieri_campanie`, legat de leadul LUI sau de clientul existent. Motivul:
// programarea la DEMO e unică pe (lead, eveniment), deci doi frați pe același lead
// ar ocupa un singur loc. Regulile în docs/reguli-domeniu.md §11.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  clientHasHistory,
  insertLead,
  logIntake,
  mapLocatie,
  normalizeTelefon,
  roMobileNational,
  type IntakeCanal,
} from './intake.ts'

// Ce oferim acum la Valea Lupului, doar copiilor (Zumba scoasă, Alex 30.09.2026). CHECK-ul din DB
// o mai acceptă, ca s-o putem readuce fără migrație.
export const STILURI = ['Street Dance', 'Gimnastica', 'K-Pop'] as const
// În timpul săptămânii după școală, în weekend dimineața (Alex, 30.09.2026).
const SLOTURI = new Set([
  ...['Lu', 'Ma', 'Mi', 'Jo', 'Vi'].flatMap((z) => ['13-15', '15-17', '17-19'].map((i) => `${z} ${i}`)),
  ...['Sa', 'Du'].flatMap((z) => ['10-12', '12-14'].map((i) => `${z} ${i}`)),
])
// Locațiile care primesc preînscrieri. Alta = 400, nu lead fără locație.
const LOCATII_CU_PREINSCRIERE = new Set(['Valea Lupului'])
const MAX_PARTICIPANTI = 5
const MAX_TEXT = 200
const MAX_OBS = 1000

export type Participant = {
  participant: 'copil' | 'adult'
  nume: string
  varsta: number | null
  // Elev la școala parteneră (Școala „Profesor Mihai Dumitriu"); null = n-a răspuns.
  elev_scoala_partenera: boolean | null
  stiluri: string[]
  disponibilitate: string[]
}

export type Preinscriere = {
  trimitere_id: string
  locatie: string
  participanti: Participant[]
  acord_marketing: boolean
  acord_text_versiune: string | null
  observatii: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (v: unknown, max: number): string | null => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t ? t.slice(0, max) : null
}

export function parsePreinscriere(
  raw: unknown,
): { ok: true; value: Preinscriere } | { ok: false; motiv: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, motiv: 'preînscriere invalidă' }
  const r = raw as Record<string, unknown>
  const trimitereId = typeof r.trimitere_id === 'string' ? r.trimitere_id.trim() : ''
  if (!UUID_RE.test(trimitereId)) return { ok: false, motiv: 'trimitere_id invalid' }
  const locatie = mapLocatie(r.locatie)
  if (!locatie || !LOCATII_CU_PREINSCRIERE.has(locatie)) {
    return { ok: false, motiv: 'locație fără preînscriere' }
  }
  if (!Array.isArray(r.participanti) || r.participanti.length === 0) {
    return { ok: false, motiv: 'niciun participant' }
  }
  if (r.participanti.length > MAX_PARTICIPANTI) {
    return { ok: false, motiv: 'prea mulți participanți' }
  }

  const participanti: Participant[] = []
  for (const p of r.participanti as Record<string, unknown>[]) {
    const tip = p?.participant === 'adult' ? 'adult' : p?.participant === 'copil' ? 'copil' : null
    const nume = text(p?.nume, MAX_TEXT)
    if (!tip || !nume || nume.length < 2) return { ok: false, motiv: 'participant fără nume' }
    const varsta = Number.isInteger(p?.varsta) ? (p.varsta as number) : null
    if (tip === 'copil' && (varsta == null || varsta < 2 || varsta > 18)) {
      return { ok: false, motiv: 'vârsta copilului lipsește' }
    }
    if (varsta != null && (varsta < 2 || varsta > 99)) return { ok: false, motiv: 'vârstă invalidă' }
    const stiluri = Array.isArray(p?.stiluri)
      ? [...new Set((p.stiluri as unknown[]).filter((s): s is string =>
          typeof s === 'string' && (STILURI as readonly string[]).includes(s)))]
      : []
    if (!stiluri.length) return { ok: false, motiv: 'nicio activitate aleasă' }
    const disponibilitate = Array.isArray(p?.disponibilitate)
      ? [...new Set((p.disponibilitate as unknown[]).filter((s): s is string =>
          typeof s === 'string' && SLOTURI.has(s)))]
      : []
    const elevRaw = p?.elev_scoala_partenera ?? p?.elev_scoala_verde
    const elev = typeof elevRaw === 'boolean' ? elevRaw : null
    participanti.push({ participant: tip, nume, varsta, elev_scoala_partenera: elev, stiluri, disponibilitate })
  }

  return {
    ok: true,
    value: {
      trimitere_id: trimitereId,
      locatie,
      participanti,
      acord_marketing: r.acord_marketing === true,
      acord_text_versiune: text(r.acord_text_versiune, 40),
      observatii: text(r.observatii, MAX_OBS),
    },
  }
}

// Cuvintele unui nume, fără diacritice — „Ana-Maria Popescu" → [ana, maria, popescu].
function cuvinte(v: string | null | undefined): string[] {
  return (v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2)
}

// Același om? Cu prenume separat (clienți): prenumele apare în numele din formular —
// numele de familie nu contează, frații îl au comun. Fără prenume (leaduri, unde totul
// stă în `nume`): cuvintele unuia le conțin pe ale celuilalt, în orice ordine
// („Popescu Ana" = „Ana Popescu", dar ≠ „Popescu Mihai").
function acelasiOm(
  numeFormular: string,
  candidat: { nume: string | null; prenume: string | null },
): boolean {
  const formular = cuvinte(numeFormular)
  if (candidat.prenume?.trim()) {
    const prim = cuvinte(candidat.prenume)[0]
    return !!prim && formular.includes(prim)
  }
  const al = cuvinte(candidat.nume)
  if (!formular.length || !al.length) return false
  return al.every((w) => formular.includes(w)) || formular.every((w) => al.includes(w))
}

function grupaDinVarsta(v: number | null): string | null {
  if (v == null) return null
  return v <= 6 ? 'Tiny' : v <= 10 ? 'Junior' : v <= 14 ? 'Varsity' : v <= 18 ? 'Teens' : v <= 24 ? 'Students' : 'Adults'
}

type LeadExistent = { id: string; nume: string; prenume: string | null }
type MembruFamilie = { id: string; nume: string; prenume: string | null }

// Clientul „real" de pe telefon + restul familiei lui (frații care sunt deja clienți).
async function familiaDupaTelefon(
  supabase: SupabaseClient,
  telefon: string,
): Promise<{ areClient: boolean; membri: MembruFamilie[] }> {
  const nat = roMobileNational(telefon)
  if (!nat) return { areClient: false, membri: [] }
  const { data: potriviri } = await supabase
    .from('clienti')
    .select('id, familia')
    .or(`telefon.eq.0${nat},telefon.eq.+40${nat},telefon.eq.0040${nat}`)
    .is('anonimizat_la', null)
    .limit(5)
  const reali: { id: string; familia: string | null }[] = []
  for (const c of potriviri ?? []) {
    if (await clientHasHistory(supabase, c.id)) reali.push(c)
  }
  if (!reali.length) return { areClient: false, membri: [] }
  const familii = [...new Set(reali.map((c) => c.familia).filter((f): f is string => !!f))]
  const { data: membri } = familii.length
    ? await supabase.from('clienti').select('id, nume, prenume').in('familia', familii).is('anonimizat_la', null)
    : await supabase.from('clienti').select('id, nume, prenume').in('id', reali.map((c) => c.id))
  return { areClient: true, membri: (membri ?? []) as MembruFamilie[] }
}

export type StareCampanie = 'nepornita' | 'activa' | 'inchisa'

// Starea campaniilor de preînscriere, pe care o pornește/închide Alex din /preinscrieri.
export async function stariCampaniiPreinscriere(
  supabase: SupabaseClient,
): Promise<{ nume: string; stare: StareCampanie }[]> {
  const { data, error } = await supabase
    .from('campanii_preinscriere')
    .select('nume, pornita_la, inchisa_la')
  if (error) {
    console.error('[preinscriere] starea campaniilor:', error.message)
    return []
  }
  return (data ?? []).map((c) => ({
    nume: c.nume,
    stare: !c.pornita_la ? 'nepornita' : c.inchisa_la ? 'inchisa' : 'activa',
  }))
}

export async function salveazaPreinscriere(
  supabase: SupabaseClient,
  p: {
    contact: { nume: string; telefon: string; email: string | null }
    pre: Preinscriere
    campanie: string
    sursaId: string | null
    utm: { campaign: string | null; source: string | null; medium: string | null; content: string | null }
    canal: IntakeCanal
    detalii?: Record<string, unknown>
  },
): Promise<{ participanti: number; leaduriNoi: number; duplicat: boolean }> {
  const { contact, pre } = p

  // Retry al aceluiași formular: totul e deja salvat.
  const { count: dejaSalvate } = await supabase
    .from('preinscrieri_campanie')
    .select('id', { count: 'exact', head: true })
    .eq('trimitere_id', pre.trimitere_id)
  if ((dejaSalvate ?? 0) > 0) return { participanti: dejaSalvate ?? 0, leaduriNoi: 0, duplicat: true }

  const { data: locatie, error: errLoc } = await supabase
    .from('locatii')
    .select('id')
    .eq('nume', pre.locatie)
    .maybeSingle()
  if (errLoc || !locatie) throw new Error(`locația ${pre.locatie} lipsește din nomenclator`)

  const telefon = normalizeTelefon(contact.telefon)
  const { data: leaduriTelefon } = await supabase
    .from('leads')
    .select('id, nume, prenume')
    .eq('telefon', telefon)
  const leaduri = (leaduriTelefon ?? []) as LeadExistent[]
  const familia = await familiaDupaTelefon(supabase, telefon)

  const folosite = new Set<string>()
  let leaduriNoi = 0
  const randuri: Record<string, unknown>[] = []

  for (const [index, part] of pre.participanti.entries()) {
    let leadId: string | null = null
    let clientId: string | null = null

    const membru = familia.membri.find((m) => !folosite.has(m.id) && acelasiOm(part.nume, m))
    if (membru) {
      clientId = membru.id
    } else {
      // Un lead vechi pe numele părintelui (formularul de pe homepage) NU se refolosește
      // pentru copil: rosterul DEMO ar arăta numele părintelui și un al doilea copil
      // n-ar mai avea loc. Se refolosește doar leadul cu numele participantului
      // (inclusiv cel creat de o încercare anterioară a aceluiași formular).
      const lead = leaduri.find((l) => !folosite.has(l.id) && acelasiOm(part.nume, l))
      if (lead) {
        leadId = lead.id
        await logIntake(supabase, {
          canal: p.canal,
          rezultat: 'duplicat_telefon',
          leadId: lead.id,
          telefon,
          detalii: { ...(p.detalii ?? {}), preinscriere: pre.trimitere_id },
        })
      } else {
        const obs = [
          `Preînscriere ${pre.locatie}: ${part.stiluri.join(', ')}`
            + (part.disponibilitate.length ? ` · ${part.disponibilitate.join(', ')}` : ''),
          'Detalii și confirmare în /preinscrieri.',
        ].join('\n')
        const r = await insertLead(
          supabase,
          {
            nume: part.nume,
            nume_parinte: part.participant === 'copil' ? contact.nume : null,
            telefon,
            email: contact.email,
            // Proiecție pe câmpul cu o singură valoare; lista completă e în preînscriere.
            interes: part.stiluri[0],
            grupa_varsta: grupaDinVarsta(part.varsta),
            varsta: part.varsta,
            locatia: pre.locatie,
            observatii: obs,
            utm_source: p.utm.source,
            utm_medium: p.utm.medium,
            utm_campaign: p.utm.campaign,
            platform: p.utm.source,
          },
          p.sursaId,
          {
            canal: p.canal,
            detalii: { ...(p.detalii ?? {}), preinscriere: pre.trimitere_id },
            faraDedupTelefon: true,
            // Frate nou într-o familie de clienți: familia e client, copilul încă nu.
            potrivireClient: { id_client: null, deja_client: familia.areClient },
          },
        )
        if (!r.leadId) throw new Error(`lead neînregistrat: ${r.reason ?? 'necunoscut'}`)
        leadId = r.leadId
        leaduri.push({ id: r.leadId, nume: part.nume, prenume: null })
        leaduriNoi++
      }
    }
    folosite.add((clientId ?? leadId)!)

    randuri.push({
      campanie: p.campanie,
      locatie_id: locatie.id,
      trimitere_id: pre.trimitere_id,
      participant_index: index,
      lead_id: leadId,
      client_id: clientId,
      nume_contact: contact.nume,
      telefon,
      email: contact.email,
      participant: part.participant,
      nume_participant: part.nume,
      varsta: part.varsta,
      elev_scoala_partenera: part.elev_scoala_partenera,
      stiluri: part.stiluri,
      disponibilitate: part.disponibilitate,
      observatii: index === 0 ? pre.observatii : null,
      acord_marketing: pre.acord_marketing,
      acord_text_versiune: pre.acord_text_versiune,
      utm_campaign: p.utm.campaign,
      utm_source: p.utm.source,
      utm_medium: p.utm.medium,
      utm_content: p.utm.content,
    })
  }

  // Un singur INSERT: toți participanții intră împreună sau deloc. Un retry după un
  // eșec aici regăsește leadurile create deja (după nume), deci nu le dublează.
  const { error } = await supabase
    .from('preinscrieri_campanie')
    .upsert(randuri, { onConflict: 'trimitere_id,participant_index', ignoreDuplicates: true })
  if (error) throw new Error(`preînscriere nesalvată: ${error.message}`)

  return { participanti: randuri.length, leaduriNoi, duplicat: false }
}
