// Edge Function INTERNĂ (verify_jwt=false + x-contract-secret): finalizează un
// contract semnat — generează PDF-ul final și îl arhivează.
//
// Pași (idempotent pe status='semnat'; re-rulabil la eșec parțial):
//   1. hash SHA-256 al template-ului (pdf_hash_pre)
//   2. overlay valori + semnătură pe coordonatele normalizate din template.fields
//   3. pagina „Certificat de finalizare" cu jurnalul de evenimente (probă)
//   4. sigilare criptografică cu certificat .p12 (dacă CONTRACT_P12_B64 e setat;
//      punct de extensie pentru sigiliu calificat Namirial + TSA — alt Signer)
//   5. hash final + upload Storage (backup permanent)
//   6. upload Google Drive (Shared Drive, service account) sau fallback signed URL
//   7. rând în documente_client per copil vizat → apare automat în portal
//   8. status='finalizat'
import { PDFDocument, PDFFont, PDFPage, rgb } from 'npm:pdf-lib@1.17.1'
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1'
import { logEvent, serviceClient, sha256Hex, type TemplateField } from '../_shared/contracte.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ============================================================
// Sigilare — interfață injectabilă (self-signed p12 azi, Namirial+TSA mâine)
// ============================================================

type Sealer = (pdf: Uint8Array) => Promise<Uint8Array>

async function p12Sealer(): Promise<Sealer | null> {
  const b64 = Deno.env.get('CONTRACT_P12_B64')
  const pass = Deno.env.get('CONTRACT_P12_PASS')
  if (!b64 || !pass) return null
  const p12 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const { pdflibAddPlaceholder } = await import('npm:@signpdf/placeholder-pdf-lib@3.2.4')
  const signpdfMod = await import('npm:@signpdf/signpdf@3.2.4')
  const { P12Signer } = await import('npm:@signpdf/signer-p12@3.2.4')
  const signPdf = (signpdfMod as { default?: { default?: unknown } }).default?.default ??
    (signpdfMod as { default?: unknown }).default ?? signpdfMod

  return async (pdf: Uint8Array) => {
    const doc = await PDFDocument.load(pdf)
    pdflibAddPlaceholder({
      pdfDoc: doc,
      reason: 'Sigiliu Quasar Dance Studio SRL — integritate document',
      contactInfo: 'office@quasardance.ro',
      name: 'Quasar Contracte',
      location: 'Iasi, Romania',
    })
    const withPlaceholder = await doc.save({ useObjectStreams: false })
    const signer = new P12Signer(p12, { passphrase: pass })
    // deno-lint-ignore no-explicit-any
    return await (signPdf as any).sign(withPlaceholder, signer)
  }
}

// ============================================================
// Google Drive — service account JWT flow, Shared Drive
// ============================================================

