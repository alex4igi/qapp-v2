// Filtrul de sală al dashboard-ului aplicat pe încasări și programări, care nu au
// coloană `sala`: sala se deduce din rândul legat, apoi se compară cu pill-urile.

export type SalaFilter = {
  salaIds: string[]
  /** Locațiile sălilor bifate — pentru rândurile care nu se pot lega de o sală. */
  locatieIds: string[]
}

type SalaRef = { sala: string | null } | null

// Plata ține de sala cursului din înrolare (ca view-ul incasari_sala_luna) sau de
// sala închirierii.
export const INCASARI_SALA_SELECT =
  'locatie, inrolare:enrollments!fk_incasari_inregistrare(curs:cursuri(sala)), inchiriere_rel:inchirieri(sala)'

export type IncasareSalaRefs = {
  locatie: string | null
  inrolare: { curs: SalaRef } | null
  inchiriere_rel: SalaRef
}

// Programarea ține de cursul programat sau de evenimentul demo (sala lui, altfel
// sala grupei-țintă).
export const PROGRAMARI_SALA_SELECT =
  'locatie, curs_rel:cursuri!fk_progr_curs(sala), eveniment_rel:evenimente(sala, curs_tinta_rel:cursuri!evenimente_curs_tinta_fkey(sala))'

export type ProgramareSalaRefs = {
  locatie: string | null
  curs_rel: SalaRef
  eveniment_rel: { sala: string | null; curs_tinta_rel: SalaRef } | null
}

// Taxele, biletele sau merch-ul n-au sală: urmează locația, adică apar cât timp
// măcar o sală a locației lor e bifată.
function inFilter(f: SalaFilter | null, sala: string | null, locatie: string | null) {
  if (!f) return true
  if (sala) return f.salaIds.includes(sala)
  return locatie !== null && f.locatieIds.includes(locatie)
}

export function incasareInSali(f: SalaFilter | null, r: IncasareSalaRefs) {
  const sala = r.inrolare?.curs?.sala ?? r.inchiriere_rel?.sala ?? null
  return inFilter(f, sala, r.locatie)
}

export function programareInSali(f: SalaFilter | null, r: ProgramareSalaRefs) {
  const sala =
    r.curs_rel?.sala ??
    r.eveniment_rel?.sala ??
    r.eveniment_rel?.curs_tinta_rel?.sala ??
    null
  return inFilter(f, sala, r.locatie)
}
