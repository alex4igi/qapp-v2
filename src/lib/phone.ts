// Numărul național semnificativ (9 cifre, începe cu 7) extras din orice format.
// (0741) 966 387 / +40741966387 / 0040741966387 / 741966387 → '741966387'.
// Returnează null dacă numărul nu e un mobil românesc valid.
export function roMobileNational(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('0040')) d = d.slice(4)
  else if (d.startsWith('40')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d.length === 9 && d.startsWith('7') ? d : null
}

// True dacă numărul e un mobil românesc valid (după reformatare).
export function isValidRoMobile(raw: string | null | undefined): boolean {
  return roMobileNational(raw) !== null
}

// Format național standard pentru afișare/stocare: 07XXXXXXXX. null dacă invalid.
export function formatRoMobile(raw: string | null | undefined): string | null {
  const n = roMobileNational(raw)
  return n ? `0${n}` : null
}

// Normalizează orice format de telefon românesc la E.164 (+40...).
// 0744123456 / +40744123456 / 0040744123456 / 744123456 → +40744123456.
// Numerele care nu se pot interpreta cu încredere sunt păstrate ca atare.
export function normalizeTelefon(raw: string): string {
  const n = roMobileNational(raw)
  return n ? `+40${n}` : raw.trim()
}

// Link WhatsApp click-to-chat (wa.me cere doar cifre, fără +).
// null dacă numărul nu e mobil RO valid.
export function waLink(
  telefon: string | null | undefined,
  mesaj?: string,
): string | null {
  const n = roMobileNational(telefon)
  if (!n) return null
  const base = `https://wa.me/40${n}`
  return mesaj ? `${base}?text=${encodeURIComponent(mesaj)}` : base
}

// Link de invitație către grupul de WhatsApp al unei grupe (cursuri.link_whatsapp).
// Câmpul e text liber completat din formularul de curs, deci refuzăm orice nu e
// http(s) — altfel un `javascript:` scris în DB ar ajunge în href.
export function waGroupLink(raw: string | null | undefined): string | null {
  const s = raw?.trim()
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}
