// Primul import din aplicație: completează API-uri pe care browserele mai vechi
// de la recepție nu le au încă (vezi lib/polyfills.ts).
import './lib/polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// Principiu: după orice salvare reușită dintr-un pop-up (plată, înrolare,
// editare etc.) reîmprospătăm automat pagina activă. invalidateQueries() fără
// cheie marchează toate query-urile stale; React Query re-fetch-uiește doar pe
// cele montate = exact pagina curentă, fără reload de browser. Acoperă orice
// modal, prezent sau viitor, fără să trebuiască să enumerăm chei per modal.
// PostgREST 57014 = „canceling statement due to statement timeout" (8 s pe rolul
// authenticated). Reîncercarea nu ajută — aceeași interogare grea ține DB-ul ocupat
// pentru toți ceilalți; cele 3 reluări implicite transformau un timeout în ~30 s.
function isStatementTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '57014'
  )
}

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Reîmprospătează pagina activă când tabul redevine în focus, ca datele
      // să se sincronizeze între taburi diferite (ex: leads într-un tab,
      // dashboard grupă în altul) fără refresh manual.
      refetchOnWindowFocus: true,
      // O singură reluare pentru erori trecătoare; niciuna pentru timeout-uri.
      retry: (failureCount, error) =>
        !isStatementTimeout(error) && failureCount < 1,
    },
  },
})

// Lookup-urile (locații, săli, sezoane, cursuri pentru selectoare) se schimbă rar și
// sunt cerute de mai multe carduri/pagini — le ținem proaspete 5 minute. Orice
// salvare le invalidează oricum prin invalidateQueries() de mai sus.
queryClient.setQueryDefaults(['lookup'], { staleTime: 5 * 60_000 })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
