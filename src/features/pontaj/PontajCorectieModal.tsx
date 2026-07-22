import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Button,
  Field,
  DateTimeInput,
  Select,
  TextArea,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { locatiiOptions } from '@/lib/lookups'
import { upsertManual, type PontajRow } from './api'

// timestamptz ISO -> valoarea locală cerută de DateTimeInput (YYYY-MM-DDTHH:mm)
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

type Props = {
  open: boolean
  onClose: () => void
  /** Tura editată, sau null pentru adăugare. */
  tura: PontajRow | null
  /** Obligatoriu la adăugare — la editare vine din tură. */
  userId?: string
  utilizatorLabel?: string
}

export function PontajCorectieModal({
  open,
  onClose,
  tura,
  userId,
  utilizatorLabel,
}: Props) {
  const qc = useQueryClient()
  const [start, setStart] = useState('')
  const [sfarsit, setSfarsit] = useState('')
  const [locatieId, setLocatieId] = useState('')
  const [motiv, setMotiv] = useState('')
  const [eroare, setEroare] = useState<string | null>(null)

  const locatiiQ = useQuery({ queryKey: ['locatii-options'], queryFn: locatiiOptions })

  useEffect(() => {
    if (!open) return
    setStart(toLocalInput(tura?.start_at))
    setSfarsit(toLocalInput(tura?.end_at))
    setLocatieId(tura?.locatie_id ?? '')
    setMotiv('')
    setEroare(null)
  }, [open, tura])

  const salveaza = useMutation({
    mutationFn: () =>
      upsertManual({
        id: tura?.id ?? null,
        userId: tura?.user_id ?? userId ?? '',
        start: new Date(start).toISOString(),
        end: new Date(sfarsit).toISOString(),
        locatieId,
        motiv: motiv.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pontaj'] })
      void qc.invalidateQueries({ queryKey: ['pontaj-neconfirmate'] })
      void qc.invalidateQueries({ queryKey: ['pontaj-sumar'] })
      onClose()
    },
    onError: (e) => setEroare(humanizeError(e)),
  })

  const valid =
    Boolean(start) &&
    Boolean(sfarsit) &&
    Boolean(locatieId) &&
    motiv.trim().length > 0 &&
    new Date(sfarsit) > new Date(start)

  return (
    <Modal
      open={open}
      title={tura ? 'Corectează tura' : 'Adaugă tură'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Renunță
          </Button>
          <Button
            disabled={!valid || salveaza.isPending}
            onClick={() => {
              setEroare(null)
              salveaza.mutate()
            }}
          >
            {salveaza.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-5">
        {utilizatorLabel && (
          <p className="text-sm text-quasar-gray">
            Utilizator: <span className="font-medium text-ink">{utilizatorLabel}</span>
          </p>
        )}

        <Field label="Început" htmlFor="pontaj-start">
          <DateTimeInput
            id="pontaj-start"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>

        <Field label="Sfârșit" htmlFor="pontaj-end">
          <DateTimeInput
            id="pontaj-end"
            value={sfarsit}
            onChange={(e) => setSfarsit(e.target.value)}
          />
        </Field>

        <Field label="Locație" htmlFor="pontaj-locatie">
          <Select
            id="pontaj-locatie"
            value={locatieId}
            onChange={(e) => setLocatieId(e.target.value)}
            options={locatiiQ.data ?? []}
            placeholder="Alege locația"
          />
        </Field>

        <Field label="Motivul corecției (obligatoriu)" htmlFor="pontaj-motiv">
          <TextArea
            id="pontaj-motiv"
            rows={2}
            value={motiv}
            onChange={(e) => setMotiv(e.target.value)}
            placeholder="ex. a uitat să ponteze ieșirea; plecat la 18:00"
          />
        </Field>

        <p className="text-xs text-quasar-gray">
          Orele se rotunjesc la 15 minute pe fiecare capăt. Corecția se scrie în
          audit log cu motivul de mai sus.
        </p>

        {eroare && <p className="text-sm text-red-600">{eroare}</p>}
      </div>
    </Modal>
  )
}
