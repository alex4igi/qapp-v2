// Bootstrap pdf.js pt. randare client-side în editorul de template-uri.
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from './pdfWorker?worker&url'

// Nu arătăm direct spre bundle-ul din pdfjs-dist: trecem printr-un modul propriu
// care încarcă întâi polyfill-urile (`URL.parse`, `Promise.withResolvers`) de
// care are nevoie pe Safari mai vechi. `?worker&url` lasă pdf.js să-și
// gestioneze singur ciclul de viață al worker-ului, ca înainte.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({ url }).promise
}

export function getPageCount(doc: PDFDocumentProxy): number {
  return doc.numPages
}
