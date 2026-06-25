import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Field, DateInput, Select, Button } from '@/components/ui'
import { VacantaWarning } from '@/features/shared/VacantaWarning'
import { locatiiOptions, sezonActivId } from '@/lib/lookups'
import type { Lead, GrupaLead } from '@/types/db'
import {
  GRUPE,
  GRUPA_LABELS,
  GRUPA_TO_VARSTA_CURS,
  ZILE_SAPTAMANA,
} from './constants'
import {
  updateLead,
  listCursuriProgramabile,
  listEvenimenteProgramabile,
  createProgramareLead,
} from './api'

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
  // Valoare prefixată: `curs:<id>` sau `ev:<id>`.
  const [selectie, setSelectie] = useState('')
  const [error, setError] = useState<string | null>(null)

  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
    enabled: open,
  })
  const cursuri = useQuery({
    queryKey: ['cursuri', 'programabile', sezonActivQ.data ?? null],
    queryFn: () => listCursuriProgramabile(sezonActivQ.data ?? null),
    enabled: open && sezonActivQ.isSuccess,
  })
  const evenimente = useQuery({
    queryKey: ['evenimente', 'programabile', dataProgramare],
    queryFn: () => listEvenimenteProgramabile(dataProgramare),
    enabled: open && Boolean(dataProgramare),
  })
  const locatii = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
    enabled: open,
  })

  useEffect(() => {
    if (!open || !lead) return
    setDataProgramare(
      lead.data_programare ? lead.data_programare.slice(0, 10) : '',
    )
    setGrupa(lead.grupa_varsta ?? '')
    setDataNasterii(lead.data_nasterii ?? '')
    setSelectie('')
    setError(null)
  }, [open, lead])

  // Locația preferată a lead-ului → uuid (programari_leads.locatie e FK).
  const leadLocatieId = useMemo(() => {
    if (!lead?.locatia) return null
    return (
      locatii.data?.find((l) => l.label === lead.locatia)?.value ?? null
    )
  }, [lead?.locatia, locatii.data])

  const weekday = dataProgramare
    ? ZILE_SAPTAMANA[new Date(dataProgramare).getDay()]
    : null

  // Cursurile filtrate după grupă + ziua programării + locația lead-ului.
  const cursuriFiltrate = useMemo(() => {
    const all = cursuri.data ?? []
    const varstaCurs = grupa
      ? GRUPA_TO_VARSTA_CURS[grupa as GrupaLead]
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
  }, [cursuri.data, grupa, weekday, leadLocatieId])

  // Opțiunile dropdown-ului: cursurile din zi (prefix `curs:`) + evenimentele din
  // ziua aleasă (prefix `ev:`). Evenimentele apar grupate separat, etichetate.
  const optiuni = useMemo(() => {
    const cursOpts = cursuriFiltrate.list.map((c) => ({
      label: c.numele,
      value: `curs:${c.id}`,
    }))
    const evOpts = (evenimente.data ?? []).map((e) => ({
      label: `${e.nume_eveniment} (eveniment)`,
      value: `ev:${e.id}`,
    }))
    return [...cursOpts, ...evOpts]
  }, [cursuriFiltrate.list, evenimente.data])

  // Rezolvă ora din selecția curentă (curs: din ore_pe_zi[zi] ori ora; eveniment: ora).
  const resolveSelectie = (): {
    cursId: string | null
    evenimentId: string | null
    ora: string | null
    locatie: string | null
  } | null => {
    if (!selectie) return null
    if (selectie.startsWith('curs:')) {
      const id = selectie.slice(5)
      const curs = cursuri.data?.find((c) => c.id === id)
      const ora =
        (weekday && curs?.ore_pe_zi?.[weekday]) || curs?.ora || null
      return {
        cursId: id,
        evenimentId: null,
        ora,
        locatie: curs?.locatie ?? leadLocatieId,
      }
    }
    const id = selectie.slice(3)
    const ev = evenimente.data?.find((e) => e.id === id)
    return { cursId: null, evenimentId: id, ora: ev?.ora ?? null, locatie: leadLocatieId }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const sel = resolveSelectie()!
      await updateLead(lead!.id, {
        status: 'programat',
        data_programare: dataProgramare,
        grupa_varsta: grupa,
        data_nasterii: dataNasterii,
      })
      await createProgramareLead({
        lead: lead!.id,
        cursul_programat: sel.cursId,
        eveniment_programat: sel.evenimentId,
        locatie: sel.locatie,
        data_programarii: dataProgramare.slice(0, 10),
        ora: sel.ora,
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
      setError('Data este obligatorie.')
      return
    }
    const azi = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local
    if (dataProgramare < azi) {
      setError('Programarea nu poate fi în trecut.')
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
    if (!selectie) {
      setError('Selectează cursul sau evenimentul.')
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
          <Field label="Data" required htmlFor="sch-data">
            <DateInput
              id="sch-data"
              value={dataProgramare}
              onChange={(e) => setDataProgramare(e.target.value)}
            />
          </Field>
          <Field label="Data nașterii" required htmlFor="sch-nastere">
            <DateInput
              id="sch-nastere"
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

        <Field label="Curs / eveniment" required htmlFor="sch-curs">
          <Select
            id="sch-curs"
            placeholder={
              cursuri.isLoading ? 'Se încarcă…' : '— selectează —'
            }
            options={optiuni}
            value={selectie}
            onChange={(e) => setSelectie(e.target.value)}
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
