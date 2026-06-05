// Template-uri email — HTML simplu cu branding minim Quasar Dance.
// Stilurile sunt inline (necesar pentru email clients Gmail/Outlook).
//
// REGULĂ: subject-ul email-ului poate conține diacritice (spre deosebire de SMS).
// Body-ul rămâne plain HTML; nu folosim emoji în subject pentru deliverability.

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ============================================================
// auto_reply_widget — trimis instant când cineva completează formularul
// de pe quasardance.ro și lasă un email. Confirmă submisia.
// ============================================================

export function renderAutoReplyWidget(nume: string | null = null): RenderedEmail {
  const salut = nume ? `Bună, ${escapeHtml(nume)}!` : 'Bună!'

  const subject = 'Mulțumim ca ne-ai contactat — Quasar Dance'

  const text = `${salut}

Multumim ca ne-ai scris! Am primit cererea ta si te vom contacta cat mai curand pentru a stabili o sedinta gratuita de proba la Quasar Dance.

Daca ai intrebari urgente, ne poti suna la 0730 534 172 (Stefan cel Mare) sau 0770 227 580 (Nicolina).

Pana atunci, ne poti urmari pe Instagram @quasar_dance si Facebook.

Echipa Quasar Dance
www.quasardance.ro`

  const html = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="utf-8">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f3f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f3f3;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border-top:6px solid #ffd600;">
          <tr>
            <td style="padding:32px 32px 24px 32px;">
              <h1 style="margin:0 0 16px 0;color:#000000;font-size:22px;font-weight:700;">${salut}</h1>
              <p style="margin:0 0 16px 0;color:#000000;font-size:16px;line-height:1.5;">
                Mulțumim că ne-ai scris! Am primit cererea ta și te vom contacta cât mai curând pentru a stabili o ședință gratuită de probă la Quasar Dance.
              </p>
              <p style="margin:0 0 16px 0;color:#000000;font-size:16px;line-height:1.5;">
                Dacă ai întrebări urgente, ne poți suna direct la unul din punctele noastre de lucru:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
                <tr><td style="padding:4px 16px 4px 0;color:#000;font-weight:600;">Ștefan cel Mare</td><td style="padding:4px 0;color:#000;">0730 534 172</td></tr>
                <tr><td style="padding:4px 16px 4px 0;color:#000;font-weight:600;">Nicolina</td><td style="padding:4px 0;color:#000;">0770 227 580</td></tr>
                <tr><td style="padding:4px 16px 4px 0;color:#000;font-weight:600;">Quasar for Kids</td><td style="padding:4px 0;color:#000;">0745 371 200</td></tr>
              </table>
              <p style="margin:0 0 8px 0;color:#000000;font-size:16px;line-height:1.5;">
                Până atunci, ne poți urmări pe
                <a href="https://www.instagram.com/quasar_dance" style="color:#000;text-decoration:underline;">Instagram</a>
                și
                <a href="https://www.facebook.com/quasardanceIasi/" style="color:#000;text-decoration:underline;">Facebook</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#000000;color:#ffd600;text-align:center;font-weight:700;font-size:14px;letter-spacing:1px;">
              QUASAR DANCE — IAȘI, DIN 1981
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background-color:#f3f3f3;color:#6b6b6b;font-size:12px;text-align:center;">
              <a href="https://www.quasardance.ro" style="color:#6b6b6b;text-decoration:underline;">www.quasardance.ro</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}
