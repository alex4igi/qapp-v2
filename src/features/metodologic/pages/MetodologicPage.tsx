import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { humanizeError } from '@/lib/errorMessage'
import { Badge, Button, Field, Modal, PageHeader, Select, Spinner, TextInput } from '@/components/ui'
import {
  addCalendarRand,
  calendarComplet,
  deleteCalendarRand,
  duplicaStructuraSezon,
  getCalendarSezon,
  getProgresAdmin,
  getSezonEtichete,
  ordoneazaCalendar,
  updateCalendarRand,
  type CalendarInput,
} from '../api'
import { CalendarEditModal } from '../modals/CalendarEditModal'
import { GHID_ACTIVITATI } from '../constants'
import type { ProgresAdmin, SezonCalendarRand } from '../types'

function formatInterval(r: SezonCalendarRand): string {
  if (!r.data_incepere || !r.data_final) return '— fără date —'
  const f = (iso: string) =>
    new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: '2-digit' })
  return `${f(r.data_incepere)} → ${f(r.data_final)}`
}

/* ── 1. Calendarul sezonului ──────────────────────────────────────────────── */
function CalendarSection({
  sezon,
  randuri,
  onRefresh,
}: {
  sezon: string
  randuri: SezonCalendarRand[]
  onRefresh: () => void
}) {
  const [editat, setEditat] = useState<SezonCalendarRand | null>(null)
  const stare = calendarComplet(randuri)
  const ordonate = ordoneazaCalendar(randuri)

  const salveaza = async (patch: CalendarInput) => {
    if (!editat) return
    await updateCalendarRand(editat.id, patch)
    onRefresh()
  }

  const sterge = async () => {
    if (!editat) return
    await deleteCalendarRand(editat.id)
    setEditat(null)
    onRefresh()
  }

  const adauga = async (tip: 'modul' | 'vacanta') => {
    const existente = randuri.filter((r) => r.tip === tip)
    const numar = Math.max(0, ...existente.map((r) => r.numar)) + 1
    await addCalendarRand(sezon, tip, numar, {
      nume: `${tip === 'modul' ? 'MODUL' : 'VACANȚĂ'} ${numar}`,
      nota: null,
      data_incepere: null,
      data_final: null,
    })
    onRefresh()
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-ink">1 · Calendarul sezonului</h2>
          <Badge tone={stare.gata ? 'success' : 'warn'}>
            {stare.moduleCuDate}/{stare.moduleTotal} module cu date
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => adauga('modul')}>
            + Modul
          </Button>
          <Button variant="ghost" onClick={() => adauga('vacanta')}>
            + Vacanță
          </Button>
        </div>
      </div>
      <p className="mb-3 text-sm text-muted">
        Modulele și vacanțele sunt comune tuturor programelor sezonului. Cât timp modulele
        n-au date, programele nu pot fi activate.
      </p>

      {ordonate.length === 0 ? (
        <p className="rounded-lg bg-surface px-3 py-4 text-center text-sm text-muted">
          Niciun modul definit pentru {sezon}.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line-2">
          {ordonate.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setEditat(r)}
              className="flex w-full items-center gap-3 border-t border-line-2 px-3 py-2.5 text-left first:border-t-0 hover:bg-surface"
            >
              <span className="w-20 shrink-0">
                <Badge tone={r.tip === 'modul' ? 'brand' : 'neutral'}>
                  {r.tip === 'modul' ? `M${r.numar}` : `🌴 ${r.numar}`}
                </Badge>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{r.nume}</span>
                {r.nota && <span className="block truncate text-xs text-muted">{r.nota}</span>}
              </span>
              <span
                className={
                  'shrink-0 text-xs ' +
                  (r.data_incepere && r.data_final ? 'text-muted' : 'font-medium text-warn')
                }
              >
                {formatInterval(r)}
              </span>
            </button>
          ))}
        </div>
      )}

      <CalendarEditModal
        rand={editat}
        onClose={() => setEditat(null)}
        onSave={salveaza}
        onDelete={sterge}
      />
    </section>
  )
}

