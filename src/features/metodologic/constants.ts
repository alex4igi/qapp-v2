import type { TipLectie } from './types'

// Ghidul de activități pentru săptămânile dintre module (vacanțe cu studio deschis).
// Conținut fix, identic în toate calendarele — nu-l ținem în DB.
export const GHID_ACTIVITATI: { titlu: string; idei: string }[] = [
  { titlu: 'EVALUARE', idei: 'Groups · Name the Move · Examples · Add On' },
  { titlu: 'FEEDBACK', idei: 'Feedback individual · Feedback de grup' },
  { titlu: 'FILMARE', idei: 'Make a Reel · Watch a Movie' },
  { titlu: 'FUN ZONE', idei: 'Strade · Stalking · Follow the Leader · jocuri' },
  { titlu: 'IMPROV', idei: 'Story · Cypher (câte 2/4/8/toți) · Face 2 Face' },
  { titlu: 'Q&A', idei: 'Culture · Personal · Dumb Questions · Quiz' },
]

export const TIP_LECTIE_LABEL: Record<TipLectie, string> = {
  lectie: 'Lecție',
  spectacol: 'Spectacol',
  concurs: 'Concurs',
}

export const TIP_LECTIE_ICON: Record<TipLectie, string> = {
  lectie: '',
  spectacol: '🎭',
  concurs: '🏆',
}

// Nivelurile din calendare (etichete de programă) → enumul `nivel_curs` din DB.
// „Open" primește programa de începători (nota din sheet-ul „Sumar grupe").
export const NIVEL_PROGRAMA_TO_CURS: Record<string, string> = {
  Începători: 'Incepator',
  Open: 'Incepator',
  Intermediari: 'Intermediar',
  Avansați: 'Avansat',
}

export const ZILE_WEEKEND = ['Sambata', 'Duminica']
