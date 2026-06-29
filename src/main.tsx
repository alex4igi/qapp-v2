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
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
