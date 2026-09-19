import type { AppRoute } from './rolesMatrix'

// Ce rămâne deschis în modul „doar azi" (butonul roșu din bara de sus): programul
// zilei, rosterul cu prezența și încasările zilei. Orice altă rută arată ecranul
// „indisponibil" — decizia se ia în shell, ÎNAINTE de `<Outlet/>`, ca paginile cu
// istoric să nu se monteze și să nu-și pornească query-urile.
//
// Lista e deliberat scurtă. O rută se adaugă aici doar dacă pagina ei nu arată
// nimic din afara zilei curente (sau își ascunde singură istoricul pe `active`).
export const TODAY_ONLY_ROUTES = [
  '/',
  '/grupa',
  '/eveniment',
  '/situatie-zilnica',
] as const satisfies readonly AppRoute[]

/** Potrivirea pe `${ruta}/` e obligatorie: altfel `/eveniment` ar înghiți și `/evenimente`. */
export function isTodayOnlyRoute(pathname: string): boolean {
  return TODAY_ONLY_ROUTES.some(
    (r) => pathname === r || (r !== '/' && pathname.startsWith(`${r}/`)),
  )
}
