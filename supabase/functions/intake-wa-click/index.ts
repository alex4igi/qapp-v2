// Edge Function: un click pe WhatsApp de pe quasardance.ro.
// Serverul site-ului (`/api/wa-click`) trimite codul pus în mesajul precompletat
// („… (ref Q-7K3MP)") și atribuirea sesiunii:
//   { cod, pagina?, referrer_host?, utm_source?, utm_medium?, utm_campaign?, utm_content?, gclid? }
// Recepția leagă apoi leadul de click prin `leaga_click_whatsapp` (vezi migrația
// 20260930140000). `gclid` vine doar cu consimțământ de marketing — îl filtrează site-ul.
//
// ACCES: doar server-server, cu `x-intake-secret` = INTAKE_SECRET, de la prima zi — nu
// există și n-a existat apelant din browser, deci nici fereastră de detecție.
import { serviceClient } from '../_shared/intake.ts'
import { clientIp, raspuns429, verificaPlafon } from '../_shared/rateLimit.ts'

const SECRET = Deno.env.get('INTAKE_SECRET') ?? ''

// Un om apasă de câteva ori; 30 la 10 minute e larg pentru om și strâmt pentru un script.
const PLAFON = { fereastraSec: 600, limita: 30 }

const COD_RE = /^[A-HJ-NP-Z2-9]{5}$/

const cap = (v: unknown, max = 200): string | null => {
  const t = String(v ?? '').trim()
  return t ? t.slice(0, max) : null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Doar POST' }, 405)
  if (!SECRET || req.headers.get('x-intake-secret') !== SECRET) return json({ error: 'Forbidden' }, 403)

  const admin = serviceClient()
  const plafon = await verificaPlafon(admin, 'wa-click', clientIp(req, true), PLAFON)
  if (!plafon.permis) return raspuns429(plafon.retryAfter)

  const body = await req.json().catch(() => ({}))
  const cod = String(body.cod ?? '').trim().toUpperCase()
  if (!COD_RE.test(cod)) return json({ error: 'cod invalid' }, 400)

  const { error } = await admin.from('whatsapp_clickuri').insert({
    cod,
    pagina: cap(body.pagina),
    referrer_host: cap(body.referrer_host),
    utm_source: cap(body.utm_source),
    utm_medium: cap(body.utm_medium),
    utm_campaign: cap(body.utm_campaign),
    utm_content: cap(body.utm_content),
    gclid: cap(body.gclid, 300),
  })
  if (error) {
    console.error('[intake-wa-click] insert:', error.message)
    return json({ error: 'Eroare la salvare' }, 500)
  }
  return json({ ok: true })
})
