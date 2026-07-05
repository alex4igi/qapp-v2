// Derivă articolul FGO din ce se plătește, la momentul înregistrării plății.
// Numele articolelor sunt „…dans gimnastica" indiferent de stilul cursului, deci
// nu depindem de cursuri.stil. Vezi ARTICOLE_FGO din constants.ts.
import type { VDatoriiRest, VPlatiInrolari } from '@/types/db'
import type { ArticolFgo } from './constants'

type InrolareFields = Pick<
  VPlatiInrolari,
  'tip_plata' | 'suma_baza' | 'total_de_plata' | 'cod_voucher'
>

// promo = orice reducere aplicată (preț promo, voucher, politică family/cross-sell).
function areReducere(r: InrolareFields): boolean {
  const baza = Number(r.suma_baza ?? 0)
  const total = Number(r.total_de_plata ?? 0)
  return (baza > 0 && total < baza - 0.004) || r.cod_voucher != null
}

export function articolInrolare(r: InrolareFields): ArticolFgo {
  const promo = areReducere(r)
  if (r.tip_plata === 'Per sedinta') {
    return promo ? 'Sedinta dans gimnastica promo' : 'Sedinta dans gimnastica'
  }
  // „Per an" există în listă doar cu varianta promo.
  if (r.tip_plata === 'Per an') return 'Abonament anual dans gimnastica promo'
  // „Per luna" — recurent, facultativ lunar și trupă mapează toate la abonament.
  return promo ? 'Abonament dans gimnastica promo' : 'Abonament dans gimnastica'
}

// Datoriile one-off: doar cazurile clare se auto-completează; restul (Taxa
// generic, confirmare loc, concurs, închiriere, audiție) rămân null → se încearcă
// ghicirea din textul bancar, altfel recepția alege manual din dropdown.
export function articolDatorie(
  r: Pick<VDatoriiRest, 'categorie' | 'descriere'>,
): ArticolFgo | null {
  switch (r.categorie) {
    case 'Workshop':
      return 'Taxa workshop'
    case 'Merch':
      return 'Articole vestimentar'
    case 'Bilet':
      return 'Bilet spectacol'
    case 'Taxa':
      return /re[iî]nscriere/i.test(r.descriere ?? '') ? 'Taxa Reinscriere' : null
    default:
      return null
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// Ghicire din textul extrasului bancar (payer-written) — folosită DOAR ca
// pre-completare editabilă pentru liniile fără articol ferm (concurs, confirmare
// loc, ședință privată, moment coregrafic etc.). Text nesigur ⇒ mereu editabil.
export function articolDinTextBanca(text: string | null | undefined): ArticolFgo | null {
  const t = norm(text ?? '')
  if (!t) return null
  const promo = /\bpromo\b|reducere/.test(t)
  // Specific → general; primul care se potrivește câștigă.
  if (/re[i]?nscrier/.test(t)) return 'Taxa Reinscriere'
  if (/concurs/.test(t)) return 'Taxa concurs'
  if (/workshop|atelier/.test(t)) return 'Taxa workshop'
  if (/confirmare|rezervare loc|rezerva loc/.test(t)) return 'Taxa confirmare loc'
  if (/privat/.test(t)) return 'Sedinta privata'
  if (/coregrafic|\bmoment\b/.test(t)) return 'Moment coregrafic'
  if (/vestimentar|tricou|hanorac|echipament|merch/.test(t)) return 'Articole vestimentar'
  if (/bilet|spectacol/.test(t)) return 'Bilet spectacol'
  if (/anual/.test(t)) return 'Abonament anual dans gimnastica promo'
  if (/abonament|trupa/.test(t)) {
    return promo ? 'Abonament dans gimnastica promo' : 'Abonament dans gimnastica'
  }
  if (/sedint|ședint|open/.test(t)) {
    return promo ? 'Sedinta dans gimnastica promo' : 'Sedinta dans gimnastica'
  }
  return null
}
