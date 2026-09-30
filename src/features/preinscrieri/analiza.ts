import type { Preinscriere } from './api'

// Calculele din tabul „Decizie grupe": din preînscrieri → ce grupe (vârstă × stil × zi ×
// interval) au destui oameni ca să cerem sala. Totul client-side: sunt sute de rânduri.

export const ZILE = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'] as const
export const ZILE_LABEL: Record<(typeof ZILE)[number], string> = {
  Lu: 'Luni', Ma: 'Marți', Mi: 'Miercuri', Jo: 'Joi', Vi: 'Vineri', Sa: 'Sâmbătă', Du: 'Duminică',
}
// Intervalele diferă: după școală în timpul săptămânii, dimineața în weekend.
// Aceeași listă ca CHECK-ul din DB și ca SLOTURI din _shared/preinscriere.ts.
export const GRILE = [
  { titlu: 'Luni–Vineri', zile: ['Lu', 'Ma', 'Mi', 'Jo', 'Vi'], intervale: ['13-15', '15-17', '17-19'] },
  { titlu: 'Weekend', zile: ['Sa', 'Du'], intervale: ['10-12', '12-14'] },
] as const
export const SLOTURI = GRILE.flatMap((g) => g.zile.flatMap((z) => g.intervale.map((i) => `${z} ${i}`)))

export const STILURI = ['Street Dance', 'Gimnastica', 'K-Pop', 'Zumba'] as const
export const STIL_LABEL: Record<string, string> = {
  'Street Dance': 'Dans (Street Dance)',
  Gimnastica: 'Gimnastică',
  'K-Pop': 'K-pop',
  Zumba: 'Zumba',
}

// Grupele publice de vârstă (docs/reguli-domeniu.md §6); adulții sunt o singură grupă aici.
export const GRUPE_VARSTA = ['Tiny', 'Junior', 'Varsity', 'Teens', 'Adulți'] as const
export type GrupaVarsta = (typeof GRUPE_VARSTA)[number]
export const GRUPA_LABEL: Record<GrupaVarsta, string> = {
  Tiny: 'Tiny 4–6', Junior: 'Junior 7–10', Varsity: 'Varsity 11–14', Teens: 'Teens 15–18', Adulți: 'Adulți',
}

export function grupaVarsta(p: Pick<Preinscriere, 'varsta' | 'participant'>): GrupaVarsta {
  const v = p.varsta
  if (p.participant === 'adult' || (v != null && v >= 19)) return 'Adulți'
  if (v == null || v <= 6) return 'Tiny'
  return v <= 10 ? 'Junior' : v <= 14 ? 'Varsity' : 'Teens'
}

export const cheiePersoana = (p: Pick<Preinscriere, 'lead_id' | 'client_id' | 'id'>) =>
  p.lead_id ?? p.client_id ?? p.id

export const esteConfirmat = (p: Pick<Preinscriere, 'disponibilitate_confirmata_la'>) =>
  !!p.disponibilitate_confirmata_la

// O persoană = ultima ei cerere; cine s-a retras nu se mai numără.
export function persoaneActive(rows: Preinscriere[]): Preinscriere[] {
  const ultima = new Map<string, Preinscriere>()
  for (const r of rows) {
    const k = cheiePersoana(r)
    const prev = ultima.get(k)
    if (!prev || r.created > prev.created) ultima.set(k, r)
  }
  return [...ultima.values()].filter((r) => r.status !== 'retras')
}

export type Grupa = { varsta: GrupaVarsta; stil: string; slot: string }
export const cheieGrupa = (g: Grupa) => `${g.varsta}|${g.stil}|${g.slot}`
export const numeGrupa = (g: Grupa) =>
  `${GRUPA_LABEL[g.varsta]} · ${STIL_LABEL[g.stil] ?? g.stil} · ${ZILE_LABEL[g.slot.slice(0, 2) as (typeof ZILE)[number]]} ${g.slot.slice(3)}`

export type Ipoteze = {
  // Pragul minim de grupă din reguli e în cursanți PLĂTITORI, nu în preînscrieri.
  prag: number
  // Câți din preînscriși presupunem că ajung plătitori (ipoteză, nu dată).
  rata: number
  grupePeInterval: number
  doarConfirmati: boolean
}

