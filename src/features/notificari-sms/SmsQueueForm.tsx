import { humanizeError } from '@/lib/errorMessage'
import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { locatiiOptions } from '@/lib/lookups'
import { formatRoMobile } from '@/lib/phone'
import { faraDiacritice } from './templates'
import { createSmsQueueEntry } from './api'

type Props = {
  open: boolean
  onClose: () => void
}

export function SmsQueueForm({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const [telefon, setTelefon] = useState('')
  const [mesaj, setMesaj] = useState('')
  const [locatie, setLocatie] = useState('')
  const [dataPlanificata, setDataPlanificata] = useState('')
  const [error, setError] = useState<string | null>(null)

  const locatii = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const save = useMutation({
    mutationFn: () =>
      createSmsQueueEntry({
        telefon: formatRoMobile(telefon) ?? telefon.trim(),
        mesaj: faraDiacritice(mesaj.trim()),
        cod_mesaj: 'mesaj_liber',
        locatie: locatie || null,
        data_planificata: dataPlanificata || null,
        status: 'De trimis',
        clienti_vizati: [],
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sms-queue'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!telefon.trim()) {
      setError('Telefonul este obligatoriu.')
      return
    }
    if (!formatRoMobile(telefon)) {
      setError('Număr de telefon invalid (format așteptat: 07XXXXXXXX).')
      return
    }
    if (!mesaj.trim()) {
      setError('Mesajul este obligatoriu.')
      return
    }
    save.mutate()
  }

  return (
    <Modal
      open={open}
      title="Adaugă SMS în coadă"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="sms-queue-form"
            disabled={save.isPending}
          >
            {save.isPending ? 'Se salvează…' : 'Adaugă în coadă'}
          </Button>
        </>
      }
    >
      <form id="sms-queue-form" onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefon" required htmlFor="sms-telefon">
            <TextInput
              id="sms-telefon"
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              placeholder="07xx xxx xxx"
            />
          </Field>
          <Field label="Data planificată" htmlFor="sms-data">
            <DateInput
              id="sms-data"
              value={dataPlanificata}
              onChange={(e) => setDataPlanificata(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Locație" htmlFor="sms-locatie">
          <Select
            id="sms-locatie"
            placeholder="—"
            options={locatii.data ?? []}
            value={locatie}
            onChange={(e) => setLocatie(e.target.value)}
          />
        </Field>

        <Field label="Mesaj" required htmlFor="sms-mesaj">
          <TextArea
            id="sms-mesaj"
            rows={4}
            value={mesaj}
            onChange={(e) => setMesaj(e.target.value)}
            placeholder="Textul SMS-ului (fără diacritice — se strică pe telefon)…"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
