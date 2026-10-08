# Procedura „Absenți de 21 de zile"

> Decisă de Alex pe 8 oct. 2026. Textele pe care le vede recepția (tooltipul de pe stare și „ℹ︎ Procedura")
> au o singură sursă: `src/features/absente21z/procedura.ts`. Documentul ăsta și fișierul acela se schimbă **împreună**.

## Drumul unui caz

```
21 de zile fără prezență
        │  (jobul de noapte, 03:00 UTC)
        ▼
  De sunat ── primul apel în 48 h lucrătoare (fără sâmbătă și duminică)
        │
        ├─ Revine ─────────────► (prima prezență) ► A revenit
        ├─ Amână (cu dată) ────► rezilierea lunilor viitoare; reapare la dată ► se sună, revenirea se discută cu managerul
        ├─ Renunță ────────────► rezilierea din caz (motivul completat) ► cererea de reziliere la semnat ► cap de drum, rămâne la K3
        └─ Nu răspunde ────────► Reîncercare: reapare peste 7 zile
                                    │
                                    └─ Nu răspunde (a doua oară) ► Fără răspuns
                                          │  SMS la 16:00, luni–vineri (a treia încercare)
                                          ▼
                                  45 de zile de la ultima prezență, tot fără prezență
                                          ▼
                                  La manager ── notificare + email în fiecare zi lucrătoare
                                          ├─ Reziliază ► lunile fără prezență și fără bani: 0 lei
                                          │              ► noaptea următoare: EXclient + Nurture
                                          └─ Păstrează locul ► cap de drum
```

În orice stare deschisă, **prima prezență nouă** (la orice grupă) închide cazul ca „A revenit". O **reziliere făcută
din afara cazului** (fișa clientului, suspendarea grupei) îl închide ca „Reziliat separat" și îl scoate din K3.

## Regulile și unde stau în cod

| Regulă | Unde |
|---|---|
| Cine a reziliat înainte de deschidere nu intră în listă | `absenta_reziliata()` chemată din `detecteaza_absente_21z_interval` |
| Rezilierea din afara contactului scoate cazul din K3 | `job_absente_21z`, pasul 5d → `exclus_k3`; `kpi_k3` filtrează `not exclus_k3` |
| Ceasul de 48 h fără weekend | `ore_lucratoare()` în `get_absente_21z_worklist` și `kpi_k3` |
| „Nu răspunde" oprește ceasul | `marcheaza_contact_absenta`: prima încercare setează `contactat_la` |
| A doua încercare la 7 zile | `marcheaza_contact_absenta` → `urmatoarea_incercare = azi + 7` |
| SMS-ul de după al doilea „Nu răspunde" | `cron-afternoon` pasul 4, text în `buildAbsentaFaraRaspunsSms` (`_shared/sms.ts`), log în `sms_logs` tip `absenta_fara_raspuns` |
| La manager după 45 de zile | `job_absente_21z` pasul 5e; notificare `absenta_reziliere_de_confirmat` (`absenta_notifica_reziliere`) |
| Email zilnic către manageri | `cron-morning`, `trimiteRezilieriDeConfirmat` (L–V, doar cât lista nu e goală; managerul vede doar locația lui) |
| Ce se reziliază la confirmare | `absenta_inrolari_de_reziliat()`: fără `Prezent` și fără încasări pe rând; trupele nu |
| Decizia managerului | `decide_reziliere_absenta` (owner/admin/manager) |
| Amână = locul se eliberează | `ContactAbsentaModal` → `ReziliereDinAbsentaModal` (aceeași reziliere ca din fișa clientului) |
| Nurture după reziliere | jobul EXclient (`auto_mark_exclient`), în noaptea de după |
| Cererea de reziliere la dosar (buton după reziliere și în Istoric) | `CerereReziliereModal` → `trimiteCerereReziliere` → `contract-send` cu șablonul `cerere_reziliere`; email întâi, SMS doar fără email (`emailIntai` în `_shared/contractNotify.ts`) |
| Trupele nu ajung la manager | `absenta_inrolari_de_reziliat` exclude `nivelul = 'Trupa'` — rezilierea unei trupe are cost; regula se discută separat (Alex, 08.10.2026) |

## De ce așa

- **Rezilierea din afara contactului iese din K3** (Alex): decizia de plecare nu s-a luat în urma apelului de recuperare.
  Rezilierea din caz („Renunță") rămâne la K3, ca nereactivat.
- **Nurture prin EXclient, nu direct**: un client cu înrolări nereziliate are „acces", iar curățenia de noapte din
  `auto_mark_exclient` șterge leadurile Nurture neatinse ale clienților care nu sunt EXclient. După reziliere, clientul
  trece EXclient și primește leadul Nurture în aceeași noapte (pragul de 45 de zile e același).
- **Lunile cu prezențe rămân cu datoria** (Alex): copilul a folosit locul. Lunile cu bani încasați dar fără prezențe nu
  se ating automat; o eventuală restituire trece prin /plati.
- **Cererea de reziliere nu condiționează rezilierea** (Alex): rezilierea e valabilă imediat, cererea semnată e pentru dosar.
- **SMS-ul „fără răspuns" are 2 segmente** (194–203 caractere, textul lui Alex) — asumat, sunt puține mesaje.
- **SMS-ul la 16:00**: mesajele la care omul poate vrea să răspundă pleacă atunci când e cineva la sală (decizia din 15.09.2026).
