import { Badge } from '@/components/ui'
import type { LectieAfisata, ModulAfisat, ProgramDetaliat, SezonCalendarRand } from '../types'

function interval(r: { data_incepere: string | null; data_final: string | null }): string {
  if (!r.data_incepere || !r.data_final) return 'fără date'
  const f = (iso: string) =>
    new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
  return `${f(r.data_incepere)} – ${f(r.data_final)}`
}

function LectieRand({
  lectie,
  curenta,
  onEdit,
}: {
  lectie: LectieAfisata
  curenta: boolean
  onEdit?: (l: LectieAfisata) => void
}) {
  return (
    <div
      className={
        'flex gap-3 border-t border-line-2 px-3 py-2 first:border-t-0 ' +
        (curenta ? 'bg-quasar-yellow/10' : '') +
        (onEdit ? ' cursor-pointer hover:bg-surface' : '')
      }
      onClick={onEdit ? () => onEdit(lectie) : undefined}
    >
      <span className="w-14 shrink-0 pt-0.5 text-xs font-bold text-muted">
        {curenta && <span className="mr-1 text-quasar-yellow">▸</span>}
        {lectie.nr_sedinta}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{lectie.titluAfisat}</span>
        {lectie.noteAfisate && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
            {lectie.noteAfisate}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-start gap-1">
        {lectie.adaptat && <Badge tone="brand">adaptat</Badge>}
        {lectie.jurnal === 'conform' && <Badge tone="success">✓</Badge>}
        {lectie.jurnal === 'diferit' && <Badge tone="warn">≠</Badge>}
      </span>
    </div>
  )
}

function VacantaRand({ v }: { v: SezonCalendarRand }) {
  return (
    <div className="rounded-xl border border-dashed border-line-2 bg-surface px-4 py-2.5">
      <span className="text-sm font-semibold text-ink">
        🌴 {v.nume} <span className="font-normal text-muted">({interval(v)})</span>
      </span>
      {v.nota && <p className="mt-0.5 text-xs text-muted">{v.nota}</p>}
    </div>
  )
}

function ModulBloc({
  m,
  sedintaCurenta,
  onEditLectie,
  onEditModul,
}: {
  m: ModulAfisat
  sedintaCurenta: number | null
  onEditLectie?: (l: LectieAfisata) => void
  onEditModul?: (m: ModulAfisat) => void
}) {
  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <span className="text-sm font-bold text-ink">
            MODUL {m.modul.numar}
            {m.modul.tema && <span className="text-quasar-yellow"> — {m.modul.tema}</span>}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {m.calendar ? interval(m.calendar) : '⚠️ lipsă din calendarul sezonului'} ·{' '}
            {m.lectii.length} ședințe
          </span>
        </div>
        {onEditModul && (
          <button
            type="button"
            onClick={() => onEditModul(m)}
            className="shrink-0 text-xs font-medium text-muted underline hover:text-ink"
          >
            Editează tema
          </button>
        )}
      </div>
      <div>
        {m.lectii.map((l) => (
          <LectieRand
            key={l.id}
            lectie={l}
            curenta={sedintaCurenta === l.nr_sedinta}
            onEdit={onEditLectie}
          />
        ))}
      </div>
    </div>
  )
}

type Props = {
  detaliu: ProgramDetaliat
  /** Ședința la care a ajuns grupa — evidențiată în listă. */
  sedintaCurenta?: number | null
  onEditLectie?: (l: LectieAfisata) => void
  onEditModul?: (m: ModulAfisat) => void
}

/** Sezonul complet: modulele cu lecțiile lor, cu vacanțele intercalate cronologic. */
export function ProgramSeasonView({
  detaliu,
  sedintaCurenta = null,
  onEditLectie,
  onEditModul,
}: Props) {
  return (
    <div className="space-y-3">
      {detaliu.module.map((m, i) => (
        <div key={m.modul.id} className="space-y-3">
          <ModulBloc
            m={m}
            sedintaCurenta={sedintaCurenta}
            onEditLectie={onEditLectie}
            onEditModul={onEditModul}
          />
          {detaliu.vacante[i] && <VacantaRand v={detaliu.vacante[i]} />}
        </div>
      ))}
      {detaliu.vacante.slice(detaliu.module.length).map((v) => (
        <VacantaRand key={v.id} v={v} />
      ))}
    </div>
  )
}
