import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, type BadgeTone } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { humanizeError } from '@/lib/errorMessage'
import { formatLocuri, formatRON } from '@/lib/format'
import { confirmaSalariuStaff, corecteazaComponenta } from './api'
import type {
  Componenta, LinieKpiRezumat, ManagerLuna, ReceptieLuna, RezultatConfirmare, StareComponenta,
} from './types'

const STARE: Record<StareComponenta, { ton: BadgeTone; eticheta: string }> = {
  confirmat: { ton: 'success', eticheta: '✓ confirmat' },
  corectat: { ton: 'success', eticheta: '✓ corectat' },
  provizoriu: { ton: 'warn', eticheta: 'provizoriu' },
  blocat: { ton: 'danger', eticheta: 'blocat' },
  de_confirmat: { ton: 'neutral', eticheta: 'de confirmat' },
  reportat: { ton: 'neutral', eticheta: 'luna următoare' },
}

const TREAPTA: Record<string, string> = {
  peste: 'peste standard',
  standard: 'standard',
  sub: 'sub standard',
  insuficient: 'insuficient',
  na: '—',
}

function lunaPlatii(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function ListaComponente({ componente, onCorecteaza, kpiLinii = [] }: {
  componente: Componenta[]
  onCorecteaza?: (id: string) => void
  kpiLinii?: LinieKpiRezumat[]
}) {
  return (
    <ul className="divide-y divide-line text-sm">
      {componente.map((c) => (
        <li key={c.cheie} className="flex flex-wrap items-start justify-between gap-2 py-1.5">
          <div className="min-w-0">
            <span className={c.stare === 'reportat' ? 'text-muted' : 'text-ink'}>{c.eticheta}</span>
            {c.stare === 'provizoriu' && c.final_la && (
              <span className="ml-2 text-xs text-muted">se definitivează după {c.final_la}</span>
            )}
            {indicatoriComponenta(c.cheie, kpiLinii) && (
              <div className="text-xs text-muted">{indicatoriComponenta(c.cheie, kpiLinii)}</div>
            )}
            {c.stare === 'reportat' && (
              <div className="text-xs text-muted">
                se verifică la finalul lunii următoare și se plătește cu salariul din {c.platit_cu} — nu intră în totalul de aici
              </div>
            )}
            {c.stare === 'blocat' && c.blocant && (
              <div className="text-xs text-danger">{c.blocant}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STARE[c.stare].ton}>
              {c.stare === 'reportat' ? `→ ${c.platit_cu}` : STARE[c.stare].eticheta}
            </Badge>
            <span className={`w-24 text-right font-medium ${c.stare === 'reportat' ? 'text-muted' : 'text-ink'}`}>
              {formatRON(c.suma)}
            </span>
            {onCorecteaza && c.id && (c.stare === 'confirmat' || c.stare === 'corectat') && (
              <button
                type="button"
                className="text-xs text-muted underline underline-offset-2"
                onClick={() => onCorecteaza(c.id as string)}
              >
                corectează
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function treaptaKpi(k: LinieKpiRezumat): string {
  if (k.banda !== 'na') return TREAPTA[k.banda]
  if (k.motiv === 'necompletat') return 'necompletat'
  return k.suma === 0 ? 'fără cazuri' : 'fără date'
}

function numeKpi(k: LinieKpiRezumat): string {
  return k.denumire.replace(/\s*\(.*\)$/, '')
}

function pragKpi(k: LinieKpiRezumat): string | null {
  if (k.prag_standard == null || k.prag_peste == null || k.suma_standard == null || k.suma_peste == null) return null
  const u = k.unitate ?? ''
  const peste = k.prag_peste % 1 === 0 ? `≥ ${k.prag_peste}${u}` : `> ${Math.floor(k.prag_peste)}${u}`
  return `standard ≥ ${k.prag_standard}${u} → ${formatRON(k.suma_standard)} · peste ${peste} → ${formatRON(k.suma_peste)}`
}

/** Sub „Bonus KPI K1 + K4 + K5": numele indicatorilor din care e făcută suma. */
function indicatoriComponenta(cheie: string, linii: LinieKpiRezumat[]): string | null {
  const amanat = cheie.endsWith('bonus_kpi_m1') ? true : cheie.endsWith('bonus_kpi') ? false : null
  if (amanat == null) return null
  const ale = linii.filter((k) => Boolean(k.amanat) === amanat && k.cod)
  return ale.length ? ale.map((k) => `${k.cod} ${numeKpi(k)}`).join(' · ') : null
}

function IndicatoriKpi({ linii }: { linii: LinieKpiRezumat[] }) {
  const grupe = [
    { titlu: 'Intră în bonusul lunii', linii: linii.filter((k) => !k.amanat) },
    { titlu: 'Se verifică la finalul lunii următoare', linii: linii.filter((k) => k.amanat) },
  ].filter((g) => g.linii.length > 0)

  return (
    <table className="w-full text-sm">
      {grupe.map((g) => (
        <tbody key={g.titlu}>
          {grupe.length > 1 && (
            <tr>
              <td colSpan={4} className="pb-0.5 pt-2 text-xs text-muted">{g.titlu}</td>
            </tr>
          )}
          {g.linii.map((k) => (
            <tr key={k.cheie}>
              <td className="py-1 pr-3 text-ink">
                {k.cod && <span className="mr-1.5 font-semibold">{k.cod}</span>}
                {numeKpi(k)}
                {pragKpi(k) && <div className="text-xs text-muted">{pragKpi(k)}</div>}
              </td>
              <td className="whitespace-nowrap py-0.5 pr-3 text-right text-ink">
                {k.valoare == null ? '—' : `${k.valoare}${k.unitate ?? ''}`}
              </td>
              <td className={`whitespace-nowrap py-0.5 pr-3 ${k.motiv === 'necompletat' ? 'text-danger' : 'text-muted'}`}>
                {treaptaKpi(k)}{k.provizoriu && ' · provizoriu'}
              </td>
              <td className="w-20 whitespace-nowrap py-0.5 text-right font-medium text-ink">{formatRON(k.suma)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  )
}

function RezultatMesaj({ r }: { r: RezultatConfirmare }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
      {r.confirmate.length > 0
        ? `Confirmat: ${r.confirmate.map((c) => c.eticheta).join(', ')}.`
        : 'Nimic nou de confirmat.'}
      {r.ramase.length > 0 && (
        <div className="text-muted">
          Rămân deschise: {r.ramase.map((c) => `${c.eticheta}${c.final_la ? ` (după ${c.final_la})` : ''}`).join(', ')}.
        </div>
      )}
      {r.blocate.length > 0 && (
        <div className="text-danger">
          Blocate: {r.blocate.map((c) => `${c.eticheta} — ${c.motiv}`).join('; ')}
        </div>
      )}
    </div>
  )
}

/** `doarCitire`: varianta din „Salariul meu" — fără confirmare, corecții și link spre raportul KPI. */
export function StaffCard({
  post, om, anul, luna, doarCitire = false, titlu,
}: {
  post: 'manager' | 'receptie'
  om: ManagerLuna | ReceptieLuna
  anul: number
  luna: number
  doarCitire?: boolean
  titlu?: string
}) {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const [rezultat, setRezultat] = useState<RezultatConfirmare | null>(null)

  const confirma = useMutation({
    meta: { erroareAfisata: true },
    mutationFn: () => confirmaSalariuStaff(om.user_id, post, anul, luna, lunaPlatii()),
    onSuccess: (r) => {
      setRezultat(r)
      void queryClient.invalidateQueries({ queryKey: ['salarizare-luna', anul, luna] })
    },
  })
  const corecteaza = useMutation({
    meta: { erroareAfisata: true },
    mutationFn: (x: { id: string; motiv: string }) => corecteazaComponenta(x.id, x.motiv),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['salarizare-luna', anul, luna] }),
  })

  const deConfirmat = om.componente.some((c) => c.stare === 'de_confirmat')
  const eroare = confirma.error ?? corecteaza.error

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-ink">{titlu ?? om.titular_nume}</div>
          <div className="text-xs text-muted">
            {post === 'manager'
              ? (om as ManagerLuna).locatii.map((l) => l.locatie_nume).join(', ')
                || ((om as ManagerLuna).perioada === 'vara' ? 'vara: doar baza' : 'doar bonusul rămas din luna trecută')
              : (om as ReceptieLuna).fix_lunar != null
                ? 'recepție · fix stabilit, fără bonusuri'
                : `recepție · normă ${(om as ReceptieLuna).norma}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {om.confirmat_tot ? (
            <Badge tone="success">✓ luna confirmată</Badge>
          ) : om.confirmat_partial ? (
            <Badge tone="warn">confirmat parțial</Badge>
          ) : null}
          <span className="font-display text-lg font-bold text-ink">{formatRON(om.total)}</span>
        </div>
      </div>

      {post === 'manager' && (om as ManagerLuna).locatii.map((l) => (
        <div key={l.locatie_id} className="mb-3 grid gap-2 rounded-lg bg-surface p-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Încasare · {l.locatie_nume}</div>
            <div className="text-ink">
              Rata {l.incasare.rata ?? '—'}% · {TREAPTA[l.incasare.treapta]}
              {l.incasare.procent > 0 && ` · ${l.incasare.procent}% din ${formatRON(l.incasare.incasari_luna)}`}
            </div>
            <div className="text-xs text-muted">
              {formatRON(l.incasare.platit)} plătit din {formatRON(l.incasare.scadent)} scadent
              {l.incasare.provizoriu && ` · se închide pe ${l.incasare.final_la}`}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Ocupare · {l.locatie_nume}</div>
            <div className="text-ink">
              {formatLocuri(l.ocupare.locuri)} / {l.ocupare.capacitate} locuri · {l.ocupare.procent ?? '—'}% ·{' '}
              {TREAPTA[l.ocupare.treapta] ?? l.ocupare.treapta} · {l.ocupare.lei_pe_loc} lei/loc
            </div>
            <div className="text-xs text-muted">
              {l.ocupare.mod === 'standard_fix'
                ? `septembrie: standard la toți (măsurat: ${TREAPTA[l.ocupare.treapta_masurata] ?? l.ocupare.treapta_masurata})`
                : `${l.ocupare.grupe_active} grupe active · capacitatea din ${l.ocupare.grupe_in_pool} grupe`}
            </div>
          </div>
        </div>
      ))}

      {post === 'receptie' && (om as ReceptieLuna).kpi && (
        <div className="mb-3 rounded-lg bg-surface p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Indicatori · raport {(om as ReceptieLuna).kpi?.stare_raport === 'inchis' ? 'închis (înghețat)' : 'live'}
            </span>
            {!doarCitire && (
              <Link
                to={`/raport-kpi?luna=${anul}-${String(luna).padStart(2, '0')}&grila=${(om as ReceptieLuna).kpi?.grila_id}`}
                className="text-xs text-muted underline underline-offset-2"
              >
                Deschide raportul KPI
              </Link>
            )}
          </div>
          <IndicatoriKpi linii={(om as ReceptieLuna).kpi?.linii ?? []} />
          {(om as ReceptieLuna).kpi?.avertismente.map((a) => (
            <p key={a} className="mt-1 text-xs text-warn">{a}</p>
          ))}
        </div>
      )}

      <ListaComponente
        componente={om.componente}
        kpiLinii={post === 'receptie' ? (om as ReceptieLuna).kpi?.linii : undefined}
        onCorecteaza={role === 'owner' && !doarCitire ? (id) => {
          const motiv = window.prompt('De ce corectezi componenta confirmată? Motivul rămâne în jurnal.')
          if (motiv?.trim()) corecteaza.mutate({ id, motiv: motiv.trim() })
        } : undefined}
      />

      {post === 'receptie' && (om as ReceptieLuna).beneficii.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Beneficii (nu intră în total): {(om as ReceptieLuna).beneficii.map((b) => `${b.eticheta} ${formatRON(b.suma)}`).join(', ')}
          {(om as ReceptieLuna).bonusuri_ocazionale && ' · are bonusuri ocazionale (evenimente, campania de reînscrieri)'}
        </p>
      )}
      {om.avertismente.filter((a) => !a.startsWith('Are bonusuri ocazionale')).map((a) => (
        <p key={a} className="mt-1 text-xs text-warn">{a}</p>
      ))}

      {!doarCitire && <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        {eroare && <span className="text-sm text-danger">{humanizeError(eroare, 'Operația nu a reușit.')}</span>}
        <Button
          variant={deConfirmat ? 'primary' : 'secondary'}
          disabled={!deConfirmat || confirma.isPending}
          onClick={() => confirma.mutate()}
        >
          {confirma.isPending ? 'Se confirmă…' : 'Confirmă ce e definitiv'}
        </Button>
      </div>}
      {rezultat && <div className="mt-2"><RezultatMesaj r={rezultat} /></div>}
    </div>
  )
}
