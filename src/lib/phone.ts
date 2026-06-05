// Normalizează orice format de telefon românesc la E.164 (+40...).
// 0744123456 / +40744123456 / 0040744123456 / 744123456 → +40744123456.
// Numerele care nu se pot interpreta cu încredere sunt păstrate ca atare.
export function normalizeTelefon(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  let d = digits
  if (d.startsWith('0040')) d = d.slice(4)
  else if (d.startsWith('40')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d.length === 9 ? `+40${d}` : raw.trim()
}
