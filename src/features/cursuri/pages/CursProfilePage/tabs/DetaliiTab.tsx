import type { Curs } from '@/types/db'
import { formatOra } from '../../../program'
import { formatRON } from '@/lib/format'
import { RatingSummary } from '@/features/feedback/RatingSummary'

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-quasar-gray">{label}</dt>
      <dd className="text-sm break-words text-quasar-black">{value || '—'}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-display text-sm font-bold text-quasar-black">{title}</h2>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">{children}</dl>
    </div>
  )
}

type Props = {
  curs: Curs
  teacherLabel: string
  coInstructorLabel: string
  salaLabel: string
  sezonLabel: string
  locatieLabel: string
}

export function DetaliiTab({
  curs,
  teacherLabel,
  coInstructorLabel,
  salaLabel,
  sezonLabel,
  locatieLabel,
}: Props) {
  const pret = (n: number | null) => (n != null ? formatRON(n) : '')
  const tipCurs = curs.facultativ
    ? 'Facultativ'
    : curs.nivelul === 'Trupa'
      ? 'Recurent trupă'
      : 'Recurent'
  const flags = [
    curs.one_time ? 'One-time' : null,
    curs.suspendat ? 'Suspendat' : null,
  ].filter(Boolean) as string[]

  return (
    <div className="mt-4 space-y-4">
      {/* OPEN: ratingul e pe sesiune (tab „Sesiuni OPEN"), nu pe cursul-șablon */}
      {!curs.facultativ && <RatingSummary cursId={curs.id} />}
      <Section title="General">
        <DetailRow label="Stil" value={curs.stil ?? ''} />
        <DetailRow label="Tip curs" value={tipCurs} />
        <DetailRow label="Nivel" value={curs.nivelul ?? ''} />
        <DetailRow label="Grupă vârstă" value={curs.varsta ?? ''} />
        <DetailRow label="Teacher" value={teacherLabel} />
        {coInstructorLabel && (
          <DetailRow label="Co-instructor" value={coInstructorLabel} />
        )}
        <DetailRow label="Sezon" value={sezonLabel} />
        <DetailRow label="Locație" value={locatieLabel} />
        <DetailRow label="Sală" value={salaLabel} />
        {curs.facultativ && (
          <DetailRow
            label="Rezervări online"
            value={curs.rezervari_online ? 'Da' : 'Nu'}
          />
        )}
      </Section>
      <Section title="Program">
        <DetailRow label="Zile" value={curs.zile?.join(', ') ?? ''} />
        <DetailRow label="Ora" value={formatOra(curs)} />
        <DetailRow
          label="Durată"
          value={curs.durata_cursului ? `${curs.durata_cursului} min` : ''}
        />
        <DetailRow
          label="Capacitate max."
          value={curs.capacitate_maxima != null ? String(curs.capacitate_maxima) : ''}
        />
      </Section>
      <Section title="Prețuri">
        <DetailRow label="Preț lunar" value={pret(curs.pret_lunar)} />
        <DetailRow label="Preț lunar PROMO" value={pret(curs.pret_lunar_promo)} />
        <DetailRow label="Preț anual" value={pret(curs.pret_anual)} />
        <DetailRow label="Preț ședință" value={pret(curs.pret_sedinta)} />
      </Section>
      {flags.length > 0 && (
        <Section title="Setări">
          <div className="col-span-full">
            <p className="text-sm text-quasar-black">{flags.join(' · ')}</p>
          </div>
        </Section>
      )}
    </div>
  )
}
