// Completări pentru browserele de pe stațiile de la recepție.
//
// `pdfjs-dist` v6 cheamă direct două API-uri noi: `URL.parse` (Safari 18.4+,
// Chrome 126+) și `Promise.withResolvers` (Safari 17.4+, Chrome 119+). Pe un
// Safari mai vechi editorul vizual de șabloane din /contracte nu mai randa
// nimic, doar „URL.parse is not a function". Le punem la boot, o singură dată,
// și pentru fereastra principală și pentru worker-ul pdf.js (vezi
// `features/contracte/editor/pdfWorker.ts`) — worker-ul are context global
// separat, polyfill-ul din pagină nu ajunge acolo.
//
// Ambele sunt înlocuiri fidele ale specificației, nu aproximări: se activează
// numai când lipsesc, deci pe browsere noi nu schimbă nimic.

type UrlWithParse = typeof URL & {
  parse?: (url: string | URL, base?: string | URL) => URL | null
}

type PromiseWithResolvers = typeof Promise & {
  withResolvers?: <T>() => {
    promise: Promise<T>
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: unknown) => void
  }
}

const UrlCtor = URL as UrlWithParse
if (typeof UrlCtor.parse !== 'function') {
  UrlCtor.parse = (url, base) => {
    try {
      return base === undefined ? new URL(url) : new URL(url, base)
    } catch {
      return null
    }
  }
}

const PromiseCtor = Promise as PromiseWithResolvers
if (typeof PromiseCtor.withResolvers !== 'function') {
  PromiseCtor.withResolvers = <T,>() => {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

export {}
