export type Luna = { y: number; m: number }

const cheie = (l: Luna) => l.y * 12 + l.m

function minusLuni(l: Luna, n: number): Luna {
  let y = l.y
  let m = l.m - n
  while (m <= 0) {
    m += 12
    y -= 1
  }
  return { y, m }
}

// Coada sezonului precedent rămâne vizibilă atâta timp: salariul unei luni se
// confirmă în primele zile ale lunii următoare, iar sezonul se poate schimba
// între timp.
const LUNI_DE_GRATIE = 2

// Prima lună din lista de salarii. Regula de bază e „de la începutul sezonului
// activ", dar sezonul activ poate începe DUPĂ luna curentă: pe 29 aug. 2026
// activarea Sezonului 2026-2027 (începe 12 sept.) a împins fereastra la
// septembrie → august, adică o listă goală, și salariile lunilor lucrate din
// vară au dispărut din UI (RPC-ul le calcula în continuare corect).
// Fereastra nu poate începe mai târziu decât `LUNI_DE_GRATIE` luni în urmă,
// indiferent unde cade sezonul.
export function primaLunaSalarii(
  sezonIncepere: string | null | undefined,
  lunaCurenta: Luna,
): Luna {
  const plafon = minusLuni(lunaCurenta, LUNI_DE_GRATIE)
  if (!sezonIncepere) return minusLuni(lunaCurenta, 11)
  const d = new Date(sezonIncepere)
  const start: Luna = { y: d.getFullYear(), m: d.getMonth() + 1 }
  return cheie(start) <= cheie(plafon) ? start : plafon
}

// start = mai vechi, end = mai recent. Întoarce listă desc (recent → vechi).
export function monthRange(start: Luna, end: Luna): Luna[] {
  const out: Luna[] = []
  let y = end.y
  let m = end.m
  while (y > start.y || (y === start.y && m >= start.m)) {
    out.push({ y, m })
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

// Lunile deja confirmate nu dispar niciodată din listă, oricât de departe ar
// cădea de fereastra sezonului — altfel un salariu plătit devine invizibil la
// prima schimbare de sezon.
export function cuLuniConfirmate(
  fereastra: Luna[],
  confirmate: { anul: number; luna: number }[],
): Luna[] {
  const out = [...fereastra]
  for (const s of confirmate) {
    if (!out.some((l) => l.y === s.anul && l.m === s.luna)) {
      out.push({ y: s.anul, m: s.luna })
    }
  }
  return out.sort((a, b) => cheie(b) - cheie(a))
}
