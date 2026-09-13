import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Modal, Spinner } from '@/components/ui'
import { ChecklistRail } from '@/components/checklist'
import { evalueazaChecklist } from '@/lib/checklist'
import {
  ArchiveConfirmModal,
  LEXIC_SUSPENDARE,
} from '@/features/shared/ArchiveConfirmModal'
import { DeleteConfirmModal } from '@/features/shared/DeleteConfirmModal'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher, isManagerOrHigher } from '@/lib/rolesMatrix'
import {
  teacheriOptions,
  saliWithLocatie,
  locatiiOptions,
  sezoaneOptions,
} from '@/lib/lookups'
import { formatMonth } from '@/lib/format'
import type { Curs } from '@/types/db'
import { CURS_CHECKLIST, type SectiuneCurs } from '@/lib/checklist/specs/curs'
import {
  createCurs,
  updateCurs,
  getCursTeacheri,
  setCursTeacheri,
  countPrezenteCurs,
  setCursSuspendare,
  getSuspendareDeschisa,
  aplicaTriajSuspendare,
  deleteCurs,
  type TriajSuspendare,
} from '../../api'
import {
  buildCursPayload,
  initialState,
  parseOra,
  toNum,
  type FormState,
  type SetField,
} from './helpers'
import {
  LunaSuspendareField,
  lunaCurentaIso,
} from '../LunaSuspendareField'
import { TriajCursantiPanel } from '../TriajCursantiPanel'
import { DetaliiFields } from './DetaliiFields'
import { ProgramFields } from './ProgramFields'
import { TarifFields } from './TarifFields'

type Props = {
  open: boolean
  curs?: Curs | null
  onClose: () => void
  /** Deschide formularul derulat la secțiunea unui câmp lipsă (din checklist). */
  focusSection?: SectiuneCurs
  /** Apelat după ștergerea definitivă — fișa cursului nu mai există. */
  onDeleted?: () => void
}

