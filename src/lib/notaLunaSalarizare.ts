/**
 * Regulile care se aplică într-o singură lună, explicate pe ecran lângă salariu —
 * în „Salariul meu", în /salarizare și în profilul instructorului.
 */
const NOTE: Record<string, string> = {
  // Alex, 6–7 oct. 2026 (docs/grila-salarizare-instructori.md §2, docs/bonus-manager-studio.md §7).
  '2026-9':
    'Septembrie 2026: bonusul de retenție se plătește la standard, pentru că nu avem august ca lună de referință. ' +
    'Bonusul de ocupare se plătește după situația actuală a grupelor, la instructori și la manageri.',
}

export function notaLunaSalarizare(anul: number, luna: number): string | null {
  return NOTE[`${anul}-${luna}`] ?? null
}
