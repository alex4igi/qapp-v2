import { useMutation } from '@tanstack/react-query'
import { Modal, Button } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { trimiteCerereReziliere } from './api'

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

  if (!client) return null
  const r = trimite.data

  let rezultat: string | null = null
  if (r?.statusExistent) {
    rezultat = `Există deja o cerere de reziliere pentru ${client.nume}: ${STATUS_EXISTENT[r.statusExistent] ?? r.statusExistent}. N-am trimis-o din nou.`
  } else if (r?.ok) {
    const canal = r.canal === 'email' ? 'pe email' : r.canal === 'sms' ? 'prin SMS (familia n-are email)' : ''
    rezultat = r.notificat
      ? `Cererea a plecat ${canal}. O găsești și în Contracte.`
      : r.amanat
        ? `Cererea e creată; SMS-ul pleacă dimineață (ore de liniște). O găsești în Contracte.`
        : `Cererea e creată în Contracte, dar mesajul nu a plecat${r.notificareEroare ? `: ${r.notificareEroare}` : ''}. Retrimite linkul de acolo.`
  }

  return (
    <Modal
      open
      title={`Cerere de reziliere — ${client.nume}`}
      onClose={onClose}
      footer={
        r ? (
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
        {!r && (
          <p>
            Pentru dosar, familia primește cererea de reziliere de completat și semnat online —{' '}
            <strong>pe email</strong>, sau prin SMS dacă n-are email în fișă. Semnătura nu condiționează rezilierea.
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
