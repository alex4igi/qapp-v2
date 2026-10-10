// Completarea PDF-ului de contract: aceeași pentru documentul final (contract-finalize)
// și pentru ciorna pe care părintele o vede înainte să semneze (contract-public),
// ca ciorna să arate exact ce va semna.
import { degrees, PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'npm:pdf-lib@1.17.1'
import type { TemplateField } from './contracte.ts'

// Sub atât nu coborâm: un contract semnat trebuie să rămână citibil pe hârtie.
const MIN_FONT_SIZE = 6

/**
 * Așază textul CENTRAT în caseta câmpului, pe ambele axe, micșorându-l dacă
 * nu încape pe lățime.
 *
 * Înainte se desena la `x` + `y: yTop - size` — un offset fix care ignora
 * înălțimea casetei, așa că valoarea urca peste linia punctată a formularului
 * și stătea lipită de marginea stângă, peste eticheta tipărită.
 *
 * Centrarea verticală se face pe cutia ascendentului (fără descendent), nu pe
 * înălțimea capitalelor: majusculele românești cu diacritice (Ă, Â, Î, Ș, Ț)
 * chiar folosesc spațiul de deasupra.
 *
 * Micșorarea automată e ce face sigură o mărime de font generoasă în șablon:
 * casetele sunt cât blank-ul tipărit din formular (`ci` are 54pt), iar o adresă
 * sau un email lung ar curge altfel peste textul de alături. Scade doar câmpul
 * care chiar nu încape, restul rămân la mărimea cerută.
 */
function fitInBox(
  font: PDFFont, text: string, size: number,
  x: number, yTop: number, boxW: number, boxH: number,
): { x: number; y: number; size: number } {
  let s = size
  while (s > MIN_FONT_SIZE && font.widthOfTextAtSize(text, s) > boxW) s -= 0.5
  const textW = font.widthOfTextAtSize(text, s)
  const textH = font.heightAtSize(s, { descender: false })
  return {
    x: textW < boxW ? x + (boxW - textW) / 2 : x,
    y: yTop - boxH / 2 - textH / 2,
    size: s,
  }
}


export type CopilPdf = { id: string; nume: string; prenume: string | null; data_nasterii: string | null }

export function deseneazaCampuri(
  pages: PDFPage[],
  fields: TemplateField[],
  valori: Record<string, unknown>,
  font: PDFFont,
  opt: { copii: CopilPdf[]; clientId: string | null; semnatura: PDFImage | null },
): void {
  for (const f of fields) {
    const page = pages[f.page - 1]
    if (!page) continue
    const { width, height } = page.getSize()
    const x = f.x * width
    const yTop = height - f.y * height
    const size = f.fontSize ?? 10
    const boxW = f.w * width
    const boxH = f.h * height

    if (f.type === 'signature') {
      if (opt.semnatura) {
        page.drawImage(opt.semnatura, { x, y: yTop - boxH, width: boxW, height: boxH })
      }
    } else if (f.type === 'copii_table') {
      // `h` e pasul UNUI rând de cursant din tabel, nu înălțimea blocului de
      // trei — verificat pe randare: cu pasul împărțit la 3 copiii se
      // înghesuiau toți în prima celulă.
      const lista = opt.copii.filter((c) =>
        !opt.clientId || c.id === opt.clientId ||
        (valori.copii_selectati as string[] | undefined)?.includes(c.id)
      )
      const randuri = lista.length > 0 ? lista : opt.copii
      const rowH = boxH
      randuri.slice(0, 3).forEach((c, i) => {
        const nume = `${c.nume} ${c.prenume ?? ''}`.trim()
        const nastere = c.data_nasterii
          ? new Date(c.data_nasterii).toLocaleDateString('ro-RO')
          : ''
        // Rândul rămâne aliniat la stânga: e un tabel cu coloane, iar
        // centrarea orizontală l-ar rupe de celula „Prenume cursant".
        const text = `${nume}   ${nastere}`
        const pos = fitInBox(font, text, size, x, yTop - i * rowH, boxW, rowH)
        page.drawText(text, { x, y: pos.y, size: pos.size, font })
      })
    } else if (f.type === 'checkbox') {
      if (valori[f.key]) {
        const pos = fitInBox(font, 'X', size, x, yTop, boxW, boxH)
        page.drawText('X', { x: pos.x, y: pos.y, size: pos.size, font })
      }
    } else {
      const val = valori[f.key]
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        let text = String(val)
        if (f.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
          text = new Date(text).toLocaleDateString('ro-RO')
        }
        const pos = fitInBox(font, text, size, x, yTop, boxW, boxH)
        page.drawText(text, {
          x: pos.x, y: pos.y, size: pos.size, font,
          maxWidth: boxW, color: rgb(0.1, 0.1, 0.3),
        })
      }
    }
  }
}

// Ciorna nu trebuie să poată trece drept document semnat: scris pe diagonală pe
// fiecare pagină + o bandă în subsol.
export function marcheazaCiorna(doc: PDFDocument, font: PDFFont): void {
  const text = 'CIORNĂ — NESEMNAT'
  const nota = 'Previzualizare cu datele completate până acum. Documentul devine valabil doar după semnarea electronică.'
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const size = Math.min(width, height) / 9
    const w = font.widthOfTextAtSize(text, size)
    const rad = Math.atan2(height, width)
    page.drawText(text, {
      x: width / 2 - (w / 2) * Math.cos(rad),
      y: height / 2 - (w / 2) * Math.sin(rad),
      size, font, rotate: degrees((rad * 180) / Math.PI),
      color: rgb(0.85, 0.1, 0.1), opacity: 0.18,
    })
    const s = fitInBox(font, nota, 8, 20, 22, width - 40, 14)
    page.drawText(nota, { x: s.x, y: s.y, size: s.size, font, color: rgb(0.7, 0.1, 0.1) })
  }
}