/* ── 2. Programele sezonului ──────────────────────────────────────────────── */
function ProgrameSection({
  randuri,
  calendarGata,
}: {
  randuri: ProgresAdmin[]
  calendarGata: boolean
}) {
  // get_program_progres_admin dă un rând per (program × curs asociat); grupăm.
  const programe = useMemo(() => {
    const map = new Map<string, { p: ProgresAdmin; cursuri: ProgresAdmin[] }>()
    for (const r of randuri) {
      if (!map.has(r.program_id)) map.set(r.program_id, { p: r, cursuri: [] })
      if (r.curs_id) map.get(r.program_id)!.cursuri.push(r)
    }
    return [...map.values()]
  }, [randuri])

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 text-base font-bold text-ink">2 · Programele sezonului</h2>

      {!calendarGata && (
        <p className="mb-3 rounded-lg bg-warn-bg px-3 py-3 text-sm text-warn">
          📅 Stabilește întâi calendarul sezonului (module cu date). Fără el, programele nu
          pot fi activate și nu se pot asocia grupelor.
        </p>
      )}

      {programe.length === 0 ? (
        <p className="rounded-lg bg-surface px-3 py-4 text-center text-sm text-muted">
          Niciun program pentru sezonul selectat. Duplică structura dintr-un sezon anterior.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {programe.map(({ p, cursuri }) => (
            <Link
              key={p.program_id}
              to={`/metodologic/${p.program_id}`}
              className="rounded-xl border border-line-2 bg-surface p-3 transition-colors hover:border-quasar-yellow"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{p.program_nume}</span>
                <Badge tone={p.stare === 'activ' ? 'success' : 'warn'}>
                  {p.stare === 'activ' ? 'activ' : 'ciornă'}
                </Badge>
              </div>
              <p className="text-xs text-muted">
                {p.total_sedinte} ședințe · {cursuri.length} grupe asociate
              </p>
              {cursuri.length > 0 && (
                <p className="mt-1 truncate text-xs text-muted">
                  {cursuri.map((c) => c.curs_nume).join(', ')}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/* ── 3. Ghidul de activități (constantă) ──────────────────────────────────── */
function GhidSection() {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-1 text-base font-bold text-ink">Ghid activități între module</h2>
      <p className="mb-3 text-sm text-muted">
        Pentru săptămânile de vacanță cu studio deschis.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {GHID_ACTIVITATI.map((g) => (
          <div key={g.titlu} className="rounded-lg border border-line-2 px-3 py-2">
            <span className="text-sm font-semibold text-ink">{g.titlu}</span>
            <span className="mt-0.5 block text-xs text-muted">{g.idei}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Duplicare pe sezon nou ───────────────────────────────────────────────── */
function DuplicaModal({
  sursa,
  onClose,
  onDone,
}: {
  sursa: string
  onClose: () => void
  onDone: (tinta: string) => void
}) {
  const [tinta, setTinta] = useState('')
  const [eroare, setEroare] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => duplicaStructuraSezon(sursa, tinta.trim()),
    onSuccess: () => onDone(tinta.trim()),
    onError: (e) => setEroare(humanizeError(e)),
  })

  return (
    <Modal
      open
      title="Duplică structura pe un sezon nou"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!/^\d{4}-\d{4}$/.test(tinta.trim()) || mutation.isPending}
          >
            {mutation.isPending ? 'Se duplică…' : 'Duplică'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Copiază modulele, vacanțele și programele din <b>{sursa}</b>. Datele din calendar
          rămân goale, iar programele intră în ciornă — le completezi și le activezi după ce
          stabilești calendarul noului sezon.
        </p>
        <Field label="Sezonul nou" required>
          <TextInput
            value={tinta}
            onChange={(e) => setTinta(e.target.value)}
            placeholder="2027-2028"
          />
        </Field>
        {eroare && <p className="text-sm text-danger">{eroare}</p>}
      </div>
    </Modal>
  )
}

/* ── Pagina ───────────────────────────────────────────────────────────────── */
export function MetodologicPage() {
  const qc = useQueryClient()
  const [sezon, setSezon] = useState<string | null>(null)
  const [duplica, setDuplica] = useState(false)

  const sezoaneQuery = useQuery({ queryKey: ['metodologic-sezoane'], queryFn: getSezonEtichete })
  const sezonCurent = sezon ?? sezoaneQuery.data?.[0] ?? null

  const calendarQuery = useQuery({
    queryKey: ['metodologic-calendar', sezonCurent],
    queryFn: () => getCalendarSezon(sezonCurent as string),
    enabled: Boolean(sezonCurent),
  })

  const progresQuery = useQuery({
    queryKey: ['metodologic-progres', sezonCurent],
    queryFn: () => getProgresAdmin(sezonCurent),
    enabled: Boolean(sezonCurent),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['metodologic-calendar', sezonCurent] })
    qc.invalidateQueries({ queryKey: ['metodologic-progres', sezonCurent] })
  }

  const calendar = calendarQuery.data ?? []
  const gata = calendarComplet(calendar).gata

  return (
    <div>
      <PageHeader
        title="Metodologie"
        subtitle="Structura lecțiilor pe sezon: întâi calendarul, apoi programele, apoi asocierea la grupe"
        actions={
          sezonCurent ? (
            <Button variant="ghost" onClick={() => setDuplica(true)}>
              Duplică pe sezon nou
            </Button>
          ) : undefined
        }
      />

      {sezoaneQuery.isLoading ? (
        <Spinner />
      ) : sezoaneQuery.isError ? (
        <p className="text-sm text-danger">
          Eroare la încărcare: {humanizeError(sezoaneQuery.error)}
        </p>
      ) : !sezonCurent ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
          Nu există încă niciun sezon cu structură metodologică.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="max-w-xs">
            <Field label="Sezon">
              <Select
                value={sezonCurent}
                onChange={(e) => setSezon(e.target.value)}
                options={(sezoaneQuery.data ?? []).map((s) => ({ value: s, label: s }))}
              />
            </Field>
          </div>

          {calendarQuery.isLoading ? (
            <Spinner />
          ) : (
            <CalendarSection sezon={sezonCurent} randuri={calendar} onRefresh={refresh} />
          )}

          {progresQuery.isLoading ? (
            <Spinner />
          ) : (
            <ProgrameSection randuri={progresQuery.data ?? []} calendarGata={gata} />
          )}

          <GhidSection />
        </div>
      )}

      {duplica && sezonCurent && (
        <DuplicaModal
          sursa={sezonCurent}
          onClose={() => setDuplica(false)}
          onDone={(tinta) => {
            setDuplica(false)
            qc.invalidateQueries({ queryKey: ['metodologic-sezoane'] })
            setSezon(tinta)
          }}
        />
      )}
    </div>
  )
}
