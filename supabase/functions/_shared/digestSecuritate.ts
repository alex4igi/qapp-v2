// Digestul zilnic de securitate (Faza 4 din planul de securizare). Datele le adună
// `digest_securitate_zilnic()` în DB; aici doar se formatează și se trimite la
// owner/admin. Cheile de plafon și emailurile de portal pot fi scrise de oricine
// (ex. adresa din „am uitat parola"), deci tot ce vine din date se escapează.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from './messaging.ts'

type Plafon = { actiune: string; cheie: string; refuzate: number; ferestre: number }
type ContPortal = { email: string; esecuri: number; blocat_pana: string | null }
type StaffNou = { email: string; rol: string | null; creat: string }
type ComandaNetopia = { order_ref: string; suma: number; status: string; creat: string }
type ActiuneBani = { actiune: string; cine: string; n: number }

export type Digest = {
  zi: string
  de_trimis: boolean
  admini: string[]
  admini_adaugati: string[]
  admini_scosi: string[]
  plafoane: Plafon[]
  portal: { blocate: number; cu_esecuri: number; conturi: ContPortal[] }
  staff_nou: StaffNou[]
  netopia_blocate: ComandaNetopia[]
  bani: ActiuneBani[]
}

const ETICHETE_BANI: Record<string, string> = {
  incasare_deleted: 'încasări șterse',
  datorie_deleted: 'datorii șterse',
  incasare_modified: 'încasări modificate',
  incasare_moved: 'încasări mutate la alt client',
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })
}

type Sectiune = { titlu: string; linii: string[] }

function sectiuni(d: Digest): Sectiune[] {
  const s: Sectiune[] = []
  if (d.admini_adaugati.length || d.admini_scosi.length) {
    s.push({
      titlu: 'Conturi cu drept de admin schimbate',
      linii: [
        ...d.admini_adaugati.map((e) => `adăugat: ${e}`),
        ...d.admini_scosi.map((e) => `scos: ${e}`),
      ],
    })
  }
  if (d.staff_nou.length) {
    s.push({
      titlu: 'Conturi noi în aplicație',
      linii: d.staff_nou.map((u) => `${u.email} — rol ${u.rol ?? 'FĂRĂ ROL'} — ${ora(u.creat)}`),
    })
  }
  if (d.netopia_blocate.length) {
    s.push({
      titlu: 'Plăți online rămase neconfirmate (peste 30 de minute)',
      linii: d.netopia_blocate.map((o) => `${o.order_ref} — ${o.suma} RON — ${o.status} — ${ora(o.creat)}`),
    })
  }
  if (d.plafoane.length) {
    s.push({
      titlu: 'Cereri refuzate de plafon (încercări repetate)',
      linii: d.plafoane.map((p) => `${p.actiune} · ${p.cheie} — ${p.refuzate} refuzate`),
    })
  }
  if (d.portal.blocate || d.portal.cu_esecuri) {
    s.push({
      titlu: `Portal: ${d.portal.blocate} conturi blocate, ${d.portal.cu_esecuri} cu 3+ parole greșite`,
      linii: d.portal.conturi.map((c) => `${c.email} — ${c.esecuri} eșecuri — blocat până ${ora(c.blocat_pana)}`),
    })
  }
  if (d.bani.length) {
    s.push({
      titlu: 'Modificări pe bani (ultimele 24 de ore)',
      linii: d.bani.map((b) => `${ETICHETE_BANI[b.actiune] ?? b.actiune}: ${b.n} — ${b.cine}`),
    })
  }
  return s
}

export function buildDigestEmail(d: Digest, appUrl: string): { subject: string; html: string; text: string } {
  const sect = sectiuni(d)
  const subject = `Quasar: securitate ${d.zi} — ${sect.length === 1 ? '1 semnal' : `${sect.length} semnale`} de verificat`

  const html =
    `<p>Ce s-a întâmplat în ultimele 24 de ore și merită privit. Emailul pleacă doar în zilele în care e ceva.</p>` +
    sect
      .map(
        (x) =>
          `<h3 style="font-family:system-ui,sans-serif;font-size:15px;margin:18px 0 6px">${esc(x.titlu)}</h3>` +
          `<ul style="font-family:system-ui,sans-serif;font-size:14px;margin:0;padding-left:18px">` +
          x.linii.map((l) => `<li>${esc(l)}</li>`).join('') +
          `</ul>`,
      )
      .join('') +
    `<p style="margin-top:18px">Detalii pe bani: <a href="${appUrl}/audit">pagina Audit</a>. ` +
    `Dacă ceva nu e al vostru, urmează <strong>docs/runbook-incident.md</strong>.</p>` +
    `<p style="color:#666;font-size:12px">Mesaj automat Qapp, trimis doar la owner și admin.</p>`

  const text =
    sect.map((x) => `${x.titlu}\n${x.linii.map((l) => `- ${l}`).join('\n')}`).join('\n\n') +
    `\n\nDetalii pe bani: ${appUrl}/audit. Daca ceva nu e al vostru, urmeaza docs/runbook-incident.md.`

  return { subject, html, text }
}

async function adminEmails(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 })
  if (error) throw error
  return (data?.users ?? [])
    .filter((u) => ['owner', 'admin'].includes(String(u.app_metadata?.role ?? '')))
    .map((u) => u.email)
    .filter((e): e is string => Boolean(e))
}

/** Întoarce câte emailuri au plecat. Erorile se adaugă în `errors`, nu opresc cron-ul. */
export async function trimiteDigestSecuritate(
  admin: SupabaseClient,
  appUrl: string,
  errors: string[],
): Promise<number> {
  const { data, error } = await admin.rpc('digest_securitate_zilnic')
  if (error) {
    errors.push(`digest securitate: ${error.message}`)
    return 0
  }
  const d = data as Digest
  if (!d?.de_trimis) return 0

  let trimise = 0
  try {
    const destinatari = await adminEmails(admin)
    if (destinatari.length === 0) errors.push('digest securitate: niciun cont owner/admin')
    const { subject, html, text } = buildDigestEmail(d, appUrl)
    for (const to of destinatari) {
      const res = await sendEmail({ to, subject, html, text })
      if (res.ok) trimise++
      else errors.push(`digest securitate → ${to}: ${res.error ?? 'eșec'}`)
    }
  } catch (e) {
    errors.push(`digest securitate: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (trimise > 0) {
    const { error: e2 } = await admin
      .from('securitate_digest')
      .update({ trimis_la: new Date().toISOString() })
      .eq('zi', d.zi)
    if (e2) errors.push(`digest securitate (marcare): ${e2.message}`)
  }
  return trimise
}
