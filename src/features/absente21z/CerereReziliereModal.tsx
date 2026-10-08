import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Modal, Button } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { getEmailFamilie, trimiteCerereReziliere } from './api'

type Props = {
  client: { id: string; nume: string } | null
  /** true = pasul de după rezilierea din caz; false = deschis din Istoric. */
  dupaReziliere?: boolean
  onClose: () => void
}

const STATUS_EXISTENT: Record<string, string> = {
  trimis: 'trimisă, încă nedeschisă',
  deschis: 'deschisă de familie, încă nesemnată',
  semnat: 'semnată',
  finalizat: 'semnată și pusă la dosar',
}

// Rezilierea e deja valabilă; cererea semnată e doar pentru dosar. Părintele o montează
// cu `key` pe client, ca rezultatul unei trimiteri să nu rămână la următorul.
export function CerereReziliereModal({ client, dupaReziliere, onClose }: Props) {
  const trimite = useMutation({
    meta: { erroareAfisata: true },
    mutationFn: () => trimiteCerereReziliere(client!.id),
  })
  const email = useQuery({
    queryKey: ['absente-21z', 'email-familie', client?.id],
    queryFn: () => getEmailFamilie(client!.id),
    enabled: Boolean(client),
  })
  const faraEmail = email.isSuccess && !email.data

  // După reziliere, fără email pasul n-are rost: nu se trimite nimic.
  useEffect(() => {
    if (dupaReziliere && faraEmail) onClose()
  }, [dupaReziliere, faraEmail, onClose])

  if (!client || email.isLoading || (dupaReziliere && faraEmail)) return null
  const r = trimite.data

  let rezultat: string | null = null
  if (r?.statusExistent) {
    rezultat = `Există deja o cerere de reziliere pentru ${client.nume}: ${STATUS_EXISTENT[r.statusExistent] ?? r.statusExistent}. N-am trimis-o din nou.`
  } else if (r?.ok) {
    rezultat = r.notificat
      ? `Cererea a plecat pe email${email.data ? ` la ${email.data}` : ''}. O găsești și în Contracte.`
      : `Cererea e creată în Contracte, dar emailul nu a plecat${r.notificareEroare ? `: ${r.notificareEroare}` : ''}. Retrimite linkul de acolo.`
  }

  return (
    <Modal
      open
      title={`Cerere de reziliere — ${client.nume}`}
      onClose={onClose}
      footer={
        r || faraEmail ? (
          <Button onClick={onClose}>Închide</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {dupaReziliere ? 'Mai târziu' : 'Anulează'}
            </Button>
            <Button onClick={() => trimite.mutate()} disabled={trimite.isPending}>
              {trimite.isPending ? 'Se trimite…' : '📄 Trimite cererea la semnat'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3 text-sm">
        {dupaReziliere && !r && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
            Rezilierea s-a înregistrat și e valabilă de acum.
          </p>
        )}
        {!r && !faraEmail && (
          <p>
            Pentru dosar, familia primește pe email ({email.data}) cererea de reziliere de completat și semnat
            online. Semnătura nu condiționează rezilierea.
          </p>
        )}
        {faraEmail && (
          <p className="rounded-md bg-quasar-gray-light px-3 py-2">
            Familia nu are email în fișă, așa că cererea nu se trimite. Rezilierea rămâne valabilă.
          </p>
        )}
        {rezultat && <p className="rounded-md bg-quasar-gray-light px-3 py-2">{rezultat}</p>}
        {trimite.error && (
          <p className="text-red-600">{humanizeError(trimite.error, 'Cererea nu s-a trimis.')}</p>
        )}
      </div>
    </Modal>
  )
}
