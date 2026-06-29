import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal, Spinner } from '@/components/ui'
import {
  teacheriOptions,
  saliWithLocatie,
  locatiiOptions,
  sezoaneOptions,
  sezonActivId,
} from '@/lib/lookups'
import type { Curs } from '@/types/db'
import {
  createCurs,
  updateCurs,
  getCursTeacheri,
  setCursTeacheri,
} from '../../api'
import {
  initialState,
  toNum,
  type FormState,
  type SetField,
} from './helpers'
import { DetaliiFields } from './DetaliiFields'
import { ProgramFields } from './ProgramFields'
import { TarifFields } from './TarifFields'

type Props = {
  open: boolean
  curs?: Curs | null
  onClose: () => void
}

export function CursForm({ open, curs, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(curs)
  const [form, setForm] = useState<FormState>(() => initialState(curs))
  const [error, setError] = useState<string | null>(null)

  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })

  // Teacherii se filtrează pe sezonul cursului (la curs nou: sezonul activ).
  const sezonFiltru = form.sezon || sezonActivQ.data || null
  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri', sezonFiltru],
    queryFn: () => teacheriOptions(sezonFiltru),
    enabled: Boolean(form.sezon) || sezonActivQ.isSuccess,
  })
  const sali = useQuery({
    queryKey: ['lookup', 'sali-with-locatie'],
    queryFn: saliWithLocatie,
  })
  const locatii = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })
  const sezoane = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
  })

  // La editarea unui curs existent, încarcă asocierile M:N pentru a precompleta co-instructorul
  const cursTeacheriQ = useQuery({
    queryKey: ['curs', curs?.id, 'teacheri'],
    queryFn: () => getCursTeacheri(curs!.id),
    enabled: Boolean(curs?.id),
  })

  // Precompletează `coInstructor` din M:N (rol='asistent') la prima încărcare
  useEffect(() => {
    if (!cursTeacheriQ.data) return
    const asistent = cursTeacheriQ.data.find((r) => r.rol === 'asistent')
    if (asistent) {
      setForm((prev) =>
        prev.coInstructor ? prev : { ...prev, coInstructor: asistent.teacher_id },
      )
    }
  }, [cursTeacheriQ.data])

  // Backfill locatie din sala (pentru cursurile vechi fără locatie persistată)
  useEffect(() => {
    if (!sali.data || form.locatie || !form.sala) return
    const found = sali.data.find((s) => s.id === form.sala)
    if (found?.locatie) {
      setForm((prev) => ({ ...prev, locatie: found.locatie ?? '' }))
    }
  }, [sali.data, form.sala, form.locatie])

  const saliOpts = useMemo(() => {
    const rows = sali.data ?? []
    const filtered = form.locatie
      ? rows.filter((s) => s.locatie === form.locatie)
      : rows
    return filtered.map((s) => ({ value: s.id, label: s.nume }))
  }, [sali.data, form.locatie])

  // Co-instructorul nu poate fi același cu principalul
  const coInstructorOptions = useMemo(
    () =>
      (teacheri.data ?? []).filter(
        (t) => !form.teacher || t.value !== form.teacher,
      ),
    [teacheri.data, form.teacher],
  )

  const set: SetField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: async () => {
      const isTrupa = form.tip === 'recurent-trupa'
      const nivelFinal = isTrupa ? 'Trupa' : form.nivelul || null
      // Orar diferit pe zile: păstrează doar zilele selectate cu oră completată.
      // `ora` rămâne populat (cu prima zi) ca fallback pentru căile vechi.
      const orePeZi = form.orarDiferit
        ? Object.fromEntries(
            form.zile
              .filter((z) => form.orePeZi[z]?.trim())
              .map((z) => [z, form.orePeZi[z].trim()]),
          )
        : null
      const orePeZiFinal = orePeZi && Object.keys(orePeZi).length ? orePeZi : null
      const oraFinal = orePeZiFinal
        ? Object.values(orePeZiFinal)[0]
        : form.ora.trim() || null
      const payload = {
        numele: form.numele.trim(),
        stil: form.stil.trim() || null,
        nivelul: nivelFinal as Curs['nivelul'],
        varsta: (form.varsta || null) as Curs['varsta'],
        teacher: form.teacher || null,
        locatie: form.locatie || null,
        sala: form.sala || null,
        sezon: form.sezon || null,
        zile: (form.zile.length ? form.zile : null) as Curs['zile'],
        ora: oraFinal,
        ore_pe_zi: orePeZiFinal as Curs['ore_pe_zi'],
        link_whatsapp: form.link_whatsapp.trim() || null,
        durata_cursului: toNum(form.durata_cursului),
        capacitate_maxima: toNum(form.capacitate_maxima),
        pret_anual: toNum(form.pret_anual),
        pret_lunar: toNum(form.pret_lunar),
        pret_sedinta: toNum(form.pret_sedinta),
        pret_sedinta_reziliere:
          form.tip === 'facultativ' ? null : toNum(form.pret_sedinta_reziliere),
        pret_lunar_promo:
          form.tip === 'facultativ' ? null : toNum(form.pret_lunar_promo),
        facultativ: form.tip === 'facultativ',
        one_time: form.one_time,
        suspendat: form.suspendat,
      }
      const saved = isEdit
        ? await updateCurs(curs!.id, payload)
        : await createCurs(payload)
      // Sincronizează asocierile M:N (titular = principal, asistent = co-instructor)
      await setCursTeacheri({
        cursId: saved.id,
        principalId: form.teacher || null,
        coInstructorId: form.coInstructor || null,
      })
      return saved
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cursuri'] })
      if (isEdit) {
        void queryClient.invalidateQueries({ queryKey: ['curs', curs!.id] })
        void queryClient.invalidateQueries({
          queryKey: ['curs', curs!.id, 'teacheri'],
        })
      }
      onClose()
    },
    onError: (e: unknown) => {
      setError(humanizeError(e, 'Eroare la salvare.'))
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.numele.trim()) {
      setError('Numele cursului este obligatoriu.')
      return
    }
    // Toate sumele sunt obligatorii (>0), mai puțin prețul anual la facultativ.
    const pos = (s: string) => {
      const n = toNum(s)
      return n != null && n > 0
    }
    if (!pos(form.pret_lunar)) {
      setError('Prețul lunar este obligatoriu și trebuie să fie mai mare ca 0.')
      return
    }
    if (!pos(form.pret_sedinta)) {
      setError('Prețul pe ședință este obligatoriu și trebuie să fie mai mare ca 0.')
      return
    }
    if (form.tip !== 'facultativ') {
      if (!pos(form.pret_anual)) {
        setError('Prețul anual este obligatoriu pentru cursurile recurente.')
        return
      }
      if (!pos(form.pret_sedinta_reziliere)) {
        setError(
          'Prețul ședință (reziliere) este obligatoriu pentru cursurile recurente.',
        )
        return
      }
    }
    mutation.mutate()
  }

  const lookupsLoading =
    (!form.sezon && sezonActivQ.isLoading) ||
    teacheri.isLoading ||
    sali.isLoading ||
    locatii.isLoading ||
    sezoane.isLoading

  const formBody = lookupsLoading ? (
    <Spinner />
  ) : (
    <form id="curs-form" onSubmit={handleSubmit} className="space-y-3">
      <DetaliiFields
        form={form}
        set={set}
        setForm={setForm}
        teacheri={teacheri.data ?? []}
        coInstructorOptions={coInstructorOptions}
      />
      <ProgramFields
        form={form}
        set={set}
        setForm={setForm}
        locatii={locatii.data ?? []}
        sezoane={sezoane.data ?? []}
        saliOptions={saliOpts}
        allSali={sali.data ?? []}
      />
      <TarifFields form={form} set={set} />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează curs' : 'Curs nou'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="curs-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      {formBody}
    </Modal>
  )
}
