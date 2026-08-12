import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Badge,
  Spinner,
  DataTable,
  Modal,
  Field,
  TextArea,
  type Column,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { skills } from '../skills'
import { Stele } from '../SkillRating'
import { formatStele } from '../scale'
import { printEvaluare } from '../print/printEvaluare'
import {
  getSesiuneActiva,
  getAcoperireSesiune,
  getRosterEvaluare,
  aprobaEvaluari,
  respingeEvaluare,
  type AcoperireGrupa,
  type RosterEvaluareRow,
} from '../flowApi'

export function VerificareTab() {
  const qc = useQueryClient()
  const [grupa, setGrupa] = useState<AcoperireGrupa | null>(null)

  const sesiuneQ = useQuery({ queryKey: ['evaluari', 'sesiune-activa'], queryFn: getSesiuneActiva })
  const s = sesiuneQ.data

  const acoperireQ = useQuery({
    queryKey: ['evaluari', 'acoperire', s?.id],
    queryFn: () => getAcoperireSesiune(s!.id),
    enabled: Boolean(s?.id),
  })

  if (sesiuneQ.isLoading) return <Spinner />

  if (!s) {
    return (
      <p className="text-sm text-muted-2">
        Nicio rundă activă. Deschide una din tabul „Runde".
      </p>
    )
  }

  const columns: Column<AcoperireGrupa>[] = [
    {
      header: 'Grupă',
      cell: (g) => <span className="font-medium text-ink">{g.curs_nume}</span>,
      sortValue: (g) => g.curs_nume.toLowerCase(),
    },
    {
      header: 'Instructor',
      cell: (g) => g.teacher_nume || '—',
      className: 'w-44',
    },
    {
      header: 'Acoperire',
      cell: (g) => {
        const facute = g.n_ciorna + g.n_de_verificat + g.n_aprobate + g.n_trimise
        const complet = facute >= g.n_asteptati && g.n_asteptati > 0
        return (
          <span className={cn('font-semibold tabular-nums', complet ? 'text-success' : 'text-ink')}>
            {facute}/{g.n_asteptati}
            {g.n_exceptii > 0 && (
              <span className="ml-1 font-normal text-muted-2">(+{g.n_exceptii} excluși)</span>
            )}
          </span>
        )
      },
      className: 'w-40',
      sortValue: (g) => g.n_asteptati - (g.n_ciorna + g.n_de_verificat + g.n_aprobate + g.n_trimise),
    },
    {
      header: 'De verificat',
      cell: (g) =>
        g.n_de_verificat > 0 ? (
          <Badge tone="warn">{g.n_de_verificat}</Badge>
        ) : (
          <span className="text-muted-2">—</span>
        ),
      className: 'w-28',
      sortValue: (g) => -g.n_de_verificat,
    },
    {
      header: 'Aprobate',
      cell: (g) => <span className="tabular-nums text-muted-2">{g.n_aprobate}</span>,
      className: 'w-24',
    },
    {
      header: 'Trimise',
      cell: (g) => <span className="tabular-nums text-muted-2">{g.n_trimise}</span>,
      className: 'w-24',
    },
    {
      header: 'Respinse',
      cell: (g) =>
        g.n_respinse > 0 ? (
          <Badge tone="danger">{g.n_respinse}</Badge>
        ) : (
          <span className="text-muted-2">—</span>
        ),
      className: 'w-24',
    },
  ]

  // După data trimiterii, ce contează nu mai e termenul instructorilor, ci cât mai
  // au evaluările rămase până expiră.
  const dupaTrimitere = s.zile_pana_la_trimitere <= 0

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <span className="font-semibold text-ink">{s.nume}</span>
        {dupaTrimitere ? (
          <Badge tone={s.zile_pana_la_inchidere <= 3 ? 'danger' : 'warn'}>
            {s.zile_pana_la_inchidere <= 0
              ? 'Expiră azi'
              : `Expiră în ${s.zile_pana_la_inchidere} zile`}
          </Badge>
        ) : (
          <Badge tone={s.zile_pana_la_trimitere <= 3 ? 'warn' : 'brand'}>
            {s.zile_pana_la_trimitere === 0
              ? 'Se trimite azi'
              : `Se trimite în ${s.zile_pana_la_trimitere} zile`}
          </Badge>
        )}
        <span className="text-xs text-muted-2">
          trimitere {formatDate(s.data_trimitere)} · închidere {formatDate(s.data_inchidere)}
        </span>
        <span className="ml-auto text-xs text-muted-2">
          Doar evaluările aprobate ajung la părinți.
        </span>
      </div>

      {acoperireQ.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={acoperireQ.data ?? []}
          rowKey={(g) => g.curs_id}
          onRowClick={(g) => setGrupa(g)}
          emptyMessage="Runda n-are nicio grupă asociată."
        />
      )}

      {grupa && (
        <PanouGrupa
          sesiuneId={s.id}
          grupa={grupa}
          onClose={() => setGrupa(null)}
          onSchimbare={() => qc.invalidateQueries({ queryKey: ['evaluari'] })}
        />
      )}
    </div>
  )
}

