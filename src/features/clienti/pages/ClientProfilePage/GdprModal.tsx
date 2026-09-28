import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Field, Modal, TextArea, TextInput } from '@/components/ui'
import { anonimizeazaClient, exportDateClient } from '../../api'

type Props = {
  open: boolean
  clientId: string
  numeClient: string
  onClose: () => void
  onAnonimizat: () => void
}

function descarcaJson(date: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(date, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function GdprModal({ open, clientId, numeClient, onClose, onAnonimizat }: Props) {
  const [motiv, setMotiv] = useState('')
  const [confirmare, setConfirmare] = useState('')
  const [exportat, setExportat] = useState(false)
  const motivOk = motiv.trim().length > 0

  const exportMut = useMutation({
    mutationFn: () => exportDateClient(clientId, motiv.trim()),
    onSuccess: (date) => {
      descarcaJson(date, `date-personale-${clientId.slice(0, 8)}.json`)
      setExportat(true)
    },
  })

  const anonimMut = useMutation({
    mutationFn: () => anonimizeazaClient(clientId, motiv.trim()),
    onSuccess: onAnonimizat,
  })

  const eroare = exportMut.error ?? anonimMut.error

  return (
    <Modal
      open={open}
      title="Date personale (GDPR)"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Închide
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Cererea (de la cine, când, pe ce canal)" htmlFor="gdpr-motiv">
          <TextArea
            id="gdpr-motiv"
            rows={2}
            placeholder="Ex: email de la mamă, 28.09.2026 — cere copia datelor"
            value={motiv}
            onChange={(e) => setMotiv(e.target.value)}
          />
        </Field>

        <section className="rounded-md border border-line p-3">
          <h3 className="text-sm font-semibold text-ink">Copia datelor</h3>
          <p className="mt-1 text-sm text-muted-2">
            Un fișier cu tot ce avem despre {numeClient}: fișă, familie, înscrieri, prezențe,
            plăți, contracte, mesaje trimise. Îl trimiți omului pe adresa din cerere.
          </p>
          <Button
            className="mt-2"
            variant="secondary"
            disabled={!motivOk || exportMut.isPending}
            onClick={() => exportMut.mutate()}
          >
            {exportMut.isPending ? 'Se pregătește…' : exportat ? 'Descărcat ✓' : 'Descarcă datele'}
          </Button>
        </section>

        <section className="rounded-md border border-red-200 bg-red-50 p-3">
          <h3 className="text-sm font-semibold text-red-800">Ștergere la cerere</h3>
          <p className="mt-1 text-sm text-red-700">
            Numele, telefoanele, emailul, notele și fișierele se șterg definitiv; plățile și
            prezențele rămân fără nume, pentru contabilitate. Nu se poate face dacă are datorie
            sau o înscriere în curs. <strong>Nu se poate anula.</strong>
          </p>
          <Field label='Scrie „ȘTERGE" ca să confirmi' htmlFor="gdpr-confirmare">
            <TextInput
              id="gdpr-confirmare"
              value={confirmare}
              onChange={(e) => setConfirmare(e.target.value)}
            />
          </Field>
          <Button
            className="mt-2"
            variant="danger"
            disabled={!motivOk || confirmare.trim().toUpperCase() !== 'ȘTERGE' || anonimMut.isPending}
            onClick={() => anonimMut.mutate()}
          >
            {anonimMut.isPending ? 'Se șterge…' : 'Șterge datele personale'}
          </Button>
        </section>

        {eroare && <p className="text-sm text-red-700">{(eroare as Error).message}</p>}
      </div>
    </Modal>
  )
}
