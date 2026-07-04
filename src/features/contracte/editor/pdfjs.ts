// Bootstrap pdf.js pt. randare client-side în editorul de template-uri.
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  return pdfjsLib.getDocument({ url }).promise
}

export function getPageCount(doc: PDFDocumentProxy): number {
  return doc.numPages
}
