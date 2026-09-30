# Utilizarea aplicației — contoare pe rol

Decis de Alex, 30 sept. 2026. Scopul: la finalul sezonului 2026-2027 simplificăm aplicația
(pagini și butoane nefolosite = candidați la eliminare).

## Ce se măsoară

- **Pagini deschise** și **butoane / linkuri apăsate**, numărate pe **zi × rol × varianta (desktop/telefon) × pagină × buton**.
- **Fără id de utilizator** (confirmat de Alex): e statistică de folosire, nu monitorizarea unui om.
- Etichetele butoanelor se curăță în browser: cifrele devin `#`, numele proprii `[nume]`. Linkurile se
  identifică după destinație (`→ /plati`), butoanele din modale primesc titlul modalului în față
  (`Client nou › Salvează`). Un buton poate primi nume fix cu `data-track="..."`.
- Nu se numără: `npm run dev`, Playwright, contul de test (`utilizare_config.exclusi`).

## Cum circulă datele

1. Browserul adună contoarele în memorie și trimite un lot la ~30 s (și la închiderea tabului) prin
   `inregistreaza_utilizare` — rolul îl ia serverul din token. Orice eroare e ignorată în tăcere.
2. `utilizare_zi` — detaliul zilnic, păstrat pentru luna curentă și cea trecută.
3. Cronul `utilizare-rezumat-lunar` (1 ale lunii, 03:30) rezumă lunile încheiate în `utilizare_luna`
   (cu numărul de zile în care a apărut fiecare rând) și șterge detaliul zilnic mai vechi.
4. Colectarea se oprește singură după `utilizare_config.activ_pana_la` (30 iunie 2027). Oprire imediată,
   fără redeploy: `update utilizare_config set activ_pana_la = current_date - 1;`

## Raportul

`/utilizare` (Administrare, owner/admin): pe lună sau pe zi, filtrabil pe rol și variantă.
- **Pagini deschise** — topul paginilor.
- **Butoane apăsate** — pe pagină, cu căutare.
- **Pagini × roluri** — fiecare pagină din meniu × rolurile care au acces; `0` = are acces, n-a deschis-o.

## Citirea la final de sezon

- „Nefolosit" = candidat, nu verdict. Fluxurile sezoniere (reînscrieri în primăvară, start de sezon,
  confirmarea lunară a salariilor, corecțiile pe bani) sunt rare, nu inutile.
- Butoanele **niciodată** apăsate nu apar în contoare. Lista lor = inventarul tuturor butoanelor
  (script Playwright pe fiecare pagină × rol, de făcut în iunie 2027) minus ce apare în `utilizare_luna`.
- Enter într-un formular și scurtăturile de tastatură nu sunt clicuri.
