import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, type BadgeTone } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { humanizeError } from '@/lib/errorMessage'
import { formatRON } from '@/lib/format'
import { confirmaSalariuStaff, corecteazaComponenta } from './api'
import type {
  Componenta, ManagerLuna, ReceptieLuna, RezultatConfirmare, StareComponenta,
} from './types'

const STARE: Record<StareComponenta, { ton: BadgeTone; eticheta: string }> = {
  confirmat: { ton: 'success', eticheta: '✓ confirmat' },
  corectat: { ton: 'success', eticheta: '✓ corectat' },
  provizoriu: { ton: 'warn', eticheta: 'provizoriu' },
  blocat: { ton: 'danger', eticheta: 'blocat' },
  de_confirmat: { ton: 'neutral', eticheta: 'de confirmat' },
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

function ListaComponente({ componente, onCorecteaza }: {
  componente: Componenta[]
  onCorecteaza?: (id: string) => void
}) {
  return (
    <ul className="divide-y divide-line text-sm">
      {componente.map((c) => (
        <li key={c.cheie} className="flex flex-wrap items-start justify-between gap-2 py-1.5">
          <div className="min-w-0">
            <span className="text-ink">{c.eticheta}</span>
            {c.stare === 'provizoriu' && c.final_la && (
              <span className="ml-2 text-xs text-muted">se definitivează după {c.final_la}</span>
            )}
            {c.stare === 'blocat' && c.blocant && (
              <div className="text-xs text-danger">{c.blocant}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STARE[c.stare].ton}>{STARE[c.stare].eticheta}</Badge>
            <span className="w-24 text-right font-medium text-ink">{formatRON(c.suma)}</span>
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

export function StaffCard({
  post, om, anul, luna,
}: {
  post: 'manager' | 'receptie'
  om: ManagerLuna | ReceptieLuna
  anul: number
  luna: number
}) {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const [rezultat, setRezultat] = useState<RezultatConfirmare | null>(null)

  const confirma = useMutation({
    mutationFn: () => confirmaSalariuStaff(om.user_id, post, anul, luna, lunaPlatii()),
    onSuccess: (r) => {
      setRezultat(r)
      void queryClient.invalidateQueries({ queryKey: ['salarizare-luna', anul, luna] })
    },
  })
  const corecteaza = useMutation({
    mutationFn: (x: { id: string; motiv: string }) => corecteazaComponenta(x.id, x.motiv),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['salarizare-luna', anul, luna] }),
  })

  const deConfirmat = om.componente.some((c) => c.stare === 'de_confirmat')
  const eroare = confirma.error ?? corecteaza.error

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-ink">{om.titular_nume}</div>
          <div className="text-xs text-muted">
            {post === 'manager'
              ? (om as ManagerLuna).locatii.map((l) => l.locatie_nume).join(', ') || 'vara: doar baza'
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
              {l.ocupare.locuri} / {l.ocupare.capacitate} locuri · {l.ocupare.procent ?? '—'}% ·{' '}
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
            <Link
              to={`/raport-kpi?luna=${anul}-${String(luna).padStart(2, '0')}&grila=${(om as ReceptieLuna).kpi?.grila_id}`}
              className="text-xs text-muted underline underline-offset-2"
            >
              Deschide raportul KPI
            </Link>
          </div>
          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {(om as ReceptieLuna).kpi?.linii.map((k) => (
              <li key={k.cheie} className="flex justify-between gap-2">
                <span className="text-muted">
                  {k.denumire}: <span className="text-ink">{k.valoare == null ? '—' : `${k.valoare}${k.unitate ?? ''}`}</span>
                  {k.provizoriu && ' · provizoriu'}
                </span>
                <span className="text-ink">{k.banda === 'na' ? (k.motiv === 'necompletat' ? 'necompletat' : 'nemăsurabil') : TREAPTA[k.banda]} · {formatRON(k.suma)}</span>
              </li>
            ))}
          </ul>
          {(om as ReceptieLuna).kpi?.avertismente.map((a) => (
            <p key={a} className="mt-1 text-xs text-warn">{a}</p>
          ))}
        </div>
      )}

      <ListaComponente
        componente={om.componente}
        onCorecteaza={role === 'owner' ? (id) => {
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

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        {eroare && <span className="text-sm text-danger">{humanizeError(eroare, 'Operația nu a reușit.')}</span>}
        <Button
          variant={deConfirmat ? 'primary' : 'secondary'}
          disabled={!deConfirmat || confirma.isPending}
          onClick={() => confirma.mutate()}
        >
          {confirma.isPending ? 'Se confirmă…' : 'Confirmă ce e definitiv'}
        </Button>
      </div>
      {rezultat && <div className="mt-2"><RezultatMesaj r={rezultat} /></div>}
    </div>
  )
}