export const tinta = (ip: Ipoteze) => Math.ceil(ip.prag / Math.max(ip.rata, 0.01))

export function compatibil(p: Preinscriere, g: Grupa, doarConfirmati: boolean): boolean {
  return (
    grupaVarsta(p) === g.varsta &&
    p.stiluri.includes(g.stil) &&
    p.disponibilitate.includes(g.slot) &&
    (!doarConfirmati || esteConfirmat(p))
  )
}

export type RezultatGrupa = {
  grupa: Grupa
  membri: Preinscriere[]
  confirmati: number
  suprapunere: boolean
}

export type RezultatScenariu = {
  grupe: RezultatGrupa[]
  neacoperiti: Preinscriere[]
  douaActivitati: number
  oreSalaPeSaptamana: number
}

// Grupele se umplu în ordinea în care le-a pus omul. Un participant intră cel mult
// într-o grupă pe stil și niciodată în două grupe din același interval; poate fi în
// două grupe de stiluri diferite (vrea două activități) — acela se raportează separat.
export function evalueazaScenariu(
  persoane: Preinscriere[],
  grupe: Grupa[],
  ip: Ipoteze,
): RezultatScenariu {
  const peStil = new Set<string>()
  const peSlot = new Set<string>()
  const alocari = new Map<string, number>()
  const grupePeSlot = new Map<string, number>()
  for (const g of grupe) grupePeSlot.set(g.slot, (grupePeSlot.get(g.slot) ?? 0) + 1)

  const rezultat = grupe.map((g) => {
    const membri = persoane.filter((p) => {
      const k = cheiePersoana(p)
      return compatibil(p, g, ip.doarConfirmati) && !peStil.has(`${k}|${g.stil}`) && !peSlot.has(`${k}|${g.slot}`)
    })
    for (const p of membri) {
      const k = cheiePersoana(p)
      peStil.add(`${k}|${g.stil}`)
      peSlot.add(`${k}|${g.slot}`)
      alocari.set(k, (alocari.get(k) ?? 0) + 1)
    }
    return {
      grupa: g,
      membri,
      confirmati: membri.filter(esteConfirmat).length,
      suprapunere: (grupePeSlot.get(g.slot) ?? 0) > ip.grupePeInterval,
    }
  })

  const baza = ip.doarConfirmati ? persoane.filter(esteConfirmat) : persoane
  return {
    grupe: rezultat,
    neacoperiti: baza.filter((p) => !alocari.has(cheiePersoana(p))),
    douaActivitati: [...alocari.values()].filter((n) => n > 1).length,
    // Un interval ocupat = 2 ore de sală, indiferent câte grupe încap în el.
    oreSalaPeSaptamana: grupePeSlot.size * 2,
  }
}

// Cele mai pline grupe-candidat care nu sunt încă în scenariu, numărate DOAR pe oamenii
// rămași nealocați — alegi una, lista se recalculează.
export function candidati(
  persoane: Preinscriere[],
  grupe: Grupa[],
  ip: Ipoteze,
  limita = 12,
): { grupa: Grupa; n: number }[] {
  const { grupe: rez } = evalueazaScenariu(persoane, grupe, ip)
  const peStil = new Set<string>()
  const peSlot = new Set<string>()
  for (const r of rez) {
    for (const p of r.membri) {
      peStil.add(`${cheiePersoana(p)}|${r.grupa.stil}`)
      peSlot.add(`${cheiePersoana(p)}|${r.grupa.slot}`)
    }
  }
  const existente = new Set(grupe.map(cheieGrupa))
  const out: { grupa: Grupa; n: number }[] = []
  for (const varsta of GRUPE_VARSTA) {
    for (const stil of STILURI) {
      for (const slot of SLOTURI) {
        const g = { varsta, stil, slot }
        if (existente.has(cheieGrupa(g))) continue
        const n = persoane.filter((p) => {
          const k = cheiePersoana(p)
          return compatibil(p, g, ip.doarConfirmati) && !peStil.has(`${k}|${stil}`) && !peSlot.has(`${k}|${slot}`)
        }).length
        if (n > 0) out.push({ grupa: g, n })
      }
    }
  }
  return out.sort((a, b) => b.n - a.n).slice(0, limita)
}
