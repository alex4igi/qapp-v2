import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextArea, Button } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { decideReziliere } from './api'
import type { CazAbsenta } from './types'

type Props = { caz: CazAbsenta | null; onClose: () => void }

// Pasul managerului după „fără răspuns": trei încercări de contact eșuate și 45 de zile
// fără prezență. Rezilierea anulează doar lunile fără prezențe și fără bani încasați.
export function DecizieManagerModal({ caz, onClose }: Props) {
  const queryClient = useQueryClient()
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setNota('')
    setError(null)
  }, [caz])

  const decide = useMutation({
    meta: { erroareAfisata: true },
    mutationFn: (reziliaza: boolean) =>
      decideReziliere({ absentaId: caz!.id, reziliaza, nota: nota.trim() || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['absente-21z'] })
      void queryClient.invalidateQueries({ queryKey: ['notificari'] })
      void queryClient.invalidateQueries({ queryKey: ['client', caz?.client_id] })
      onClose()
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Decizia nu s-a salvat.')),
  })

  if (!caz) return null
  const luni = caz.luni_de_reziliat ?? 0

  return (
    <Modal
      open
      title={`Reziliere de confirmat — ${caz.client_nume}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => decide.mutate(false)} disabled={decide.isPending}>
            Păstrează locul
          </Button>
          <Button variant="danger" onClick={() => decide.mutate(true)} disabled={decide.isPending || luni === 0}>
            {decide.isPending ? 'Se salvează…' : `Reziliază ${luni === 1 ? '1 lună' : `${luni} luni`}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-md bg-quasar-gray-light px-3 py-2">
          {caz.curs_nume}
          {caz.locatie_nume && <span className="text-quasar-gray"> · {caz.locatie_nume}</span>}
          <div className="mt-0.5 text-quasar-gray">
            {caz.ultima_prezenta ? `Ultima prezență: ${caz.ultima_prezenta}` : 'N-a venit deloc în sezonul ăsta'}
            {caz.telefon && ` · ${caz.telefon}`}
          </div>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-quasar-black">
          <li>Două apeluri la o săptămână distanță, fără răspuns.</li>
          <li>
            SMS „nu v-am putut prinde la telefon"
            {caz.sms_fara_raspuns_la ? ` trimis pe ${caz.sms_fara_raspuns_la.slice(0, 10)}` : ''}
            {caz.sms_fara_raspuns_eroare ? ` — nu a plecat (${caz.sms_fara_raspuns_eroare})` : ''}.
          </li>
          <li>Nicio prezență de atunci.</li>
        </ul>
        <p>
          <strong>Reziliază</strong> anulează {luni === 1 ? 'luna' : `cele ${luni} luni`} fără nicio prezență și fără
          bani încasați, până la finalul sezonului. Lunile cu prezențe rămân cu datoria lor. În noaptea care urmează
          copilul trece EXclient și intră în Nurture.
        </p>
        <p className="text-quasar-gray">
          <strong>Păstrează locul</strong> închide cazul fără nicio schimbare la înscriere.
        </p>
        <Field label="Notă (opțional)" htmlFor="dm-nota">
          <TextArea
            id="dm-nota"
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="ex: am vorbit cu mama pe WhatsApp, revine în ianuarie"
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
