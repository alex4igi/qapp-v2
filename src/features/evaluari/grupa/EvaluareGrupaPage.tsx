import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  Badge,
  Spinner,
  TextArea,
  Modal,
  Field,
  TextInput,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useCurrentTeacherId } from '@/hooks/useCurrentTeacherId'
import { skills } from '../skills'
import { Stele } from '../SkillRating'
import { formatStele } from '../scale'
import {
  getSesiuneActiva,
  getRosterEvaluare,
  excludeCursant,
  anuleazaExceptie,
  submitGrupa,
  STARE_LABEL,
  type RosterEvaluareRow,
  type StareEvaluare,
} from '../flowApi'

const STARE_TON: Record<StareEvaluare, 'success' | 'danger' | 'warn' | 'neutral' | 'brand'> = {
  ciorna: 'neutral',
  de_verificat: 'warn',
  aprobata: 'brand',
  respinsa: 'danger',
  trimisa: 'success',
  expirata: 'neutral',
}

/** Rândul e blocat odată plecat la manager — corectura vine prin respingere. */
function editabil(stare: StareEvaluare | null): boolean {
  return stare == null || stare === 'ciorna' || stare === 'respinsa'
}

export function EvaluareGrupaPage() {
  const { cursId } = useParams<{ cursId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { teacherId } = useCurrentTeacherId()
  const [eroare, setEroare] = useState<string | null>(null)
  const [exclude, setExclude] = useState<RosterEvaluareRow | null>(null)

  const sesiuneQ = useQuery({ queryKey: ['evaluari', 'sesiune-activa'], queryFn: getSesiuneActiva })
  const sesiune = sesiuneQ.data

  const rosterQ = useQuery({
    queryKey: ['evaluari', 'roster', sesiune?.id, cursId],
    queryFn: () => getRosterEvaluare(sesiune!.id, cursId!),
    enabled: Boolean(sesiune?.id && cursId),
  })

  const cursQ = useQuery({
    queryKey: ['lookup', 'curs', cursId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursuri')
        .select('id, numele, teacher')
        .eq('id', cursId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: Boolean(cursId),
  })

  const rows = rosterQ.data ?? []
  const activi = rows.filter((r) => !r.exceptat)
  const completate = activi.filter((r) => r.stare && r.stare !== 'respinsa').length
  const gata = completate === activi.length && activi.length > 0
  const deTrimis = rows.filter((r) => r.stare === 'ciorna' || r.stare === 'respinsa').length

  const invalideaza = () => {
    void qc.invalidateQueries({ queryKey: ['evaluari'] })
  }

  const submit = useMutation({
    mutationFn: () => submitGrupa(sesiune!.id, cursId!),
    onSuccess: (n) => {
      invalideaza()
      setEroare(null)
      if (n > 0) navigate('/evaluari')
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare la trimitere.')),
  })

  if (sesiuneQ.isLoading || rosterQ.isLoading) return <Spinner />

  if (!sesiune) {
    return (
      <div>
        <PageHeader title="Evaluări grupă" />
        <p className="text-sm text-muted-2">
          Nu există nicio rundă de evaluare deschisă. Managerul o deschide din
          Evaluări → Runde.
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={cursQ.data?.numele ?? 'Grupă'}
        subtitle={`${sesiune.nume} — termen ${formatDate(sesiune.data_limita_teacher)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={gata ? 'success' : 'warn'}>
              {completate}/{activi.length} completați
            </Badge>
            <Button
              disabled={!gata || deTrimis === 0 || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? 'Se trimite…' : 'Trimite grupa spre verificare'}
            </Button>
          </div>
        }
      />

      {eroare && (
        <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{eroare}</p>
      )}
      {!gata && (
        <p className="mb-3 text-sm text-muted-2">
          Poți trimite grupa doar când toți cursanții au evaluare sau sunt marcați
          „nu se aplică".
        </p>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <RandCursant
            key={r.client_id}
            row={r}
            sesiuneId={sesiune.id}
            cursId={cursId!}
            teacherId={teacherId ?? cursQ.data?.teacher ?? null}
            onCereExcludere={() => setExclude(r)}
            onSchimbare={invalideaza}
          />
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-2">Niciun cursant înrolat la această grupă.</p>
        )}
      </div>

      {exclude && (
        <ModalExcludere
          row={exclude}
          sesiuneId={sesiune.id}
          cursId={cursId!}
          onClose={() => setExclude(null)}
          onDone={invalideaza}
        />
      )}
    </div>
  )
}

/** Un cursant = un rând pliabil. Se salvează pe rând, nu la final. */
function RandCursant({
  row,
  sesiuneId,
  cursId,
  teacherId,
  onCereExcludere,
  onSchimbare,
}: {
  row: RosterEvaluareRow
  sesiuneId: string
  cursId: string
  /** Autorul evaluării: profilul celui logat, altfel titularul grupei. */
  teacherId: string | null
  onCereExcludere: () => void
  onSchimbare: () => void
}) {
  const [deschis, setDeschis] = useState(false)
  const [note, setNote] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(skills.map((s) => [s.key, row[s.key]])),
  )
  const [feedback, setFeedback] = useState(row.feedback_general ?? '')
  const [eroare, setEroare] = useState<string | null>(null)
  const poateEdita = editabil(row.stare)

  const media = useMemo(() => {
    const v = skills.map((s) => note[s.key]).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }, [note])

  const salveaza = useMutation({
    mutationFn: async () => {
      if (!teacherId) throw new Error('Grupa n-are instructor titular — nu pot atribui evaluarea.')
      const payload = {
        client: row.client_id,
        cursul: cursId,
        teacher: teacherId,
        sesiune_id: sesiuneId,
        stare: 'ciorna',
        motiv_respingere: null,
        feedback_general: feedback.trim() || null,
        ...note,
      }
      if (row.evaluare_id) {
        const { error } = await supabase
          .from('evaluari')
          .update(payload)
          .eq('id', row.evaluare_id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('evaluari').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      setEroare(null)
      onSchimbare()
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare la salvare.')),
  })

  const reactiveaza = useMutation({
    mutationFn: () => anuleazaExceptie({ sesiuneId, cursId, clientId: row.client_id }),
    onSuccess: onSchimbare,
  })

  if (row.exceptat) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 opacity-70">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{row.client_nume}</p>
          <p className="text-xs text-muted-2">Nu se aplică — {row.motiv_exceptie}</p>
        </div>
        <Button variant="ghost" onClick={() => reactiveaza.mutate()}>
          Reactivează
        </Button>
      </div>
    )
  }

  const completat = skills.filter((s) => note[s.key] != null).length

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setDeschis((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="text-xs text-muted">{deschis ? '▾' : '▸'}</span>
          <span className="truncate text-sm font-medium text-ink">{row.client_nume}</span>
          {row.stare && <Badge tone={STARE_TON[row.stare]}>{STARE_LABEL[row.stare]}</Badge>}
          {!row.stare && <span className="text-xs text-muted-2">neînceput</span>}
          {media != null && (
            <span className="text-xs font-semibold tabular-nums text-ink">
              {formatStele(media)} / 5
            </span>
          )}
          {completat > 0 && completat < skills.length && (
            <span className="text-xs text-warn">{completat}/{skills.length} criterii</span>
          )}
        </button>
        {poateEdita && (
          <Button variant="ghost" onClick={onCereExcludere}>
            Nu se aplică
          </Button>
        )}
      </div>

      {row.stare === 'respinsa' && row.motiv_respingere && (
        <p className="mx-4 mb-3 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">
          Întoarsă de manager: {row.motiv_respingere}
        </p>
      )}

      {deschis && (
        <div className="border-t border-line px-4 py-3">
          <div className="space-y-1.5">
            {skills.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 text-xs text-ink">{s.label}</span>
                <Stele
                  compact
                  value={note[s.key] ?? null}
                  disabled={!poateEdita}
                  onChange={(v) => setNote((p) => ({ ...p, [s.key]: v }))}
                />
              </div>
            ))}
          </div>

          <div className="mt-3">
            <TextArea
              rows={3}
              disabled={!poateEdita}
              placeholder="Feedback general pentru părinte…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>

          {eroare && <p className="mt-2 text-xs text-danger">{eroare}</p>}

          {poateEdita && (
            <div className="mt-3 flex items-center gap-2">
              <Button disabled={salveaza.isPending} onClick={() => salveaza.mutate()}>
                {salveaza.isPending ? 'Se salvează…' : 'Salvează'}
              </Button>
              {salveaza.isSuccess && !salveaza.isPending && (
                <span className="text-xs font-medium text-success">✓ salvat</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ModalExcludere({
  row,
  sesiuneId,
  cursId,
  onClose,
  onDone,
}: {
  row: RosterEvaluareRow
  sesiuneId: string
  cursId: string
  onClose: () => void
  onDone: () => void
}) {
  const [motiv, setMotiv] = useState('')
  const [eroare, setEroare] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () => excludeCursant({ sesiuneId, cursId, clientId: row.client_id, motiv }),
    onSuccess: () => {
      onDone()
      onClose()
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare.')),
  })

  return (
    <Modal
      open
      title={`Nu se aplică — ${row.client_nume}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button disabled={!motiv.trim() || mut.isPending} onClick={() => mut.mutate()}>
            Confirmă
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-2">
        Cursantul iese din numărătoarea rundei. Dacă avea o ciornă începută, se șterge.
      </p>
      <Field label="Motiv" htmlFor="motiv" required>
        <TextInput
          id="motiv"
          autoFocus
          placeholder="ex: s-a înscris săptămâna trecută"
          value={motiv}
          onChange={(e) => setMotiv(e.target.value)}
        />
      </Field>
      {eroare && <p className="mt-2 text-sm text-danger">{eroare}</p>}
    </Modal>
  )
}
