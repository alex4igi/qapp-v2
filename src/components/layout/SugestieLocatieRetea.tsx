import { useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { ADMIN_OR_OWNER } from '@/lib/rolesMatrix'

const RASPUNS_KEY = 'qapp.sugestie_retea'

// Ziua locală (nu UTC), ca răspunsul de aseară să nu treacă peste miezul nopții.
function cheieAzi(locatie: string): string {
  const d = new Date()
  const zi = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  return `${zi}|${locatie}`
}

function citesteRaspuns(): string | null {
  try {
    return localStorage.getItem(RASPUNS_KEY)
  } catch {
    return null
  }
}

// Omul e pe rețeaua altei locații decât cea din bara de sus: îi propunem s-o
// schimbe, nu o schimbăm noi (Alex, 4 oct. 2026 — fiecare s-a obișnuit cu bara lui).
// Un răspuns ține o zi pe rețeaua aceea; pe altă rețea întrebăm din nou.
// Admin+ nu încasează la recepție, deci nu-i propunem nimic (Alex, 10 oct. 2026).
export function SugestieLocatieRetea() {
  const { role } = useAuth()
  const { locatieId, locatieNume, locatieRetea, locatieReteaNume, setLocatieId } =
    useWorkingLocatie()
  const [raspuns, setRaspuns] = useState(citesteRaspuns)

  if (role === 'teacher' || (role && ADMIN_OR_OWNER.includes(role))) return null
  if (!locatieRetea || !locatieReteaNume) return null
  if (locatieId === locatieRetea || raspuns === cheieAzi(locatieRetea)) return null

  const raspunde = (schimba: boolean) => {
    const cheie = cheieAzi(locatieRetea)
    try {
      localStorage.setItem(RASPUNS_KEY, cheie)
    } catch {
      /* fără localStorage întrebăm din nou la reîncărcare */
    }
    setRaspuns(cheie)
    if (schimba) setLocatieId(locatieRetea)
  }

  return (
    <Modal
      open
      title={`Ești la ${locatieReteaNume}?`}
      onClose={() => raspunde(false)}
      footer={
        <>
          <Button variant="secondary" onClick={() => raspunde(false)}>
            Rămân pe {locatieNume ?? 'toate locațiile'}
          </Button>
          <Button onClick={() => raspunde(true)}>Treci pe {locatieReteaNume}</Button>
        </>
      }
    >
      <p className="text-sm text-ink">
        Calculatorul e conectat la rețeaua de la <strong>{locatieReteaNume}</strong>, dar bara de sus
        e pe <strong>{locatieNume ?? 'toate locațiile'}</strong>.
      </p>
      <p className="mt-2 text-sm text-ink">
        Plățile se înregistrează la locația din bara de sus. Dacă încasezi azi aici, treci pe{' '}
        {locatieReteaNume}.
      </p>
    </Modal>
  )
}