export function CursForm({ open, curs, onClose, focusSection, onDeleted }: Props) {
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const isEdit = Boolean(curs)
  const [form, setForm] = useState<FormState>(() => initialState(curs))
  const [error, setError] = useState<string | null>(null)
  const [mutareSezonOk, setMutareSezonOk] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [lunaSuspendare, setLunaSuspendare] = useState(lunaCurentaIso)
  const [orarGolOk, setOrarGolOk] = useState(false)
  const [triaj, setTriaj] = useState<TriajSuspendare>({ tip: 'nimic' })

  // Suspendare/ștergere doar pe un curs existent. Suspendarea trece prin
  // `toggleCursSuspendat` (motiv obligatoriu + audit_log), nu prin payload-ul
  // formularului — de asta nu mai există bifa brută „Suspendat".
  const canSuspend = isEdit && isManagerOrHigher(role)
  const canDelete = isEdit && isAdminOrHigher(role)

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

  // O grupă care rămâne fără nicio zi nu se mai ține — e o suspendare scrisă pe
  // ocolite, dar fără lună, fără motiv și fără urmă în audit. Salariul ar continua
  // s-o plătească, pentru că el se uită la suspendare, nu la orar.
  const aveaZile = (curs?.zile?.length ?? 0) > 0
  const orarGolit = isEdit && aveaZile && form.zile.length === 0

  useEffect(() => {
    if (!orarGolit) setOrarGolOk(false)
  }, [orarGolit])
  const bodyRef = useRef<HTMLDivElement>(null)

  // Rosterul COMPLET de instructori, nefiltrat pe sezon. Filtrarea pe sezonul
  // cursului făcea un cerc vicios: instructorul moștenește sezonul doar prin
  // cursurile pe care le predă, deci cine n-avea încă un curs în sezonul nou nu
  // apărea în listă și nu i se putea face unul (ex. Roșca Laura, cu cursuri doar
  // în 2025-2026). Filtrul pe sezon rămâne valid la raportare, nu la atribuire.
  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri', 'roster', curs?.teacher ?? null],
    queryFn: () => teacheriOptions(null, { includeId: curs?.teacher }),
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

  // Luna suspendării curente: re-activarea nu poate porni din ea sau dinainte.
  const suspendareQ = useQuery({
    queryKey: ['curs', curs?.id, 'suspendare-deschisa'],
    queryFn: () => getSuspendareDeschisa(curs!.id),
    enabled: Boolean(curs?.id),
  })

  // Butonul urmărește EXISTENȚA unei suspendări, nu flagul „suspendat acum":
  // o oprire programată din noiembrie lasă flagul pe false, dar nu mai poate fi
  // suspendată încă o dată — se poate doar retrage.
  const suspendareDeschisa = suspendareQ.data ?? null
  const areSuspendare = Boolean(suspendareDeschisa)
  const suspendareProgramata =
    !form.suspendat && suspendareDeschisa ? suspendareDeschisa.din_luna : null

  // Suspendare → implicit luna curentă. Re-activare → prima lună de după oprire,
  // dar nu mai devreme de luna curentă.
  useEffect(() => {
    if (!suspendOpen) return
    const acum = lunaCurentaIso()
    setTriaj({ tip: 'nimic' })
    if (!suspendareQ.data) {
      setLunaSuspendare(acum)
      return
    }
    const din = suspendareQ.data.din_luna
    if (!din) return
    const [y, m] = din.split('-').map(Number)
    const urmatoarea = `${new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)}-01`
    setLunaSuspendare(urmatoarea > acum ? urmatoarea : acum)
  }, [suspendOpen, suspendareQ.data])

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

  // Capacitatea grupei = treapta sălii. O punem doar când câmpul e GOL: pe un
  // curs care are deja o capacitate, schimbarea sălii nu are voie să rescrie
  // tăcut numitorul bonusului de ocupare din salariu.
  const capacitateSala = useMemo(() => {
    const found = (sali.data ?? []).find((s) => s.id === form.sala)
    return found?.capacitate && found.capacitate > 0 ? found.capacitate : null
  }, [sali.data, form.sala])

  useEffect(() => {
    if (capacitateSala == null || form.capacitate_maxima.trim()) return
    setForm((prev) =>
      prev.capacitate_maxima.trim()
        ? prev
        : { ...prev, capacitate_maxima: String(capacitateSala) },
    )
  }, [capacitateSala, form.capacitate_maxima])

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
    if (orarGolit && !orarGolOk) {
      setError(
        'Ai scos toate zilele de curs. Asta e o suspendare — folosește „Suspendă", ca să aibă lună și motiv, sau bifează confirmarea de la Zile.',
      )
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
        {form.suspendat ? (
          <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted-2">
            ⏸ <strong className="text-ink">Curs suspendat</strong>
            {suspendareQ.data?.din_luna
              ? ` din ${formatMonth(suspendareQ.data.din_luna)}`
              : ''}
            . Din luna aia încolo nu apare în agenda zilei, nu intră în salariul
            instructorului, nu ține sala ocupată și nu se mai vinde la rezervări
            online. Prezențele se pot marca doar pe lunile dinainte. Rămâne în
            lista de cursuri, cu tot istoricul. Îl repornești cu „Re-activează".
          </div>
        ) : suspendareProgramata ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⏳ <strong>Suspendare programată din {formatMonth(suspendareProgramata)}.</strong>{' '}
            Până atunci grupa merge normal — apare în agendă și se plătește.
          </div>
        ) : null}
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
          {orarGolit && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">
                Grupa rămâne fără nicio zi de curs
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Fără zile, grupa nu mai apare în prezențe și în calendar — practic
                e suspendată, dar fără lună, fără motiv și fără urmă în audit, iar
                salariul instructorului o plătește în continuare. Dacă asta voiai,
                închide fereastra și folosește{' '}
                <strong>⏸ Suspendă</strong>.
              </p>
              <div className="mt-2">
                <Checkbox
                  id="confirma-orar-gol"
                  label="Nu e suspendare — doar golesc orarul temporar"
                  checked={orarGolOk}
                  onChange={(e) => setOrarGolOk(e.target.checked)}
                />
              </div>
            </div>
          )}
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
          <TarifFields form={form} set={set} capacitateSala={capacitateSala} />
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
    <>
      <Modal
        open={open}
        title={isEdit ? 'Editează curs' : 'Curs nou'}
        onClose={onClose}
        size="xl"
        footer={
          <>
            {(canSuspend || canDelete) && (
              <div className="mr-auto flex flex-wrap items-center gap-2">
                {canSuspend && (
                  <Button
                    variant={areSuspendare ? 'secondary' : 'ghost'}
                    onClick={() => setSuspendOpen(true)}
                    title={
                      suspendareProgramata
                        ? 'Retrage suspendarea programată'
                        : areSuspendare
                          ? 'Readu cursul în agendă, salarii și statistici'
                          : 'Scoate cursul din agendă, salarii și statistici, păstrând istoricul'
                    }
                  >
                    {suspendareProgramata
                      ? '✕ Retrage suspendarea'
                      : areSuspendare
                        ? '▶ Re-activează'
                        : '⏸ Suspendă'}
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="danger"
                    onClick={() => setDeleteOpen(true)}
                    title="Șterge definitiv cursul"
                  >
                    🗑 Șterge
                  </Button>
                )}
              </div>
            )}
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

      {suspendOpen && curs && (
        <ArchiveConfirmModal
          open
          lexic={LEXIC_SUSPENDARE}
          title={
            suspendareProgramata
              ? 'Retrage suspendarea programată'
              : areSuspendare
                ? 'Re-activează curs'
                : 'Suspendă curs'
          }
          entityLabel={curs.numele}
          archive={!areSuspendare}
          onConfirm={async (motiv) => {
            // Întâi cursanții, apoi grupa: dacă triajul cade la jumătate, grupa
            // rămâne activă și se vede ce n-a mers, în loc să rămână oprită cu
            // oamenii în aer.
            if (!areSuspendare) {
              if (triaj.tip === 'muta' && !triaj.cursNouId) {
                throw new Error('Alege grupa în care se mută cursanții.')
              }
              await aplicaTriajSuspendare({
                cursId: curs.id,
                dinLuna: lunaSuspendare,
                triaj,
                motiv,
              })
            }
            await setCursSuspendare({
              cursId: curs.id,
              suspenda: !areSuspendare,
              // Retragerea unei programări = re-activare din CHIAR luna ei; RPC-ul
              // o citește ca anulare și șterge intervalul.
              dinLuna: suspendareProgramata ?? lunaSuspendare,
              motiv,
            })
            // `cursuri.suspendat` înseamnă „suspendat ÎN LUNA CURENTĂ", nu „are o
            // suspendare": o oprire programată din noiembrie lasă grupa activă până
            // atunci. Oglindim exact ce a scris RPC-ul, altfel un „Salvează" dat
            // imediat după ar trimite înapoi un flag greșit.
            const acum = lunaCurentaIso()
            const nouFlag = !areSuspendare
              ? lunaSuspendare <= acum
              : suspendareProgramata
                ? false
                : lunaSuspendare > acum
            setForm((prev) => ({ ...prev, suspendat: nouFlag }))
            await queryClient.invalidateQueries({ queryKey: ['curs', curs.id] })
            await queryClient.invalidateQueries({ queryKey: ['cursuri'] })
            await queryClient.invalidateQueries({
              queryKey: ['curs', curs.id, 'suspendare-deschisa'],
            })
            void queryClient.invalidateQueries({ queryKey: ['plati'] })
            void queryClient.invalidateQueries({ queryKey: ['client'] })
          }}
          onClose={() => setSuspendOpen(false)}
        >
          {suspendareProgramata ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Suspendarea era programată din {formatMonth(suspendareProgramata)} și
              nu apucase să intre în vigoare. Se retrage complet — grupa rămâne
              activă, fără nicio lună neplătită.
            </p>
          ) : (
            <>
              <LunaSuspendareField
                mod={areSuspendare ? 'reactivare' : 'suspendare'}
                value={lunaSuspendare}
                onChange={setLunaSuspendare}
                minExclusiv={
                  areSuspendare ? suspendareDeschisa?.din_luna ?? null : null
                }
              />
              {!areSuspendare && (
                <TriajCursantiPanel
                  cursId={curs.id}
                  locatieId={form.locatie || null}
                  sezonId={form.sezon || null}
                  dinLuna={lunaSuspendare}
                  triaj={triaj}
                  onChange={setTriaj}
                />
              )}
            </>
          )}
        </ArchiveConfirmModal>
      )}

      {deleteOpen && curs && (
        <DeleteConfirmModal
          open
          title="Șterge definitiv curs"
          entityLabel={curs.numele}
          noun="cursul"
          alternativa="suspendă"
          onConfirm={async (force) => {
            await deleteCurs(curs.id, force)
            // Întâi ieșim din fișă, apoi invalidăm: altfel fișa rămâne montată
            // peste refetch și cere un curs care nu mai există (406 în consolă).
            onDeleted?.()
            onClose()
            void queryClient.invalidateQueries({ queryKey: ['cursuri'] })
          }}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </>
  )
}
