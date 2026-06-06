import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, TextInput, Select, Button } from '@/components/ui'
import { VacantaWarning } from '@/features/shared/VacantaWarning'
import { locatiiOptions } from '@/lib/lookups'
import type { Lead, GrupaLead } from '@/types/db'
import {
  GRUPE,
  GRUPA_LABELS,
  GRUPA_TO_VARSTA_CURS,
  ZILE_SAPTAMANA,
} from './constants'
import { updateLead, listCursuriProgramabile, createProgramareLead } from './api'

type Props = {
  open: boolean
  lead: Lead | null
  onClose: () => void
}

export function ScheduleModal({ open, lead, onClose }: Props) {
  const queryClient = useQueryClient()
  const [dataProgramare, setDataProgramare] = useState('')
  const [grupa, setGrupa] = useState('')
  const [dataNasterii, setDataNasterii] = useState('')
  const [cursId, setCursId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cursuri = useQuery({
    queryKey: ['cursuri', 'programabile'],
    queryFn: listCursuriProgramabile,
    enabled: open,
  })
  const locatii = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
    enabled: open,
  })

  useEffect(() => {
    if (!open || !lead) return
    setDataProgramare(
      lead.data_programare ? lead.data_programare.slice(0, 16) : '',
    )
    setGrupa(lead.grupa_varsta ?? '')
    setDataNasterii(lead.data_nasterii ?? '')
    setCursId('')
    setError(null)
  }, [open, lead])

  // Locația preferată a lead-ului → uuid (programari_leads.locatie e FK).
  const leadLocatieId = useMemo(() => {
    if (!lead?.locatia) return null
    return (
      locatii.data?.find((l) => l.label === lead.locatia)?.value ?? null
    )
  }, [lead?.locatia, locatii.data])

  // Cursurile filtrate după grupă + ziua programării + locația lead-ului.
  const cursuriFiltrate = useMemo(() => {
    const all = cursuri.data ?? []
    const varstaCurs = grupa
      ? GRUPA_TO_VARSTA_CURS[grupa as GrupaLead]
      : null
    const weekday = dataProgramare
      ? ZILE_SAPTAMANA[new Date(dataProgramare).getDay()]
      : null
    const filtered = all.filter((c) => {
      if (varstaCurs && c.varsta && c.varsta !== varstaCurs && c.varsta !== 'Mixt')
        return false
      if (weekday && c.zile?.length && !c.zile.includes(weekday)) return false
      if (leadLocatieId && c.locatie && c.locatie !== leadLocatieId)
        return false
      return true
    })
    return { list: filtered.length ? filtered : all, fallback: !filtered.length }
  }, [cursuri.data, grupa, dataProgramare, leadLocatieId])

  const mutation = useMutation({
    mutationFn: async () => {
      await updateLead(lead!.id, {
        status: 'programat',
        data_programare: dataProgramare,
        grupa_varsta: grupa,
        data_nasterii: dataNasterii,
      })
      const curs = cursuri.data?.find((c) => c.id === cursId)
      await createProgramareLead({
        lead: lead!.id,
        cursul_programat: cursId,
        locatie: curs?.locatie ?? leadLocatieId,
        data_programarii: dataProgramare.slice(0, 10),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!dataProgramare) {
      setError('Data și ora sunt obligatorii.')
      return
    }
    if (new Date(dataProgramare) <= new Date()) {
      setError('Programarea trebuie să fie în viitor.')
      return
    }
    if (!grupa) {
      setError('Grupa de vârstă este obligatorie.')
      return
    }
    if (!dataNasterii) {
      setError('Data nașterii este obligatorie la programare.')
      return
    }
    if (!cursId) {
      setError('Selectează cursul.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title="Programează ședință gratuită"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button
            type="submit"
            form="schedule-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Se salvează…' : 'Confirmă programarea'}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={handleSubmit} className="space-y-3">
        {lead && (
          <p className="text-sm text-quasar-gray">
            Programare pentru{' '}
            <span className="font-medium text-quasar-black">
              {[lead.prenume, lead.nume].filter(Boolean).join(' ')}
            </span>
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data și ora" required htmlFor="sch-data">
            <TextInput
              id="sch-data"
              type="datetime-local"
              value={dataProgramare}
              onChange={(e) => setDataProgramare(e.target.value)}
            />
          </Field>
          <Field label="Data nașterii" required htmlFor="sch-nastere">
            <TextInput
              id="sch-nastere"
              type="date"
              value={dataNasterii}
              onChange={(e) => setDataNasterii(e.target.value)}
            />
          </Field>
        </div>

        <VacantaWarning data={dataProgramare} />

        <Field label="Grupă vârstă" required htmlFor="sch-grupa">
          <Select
            id="sch-grupa"
            placeholder="— selectează —"
            options={GRUPE.map((g) => ({ label: GRUPA_LABELS[g], value: g }))}
            value={grupa}
            onChange={(e) => setGrupa(e.target.value)}
          />
        </Field>

        <Field label="Curs" required htmlFor="sch-curs">
          <Select
            id="sch-curs"
            placeholder={
              cursuri.isLoading ? 'Se încarcă…' : '— selectează cursul —'
            }
            options={cursuriFiltrate.list.map((c) => ({
              label: c.numele,
              value: c.id,
            }))}
            value={cursId}
            onChange={(e) => setCursId(e.target.value)}
          />
        </Field>
        {cursuriFiltrate.fallback && (grupa || dataProgramare) && (
          <p className="text-xs text-amber-600">
            Niciun curs nu se potrivește cu grupa/ziua/locația — se afișează
            toate cursurile active.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
