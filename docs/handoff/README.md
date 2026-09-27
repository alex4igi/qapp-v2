# Handoff-uri între agenți

Codex nu scrie cod: face analize, propuneri și review-uri și le predă aici. Claude le verifică pe codul
și datele reale, apoi implementează. (Regulile complete sunt în `../../AGENTS.md` → „Cine ce face”.)

## Format

- Un fișier pe subiect: `AAAA-LL-GG-subiect-scurt.md` (data predării).
- În capul fișierului, un bloc **Stare**: `deschis` / `parțial implementat` / `închis`, cu data ultimei verificări.
- Fiecare decizie e marcată **confirmat de Alex** sau **propunere**. O propunere nu se implementează până nu o confirmă Alex.
- Când Claude implementează, completează în blocul de stare ce s-a făcut (commit) și ce a rămas. Fișierul nu se șterge —
  rămâne ca istoric al deciziei.