async function driveUpload(
  pdf: Uint8Array,
  fileName: string,
): Promise<{ link: string } | { error: string }> {
  const saB64 = Deno.env.get('GDRIVE_SA_JSON_B64')
  const folderId = Deno.env.get('GDRIVE_FOLDER_ID')
  if (!saB64 || !folderId) return { error: 'GDRIVE_* neconfigurat' }

  try {
    const sa = JSON.parse(atob(saB64))
    const pem = sa.private_key.replace(/-----[A-Z ]+-----|\n/g, '')
    const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
    const key = await crypto.subtle.importKey(
      'pkcs8', keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign'],
    )
    const now = Math.floor(Date.now() / 1000)
    const enc = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const signingInput = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
    })}`
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput),
    )
    const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`

    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })
    const tok = await tokRes.json()
    if (!tok.access_token) return { error: `token: ${JSON.stringify(tok)}` }

    const meta = { name: fileName, parents: [folderId] }
    const boundary = 'qsignBoundary42'
    const body = new Blob([
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\ncontent-type: application/pdf\r\n\r\n`,
      pdf,
      `\r\n--${boundary}--`,
    ])
    const up = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tok.access_token}`,
          'content-type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    )
    const file = await up.json()
    if (!file.id) return { error: `upload: ${JSON.stringify(file)}` }
    return { link: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view` }
  } catch (e) {
    return { error: String(e) }
  }
}

// ============================================================
// Generare PDF
// ============================================================

function drawWrapped(
  page: PDFPage, text: string, font: PDFFont,
  x: number, yTop: number, size: number, maxWidth: number, lineHeight: number,
): number {
  const words = text.split(/\s+/)
  let line = ''
  let y = yTop
  for (const w of words) {
    const attempt = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(attempt, size) > maxWidth && line) {
      page.drawText(line, { x, y, size, font })
      line = w
      y -= lineHeight
    } else {
      line = attempt
    }
  }
  if (line) page.drawText(line, { x, y, size, font })
  return y - lineHeight
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CONTRACT_INTERNAL_SECRET') ?? ''
  if (!secret || req.headers.get('x-contract-secret') !== secret) {
    return json({ error: 'forbidden' }, 403)
  }

  try {
    const { contractId } = await req.json()
    if (!contractId) return json({ error: 'contractId obligatoriu' }, 400)

    const admin = serviceClient()
    const { data: contract } = await admin
      .from('contracte')
      .select('*, contract_templates(nume, tip, fields, pdf_storage_path)')
      .eq('id', contractId)
      .single()
    if (!contract) return json({ error: 'contract inexistent' }, 404)
    if (contract.status === 'finalizat') return json({ ok: true, already: true })
    if (contract.status !== 'semnat') {
      return json({ error: `status ${contract.status}, aștept 'semnat'` }, 409)
    }

    const tpl = contract.contract_templates as {
      nume: string; tip: string; fields: TemplateField[]; pdf_storage_path: string
    }

    // 1) template + hash pre
    const { data: tplFile, error: dlErr } = await admin.storage
      .from('contracte-templates')
      .download(tpl.pdf_storage_path)
    if (dlErr || !tplFile) {
      await logEvent(admin, contractId, 'eroare', { pas: 'download_template', mesaj_eroare: dlErr?.message })
      return json({ error: 'template indisponibil' }, 500)
    }
    const tplBytes = new Uint8Array(await tplFile.arrayBuffer())
    const hashPre = await sha256Hex(tplBytes)

    // 2) overlay
    const doc = await PDFDocument.load(tplBytes)
    doc.registerFontkit(fontkit)
    const fontBytes = await Deno.readFile(new URL('./NotoSans-Regular.ttf', import.meta.url))
    const font = await doc.embedFont(fontBytes, { subset: true })
    const pages = doc.getPages()
    const valori = (contract.valori ?? {}) as Record<string, unknown>

    let semnaturaImg = null
    if (contract.semnatura_path) {
      const { data: sigFile } = await admin.storage.from('contracte').download(contract.semnatura_path)
      if (sigFile) semnaturaImg = await doc.embedPng(new Uint8Array(await sigFile.arrayBuffer()))
    }

    const { data: copii } = await admin
      .from('clienti')
      .select('id, nume, prenume, data_nasterii')
      .eq('familia', contract.familie_id)
      .order('data_nasterii')

    for (const f of tpl.fields) {
      const page = pages[f.page - 1]
      if (!page) continue
      const { width, height } = page.getSize()
      const x = f.x * width
      const yTop = height - f.y * height
      const size = f.fontSize ?? 10

      if (f.type === 'signature') {
        if (semnaturaImg) {
          const w = f.w * width
          const h = f.h * height
          page.drawImage(semnaturaImg, { x, y: yTop - h, width: w, height: h })
        }
      } else if (f.type === 'copii_table') {
        // rânduri copil sub coordonata de start; folosit pe tabelul cursanți
        let y = yTop
        const lista = (copii ?? []).filter((c) =>
          !contract.client_id || c.id === contract.client_id ||
          (valori.copii_selectati as string[] | undefined)?.includes(c.id)
        )
        const randuri = lista.length > 0 ? lista : (copii ?? [])
        for (const c of randuri.slice(0, 3)) {
          const nume = `${c.nume} ${c.prenume ?? ''}`.trim()
          const nastere = c.data_nasterii
            ? new Date(c.data_nasterii).toLocaleDateString('ro-RO')
            : ''
          page.drawText(`${nume}   ${nastere}`, { x, y, size, font })
          y -= f.h * height
        }
      } else if (f.type === 'checkbox') {
        if (valori[f.key]) page.drawText('X', { x, y: yTop - size, size, font })
      } else {
        const val = valori[f.key]
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          let text = String(val)
          if (f.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
            text = new Date(text).toLocaleDateString('ro-RO')
          }
          page.drawText(text, {
            x, y: yTop - size, size, font,
            maxWidth: f.w * width, color: rgb(0.1, 0.1, 0.3),
          })
        }
      }
    }

    // 3) pagina certificat de finalizare
    const { data: events } = await admin
      .from('contract_events')
      .select('tip, meta, created')
      .eq('contract_id', contractId)
      .order('created')

    const cert = doc.addPage()
    const { width: cw, height: ch } = cert.getSize()
    let y = ch - 60
    cert.drawText('Certificat de finalizare — semnare electronică', { x: 50, y, size: 15, font })
    y -= 26
    cert.drawText(`Document: ${tpl.nume}`, { x: 50, y, size: 10, font })
    y -= 16
    cert.drawText(`ID contract: ${contractId}`, { x: 50, y, size: 10, font })
    y -= 16
    y = drawWrapped(cert, `Hash SHA-256 document original: ${hashPre}`, font, 50, y, 9, cw - 100, 13)
    y -= 8
    cert.drawText(
      'Identificarea semnatarului: link unic de semnare livrat prin SMS pe numărul de telefon',
      { x: 50, y, size: 9, font },
    )
    y -= 13
    cert.drawText('verificat al familiei (și/sau email), conform jurnalului de mai jos.', {
      x: 50, y, size: 9, font,
    })
    y -= 24
    cert.drawText('Jurnal de evenimente (oră server, UTC):', { x: 50, y, size: 11, font })
    y -= 18
    for (const ev of events ?? []) {
      const meta = (ev.meta ?? {}) as Record<string, unknown>
      const parts = [
        new Date(ev.created).toISOString().replace('T', ' ').slice(0, 19),
        ev.tip.toUpperCase(),
        meta.ip ? `IP ${meta.ip}` : null,
        meta.ua ? String(meta.ua).slice(0, 60) : null,
      ].filter(Boolean)
      y = drawWrapped(cert, parts.join(' · '), font, 50, y, 8, cw - 100, 11)
      if (y < 60) break
    }
    y -= 10
    cert.drawText(
      'Integritatea documentului este garantată prin hash-urile SHA-256 și sigiliul electronic aplicat.',
      { x: 50, y: Math.max(y, 40), size: 8, font },
    )

    let pdfBytes = await doc.save()
    await logEvent(admin, contractId, 'pdf_generat', { pagini: pages.length + 1 })

    // 4) sigilare (dacă e configurată)
    const sealer = await p12Sealer()
    if (sealer) {
      try {
        pdfBytes = await sealer(pdfBytes)
        await logEvent(admin, contractId, 'sigilat', { metoda: 'p12' })
      } catch (e) {
        await logEvent(admin, contractId, 'eroare', { pas: 'sigilare', mesaj_eroare: String(e) })
      }
    }

    // 5) hash final + Storage
    const hashFinal = await sha256Hex(pdfBytes)
    const storagePath = `final/${contractId}.pdf`
    const { error: stErr } = await admin.storage
      .from('contracte')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (stErr) {
      await logEvent(admin, contractId, 'eroare', { pas: 'storage', mesaj_eroare: stErr.message })
      return json({ error: 'upload storage eșuat' }, 500)
    }

    // 6) Drive sau fallback signed URL (1 an)
    const numeFisier = `${tpl.nume.replace(/[^\p{L}\p{N} _-]/gu, '')} — ${contractId.slice(0, 8)}.pdf`
    let link: string
    const drive = await driveUpload(pdfBytes, numeFisier)
    if ('link' in drive) {
      link = drive.link
      await logEvent(admin, contractId, 'drive_upload', { link })
    } else {
      const { data: signed } = await admin.storage
        .from('contracte')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
      link = signed?.signedUrl ?? ''
      await logEvent(admin, contractId, 'eroare', {
        pas: 'drive', mesaj_eroare: drive.error, fallback: 'signed_url_1an',
      })
    }

    // 7) documente_client — per copil vizat (apare automat în portal)
    const vizati = contract.client_id
      ? (copii ?? []).filter((c) => c.id === contract.client_id)
      : (copii ?? [])
    let docClientId: string | null = null
    for (const c of vizati) {
      const { data: dc } = await admin
        .from('documente_client')
        .insert({
          client: c.id,
          tip: tpl.tip === 'act_aditional' ? 'Anexa' : 'Contract',
          titlu: tpl.nume,
          link,
          observatii: `Semnat electronic la ${contract.semnat_la?.slice(0, 10)} (contract ${contractId.slice(0, 8)})`,
        })
        .select('id')
        .single()
      if (dc && !docClientId) docClientId = dc.id
    }

    // 8) poarta de reînscriere: actul semnat intră în verificarea admin existentă
    if (contract.gate_id) {
      const { data: gUpd } = await admin
        .from('reinscrieri_gate')
        .update({
          act_status: 'semnat',
          act_canal: 'app',
          document_link: link,
          act_semnat_la: contract.semnat_la ?? new Date().toISOString(),
          updated: new Date().toISOString(),
        })
        .eq('id', contract.gate_id)
        .is('activat_la', null)
        .select('id')
      if (gUpd && gUpd.length > 0) {
        await logEvent(admin, contractId, 'gate_semnat', { gate_id: contract.gate_id })
      }
    }

    // 9) finalizat
    await admin
      .from('contracte')
      .update({
        status: 'finalizat',
        finalizat_la: new Date().toISOString(),
        pdf_hash_pre: hashPre,
        pdf_hash_final: hashFinal,
        pdf_storage_path: storagePath,
        pdf_drive_link: 'link' in drive ? drive.link : null,
        documente_client_id: docClientId,
      })
      .eq('id', contractId)

    return json({ ok: true, link })
  } catch (e) {
    console.error('contract-finalize error:', e)
    return json({ error: String(e) }, 500)
  }
})
