// Punctul de intrare al worker-ului pdf.js, ca să apucăm să punem polyfill-urile
// ÎNAINTE de codul bibliotecii. Worker-ul are context global propriu, deci
// `URL.parse` completat în pagină nu-l ajută — iar el chiar îl folosește, la
// validarea link-urilor din PDF (contractul are hyperlink-uri în antet).
//
// Ordinea contează: importurile ES se evaluează în ordinea scrierii, deci
// polyfill-ul rulează primul.
import '@/lib/polyfills'
import 'pdfjs-dist/build/pdf.worker.min.mjs'
