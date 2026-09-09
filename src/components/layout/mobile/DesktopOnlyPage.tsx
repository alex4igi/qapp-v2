import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { setForceDesktop } from '@/hooks/useIsMobile'
import { mobileTabsFor } from '@/lib/mobileMatrix'

/**
 * Ce vede telefonul pe o rută care n-a fost adaptată: pagini cu tabele late,
 * grafice sau configurare. Nu e o eroare — e o graniță, cu ambele ieșiri la
 * îndemână (înapoi în zona de mobil, sau layout-ul desktop forțat).
 */
export function DesktopOnlyPage() {
  const navigate = useNavigate()
  const { role, teacherId } = useAuth()
  const home = mobileTabsFor(role, teacherId)[0] ?? null

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-line bg-card p-6 text-center">
      <div className="text-3xl" aria-hidden>
        🖥
      </div>
      <h1 className="mt-3 text-lg font-bold text-ink">Disponibil doar pe desktop</h1>
      <p className="mt-2 text-sm text-muted-2">
        Pagina asta are tabele late și grafice — se lucrează mult mai bine de pe
        laptop.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        {home && (
          <Button onClick={() => navigate(home.path)}>Mergi la {home.label}</Button>
        )}
        <Button variant="secondary" onClick={() => setForceDesktop(true)}>
          Deschide oricum versiunea desktop
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Poți reveni la versiunea mobilă din meniul contului, în rail.
      </p>
    </div>
  )
}
