# Procedură salarizare pentru admin - PDF

**Stare:** închis - document livrat; ultima verificare: 2026-10-07. Nu necesită implementare.

- **confirmat de Alex:** solicitarea unui PDF pentru instruirea adminului: traseu, ajustări, citirea KPI-urilor, calcul pe grupă/bonus/lună și confirmări; cuvinte puține și clare.
- **propunere:** materialul editorial rezultat este `output/pdf/procedura-salarizare-admin.pdf`, 8 pagini. Exemplele sunt ilustrative; nu reprezintă salarii reale.
- **propunere:** ghidul reflectă documentația și ecranele locale verificate la 7 octombrie 2026. Nu a fost verificat pe date live și nu introduce reguli salariale noi. Pentru parametrii fără editor identificat, adminul transmite cazul lui Alex.
- **propunere:** la schimbarea regulilor sau a ecranelor, actualizați ghidul. Regula septembrie 2026 este ocupare măsurată, retenție standard; Bianca David rămâne în afara grilei. Detaliile verii încă nevalidate se reverifică înainte de plata de vară.

Surse: `docs/grila-salarizare-instructori.md`, `docs/bonus-manager-studio.md`, `docs/grila-front-desk.md`, `docs/reguli-domeniu.md`; componentele Salarizare, StaffCard, TeacherTabSalarii, SalariuTeacherDetaliu, RaportKpiPage, InteractiuniK4Card, GrileKpiPage, GrilaEditorPage și TeacherForm.

Verificare: PDF randat și inspectat vizual; 8 pagini, font cu diacritice. Nu s-au modificat codul aplicației, configurațiile sau baza de date.

## Verificare Claude (7 oct. 2026)

Verificat pe parametrii din DB (`salarizare_grila`, `kpi_grila_linii` Petruța/Theo), pe gărzile RPC și pe ecrane.
Cifrele și pragurile sunt corecte. Sursa e acum `docs/procedura-salarizare-admin.html` (scriptul ReportLab nu
fusese păstrat); PDF-ul din `output/pdf/` e regenerat din ea, 9 pagini.

- **Corectat:** „Redeschide" raportul KPI — doar owner-ul (`redeschide_raport_kpi` cere `is_owner()`), nu orice admin.
- **Corectat:** K4 necompletat blochează și confirmarea bonusului KPI (componenta e „blocat"), nu doar închiderea raportului.
- **Adăugat:** pagina 2 — ce văd oamenii în „Salariul meu" de la 7 oct. (simularea lunilor încheiate, Bianca fără simulare)
  și ce mișcă cifra până la confirmare (la instructori înrolările, nu plățile).
- **Adăugat:** omul cu două roluri se confirmă în două locuri; pagina se deschide pe luna curentă; „date lipsă" la
  instructori; luna de plată a componentelor staff = luna confirmării; „în afara grilei" n-are editor.
- În aplicație, luna confirmată a instructorului scria „✓ Plătit" în „Salariul meu" — schimbat în „✓ Confirmat",
  ca să nu contrazică punctul 3 din ghid.
- **Ulterior (Alex, 7 oct.):** redeschiderea raportului KPI e extinsă la admini, cu motiv obligatoriu (migrația
  `20261007140000`); ghidul spune acum asta. Marcajele „NOU” și nota despre versiuni au ieșit din PDF —
  versiunea e cea care se dă adminului.
