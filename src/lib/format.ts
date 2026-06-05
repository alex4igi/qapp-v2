export function formatRON(value: number | null | undefined): string {
  const n = value ?? 0
  return `${n.toLocaleString('ro-RO')} RON`
}