function PanouGrupa({
  sesiuneId,
  grupa,
  onClose,
  onSchimbare,
}: {
  sesiuneId: string
  grupa: AcoperireGrupa
  onClose: () => void
  onSchimbare: () => void
}) {
  const [respinge, setRespinge] = useState<RosterEvaluareRow | null>(null)
  const [eroare, setEroare] = useState<string | null>(null)

  const rosterQ = useQuery({
    queryKey: ['evaluari', 'roster', sesiuneId, grupa.curs_id],
    queryFn: () => getRosterEvaluare(sesiuneId, grupa.curs_id),
  })

  const deVerificat = (rosterQ.data ?? []).filter((r) => r.stare === 'de_verificat')

  const aproba = useMutation({
    mutationFn: (ids: string[]) => aprobaEvaluari(ids),
    onSuccess: () => {
      void rosterQ.refetch()
      onSchimbare()
      setEroare(null)
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare la aprobare.')),
  })

  return (
    <Modal
      open
      title={`Verificare — ${grupa.curs_nume}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Închide
          </Button>
          <Button
            disabled={deVerificat.length === 0 || aproba.isPending}
            onClick={() => aproba.mutate(deVerificat.map((r) => r.evaluare_id!))}
          >
            {aproba.isPending
              ? 'Se aprobă…'
              : `Aprobă tot (${deVerificat.length})`}
          </Button>
        </>
      }
    >
      {eroare && <p className="mb-3 text-sm text-danger">{eroare}</p>}
      {rosterQ.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {(rosterQ.data ?? [])
            .filter((r) => r.stare)
            .map((r) => (
              <CardEvaluare
                key={r.client_id}
                row={r}
                cursNume={grupa.curs_nume}
                teacherNume={grupa.teacher_nume}
                onAproba={() => aproba.mutate([r.evaluare_id!])}
                onRespinge={() => setRespinge(r)}
              />
            ))}
          {(rosterQ.data ?? []).filter((r) => r.stare).length === 0 && (
            <p className="text-sm text-muted-2">
              Instructorul n-a trimis încă nimic pentru grupa asta.
            </p>
          )}
        </div>
      )}

      {respinge && (
        <ModalRespingere
          row={respinge}
          onClose={() => setRespinge(null)}
          onDone={() => {
            void rosterQ.refetch()
            onSchimbare()
          }}
        />
      )}
    </Modal>
  )
}

function CardEvaluare({
  row,
  cursNume,
  teacherNume,
  onAproba,
  onRespinge,
}: {
  row: RosterEvaluareRow
  cursNume: string
  teacherNume: string | null
  onAproba: () => void
  onRespinge: () => void
}) {
  const [extins, setExtins] = useState(false)
  const inVerificare = row.stare === 'de_verificat'

  const valori = skills.map((s) => row[s.key]).filter((v): v is number => v != null)
  const media = valori.length ? valori.reduce((a, b) => a + b, 0) / valori.length : null

  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExtins((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-xs text-muted">{extins ? '▾' : '▸'}</span>
          <span className="truncate text-sm font-medium text-ink">{row.client_nume}</span>
          <span className="text-xs font-semibold tabular-nums text-ink">
            {formatStele(media)} / 5
          </span>
          {row.stare === 'aprobata' && <Badge tone="brand">Aprobată</Badge>}
          {row.stare === 'trimisa' && <Badge tone="success">Trimisă</Badge>}
          {row.stare === 'respinsa' && <Badge tone="danger">Respinsă</Badge>}
          {row.stare === 'ciorna' && <Badge tone="neutral">Ciornă la instructor</Badge>}
        </button>
        {inVerificare && (
          <div className="flex gap-1">
            <Button variant="ghost" onClick={onRespinge}>
              Respinge
            </Button>
            <Button variant="secondary" onClick={onAproba}>
              Aprobă
            </Button>
          </div>
        )}
        {(row.stare === 'aprobata' || row.stare === 'trimisa') && (
          <Button
            variant="ghost"
            onClick={() =>
              printEvaluare({
                clientNume: row.client_nume,
                cursNume,
                teacherNume,
                nivelGrupa: row.nivel_grupa,
                feedback: row.feedback_general,
                note: Object.fromEntries(skills.map((s) => [s.key, row[s.key]])),
              })
            }
          >
            Printează
          </Button>
        )}
      </div>

      {extins && (
        <div className="mt-3 space-y-1 border-t border-line pt-3">
          {skills.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 text-xs text-muted-2">{s.label}</span>
              <Stele compact value={row[s.key]} onChange={() => {}} disabled />
            </div>
          ))}
          {row.feedback_general && (
            <div className="mt-2 rounded-md bg-surface px-3 py-2">
              <p className="text-xs font-semibold text-muted-2">Feedback pentru părinte</p>
              <p className="mt-0.5 text-sm text-ink">{row.feedback_general}</p>
            </div>
          )}
          {row.motiv_respingere && (
            <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">
              Respinsă: {row.motiv_respingere}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ModalRespingere({
  row,
  onClose,
  onDone,
}: {
  row: RosterEvaluareRow
  onClose: () => void
  onDone: () => void
}) {
  const [motiv, setMotiv] = useState('')
  const [eroare, setEroare] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () => respingeEvaluare(row.evaluare_id!, motiv),
    onSuccess: () => {
      onDone()
      onClose()
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare.')),
  })

  return (
    <Modal
      open
      title={`Respinge — ${row.client_nume}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button variant="danger" disabled={!motiv.trim() || mut.isPending} onClick={() => mut.mutate()}>
            Trimite înapoi
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-2">
        Evaluarea se întoarce la instructor cu motivul de mai jos. Textul lui rămâne
        neatins — el o corectează și o retrimite.
      </p>
      <Field label="Ce trebuie corectat" htmlFor="motiv" required>
        <TextArea
          id="motiv"
          rows={3}
          autoFocus
          placeholder="ex: feedbackul general e prea scurt pentru un părinte care nu vine la sală"
          value={motiv}
          onChange={(e) => setMotiv(e.target.value)}
        />
      </Field>
      {eroare && <p className="mt-2 text-sm text-danger">{eroare}</p>}
    </Modal>
  )
}
