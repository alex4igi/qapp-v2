import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Modal, Spinner } from '@/components/ui'
import { ChecklistRail } from '@/components/checklist'
import { evalueazaChecklist } from '@/lib/checklist'
import {
  teacheriOptions,
  saliWithLocatie,
  locatiiOptions,
  sezoaneOptions,
  sezonActivId,
} from '@/lib/lookups'
import type { Curs } from '@/types/db'
import { CURS_CHECKLIST, type SectiuneCurs } from '@/lib/checklist/specs/curs'
import {
  createCurs,
  updateCurs,
  getCursTeacheri,
  setCursTeacheri,
  countPrezenteCurs,
} from '../../api'
import {
  buildCursPayload,
  initialState,
  parseOra,
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
  /** Deschide formularul derulat la secțiunea unui câmp lipsă (din checklist). */
  focusSection?: SectiuneCurs
}

export function CursForm({ open, curs, onClose, focusSection }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(curs)
  const [form, setForm] = useState<FormState>(() => initialState(curs))
  const [error, setError] = useState<string | null>(null)
  const [mutareSezonOk, setMutareSezonOk] = useState(false)

  // Gard mutare între sezoane: un curs deja predat își duce istoria cu el (înrolări,
  // prezențe), iar salariile și rapoartele se citesc pe sezonul lunii — schimbarea
  // sezonului îl scoate tăcut din lunile în care a fost ținut. S-a întâmplat pe 28 aug
  // 2026 cu 4 grupe de vară; trei instructori au rămas fără câte o grupă în fișa de
  // salariu. Pentru sezonul nou se clonează, nu se mută.
  const sezonInitial = curs?.sezon ?? ''
  const mutaSezon = isEdit && Boolean(sezonInitial) && form.sezon !== sezonInitial
  const prezenteQ = useQuery({
    queryKey: ['curs', curs?.id, 'prezente-count'],
    queryFn: () => countPrezenteCurs(curs!.id),
    enabled: Boolean(curs?.id) && mutaSezon,
  })
  const cereConfirmareMutare = mutaSezon && (prezenteQ.data ?? 0) > 0

  useEffect(() => {
    if (!mutaSezon) setMutareSezonOk(false)
  }, [mutaSezon])
  const bodyRef = useRef<HTMLDivElement>(null)

  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })

  // Teacherii se filtrează pe sezonul cursului (la curs nou: sezonul activ).
  const sezonFiltru = form.sezon || sezonActivQ.data || null
  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri', sezonFiltru, curs?.teacher ?? null],
    queryFn: () => teacheriOptions(sezonFiltru, { includeId: curs?.teacher }),
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

  // Checklist live: evaluat pe EXACT obiectul care se va salva.
  const payload = useMemo(() => buildCursPayload(form), [form])
  const checklist = useMemo(
    () => evalueazaChecklist(CURS_CHECKLIST, payload),
    [payload],
  )

  const mutation = useMutation({
    mutationFn: async () => {
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
    // Format oră: HH:MM (ex. 17:00). O oră fără minute strica calendarul.
    if (form.orarDiferit) {
      for (const zi of form.zile) {
        const v = form.orePeZi[zi]
        if (v?.trim() && !parseOra(v).ok) {
          setError(`Ora pentru ${zi} trebuie în format HH:MM (ex. 17:00).`)
          return
        }
      }
    } else if (!parseOra(form.ora).ok) {
      setError('Ora trebuie în format HH:MM (ex. 17:00).')
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
    // Fără asta, un submit dat înainte să vină numărul de prezențe trece de gard.
    if (mutaSezon && prezenteQ.isLoading) {
      setError('Se verifică istoricul grupei — încearcă din nou într-o clipă.')
      return
    }
    if (cereConfirmareMutare && !mutareSezonOk) {
      setError(
        'Cursul are prezențe înregistrate. Bifează confirmarea de la Sezon sau lasă-l în sezonul lui.',
      )
      return
    }
    mutation.mutate()
  }

  const lookupsLoading =
    (!form.sezon && sezonActivQ.isLoading) ||
    teacheri.isLoading ||
    sali.isLoading ||
    locatii.isLoading ||
    sezoane.isLoading

  // Deschidere din checklistul fișei: derulează direct la secțiunea câmpului lipsă.
  useEffect(() => {
    if (!open || !focusSection || lookupsLoading) return
    bodyRef.current
      ?.querySelector(`[data-sectiune="${focusSection}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [open, focusSection, lookupsLoading])

  const formBody = lookupsLoading ? (
    <Spinner />
  ) : (
    <div
      ref={bodyRef}
      className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]"
    >
      <form id="curs-form" onSubmit={handleSubmit} className="min-w-0 space-y-3">
        <div data-sectiune="detalii">
          <DetaliiFields
            form={form}
            set={set}
            setForm={setForm}
            teacheri={teacheri.data ?? []}
            coInstructorOptions={coInstructorOptions}
          />
        </div>
        <div data-sectiune="program">
          <ProgramFields
            form={form}
            set={set}
            setForm={setForm}
            locatii={locatii.data ?? []}
            sezoane={sezoane.data ?? []}
            saliOptions={saliOpts}
            allSali={sali.data ?? []}
            avertismentSezon={
              cereConfirmareMutare ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-900">
                    Muți o grupă care a fost deja predată
                  </p>
                  <p className="mt-1 text-sm text-amber-800">
                    Cursul are {prezenteQ.data} prezențe înregistrate, iar ele
                    rămân legate de el. După mutare grupa dispare din salariile
                    și din rapoartele lunilor în care a fost ținută, pentru că
                    acestea se citesc pe sezonul lunii. Pentru sezonul următor
                    clonează sezonul — clonarea lasă grupa de acum la locul ei.
                  </p>
                  <div className="mt-2">
                    <Checkbox
                      id="confirma-mutare-sezon"
                      label="Am înțeles, mută grupa oricum"
                      checked={mutareSezonOk}
                      onChange={(e) => setMutareSezonOk(e.target.checked)}
                    />
                  </div>
                </div>
              ) : null
            }
          />
        </div>
        <div data-sectiune="tarif">
          <TarifFields form={form} set={set} />
        </div>
        {/* Avertisment NON-BLOCANT: lipsa esențialelor nu oprește salvarea.
            Nu enumeră câmpurile — rail-ul de alături le listează deja. */}
        {checklist.lipsaEsentiale.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⚠️ {checklist.lipsaEsentiale.length}{' '}
            {checklist.lipsaEsentiale.length === 1
              ? 'câmp esențial necompletat'
              : 'câmpuri esențiale necompletate'}
            . Poți salva oricum — cursul rămâne marcat ca fișă incompletă.
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
      <ChecklistRail rezultat={checklist} />
    </div>
  )

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează curs' : 'Curs nou'}
      onClose={onClose}
      size="xl"
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
