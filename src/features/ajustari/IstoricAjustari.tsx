import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Pills, Spinner, type BadgeTone } from '@/components/ui'
import { formatDate, formatDateTime, formatMonth } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { getAjustari, type Ajustare } from './api'

type Props = { clientId: string } | { familieId: string }

type Grup = 'pret' | 'inrolari' | 'plati'

const GRUP: Record<Grup, { label: string; icon: string }> = {
  pret: { label: 'Preț', icon: '🏷️' },
  inrolari: { label: 'Înrolări', icon: '📋' },
  plati: { label: 'Plăți', icon: '💰' },
}

const ACTIUNE: Record<string, { label: string; grup: Grup }> = {
  price_override: { label: 'Ajustare preț', grup: 'pret' },
  gratuitate_inrolare: { label: 'Voucher angajat / gratuitate', grup: 'pret' },
  motivare_absenta: { label: 'Motivare absență (adeverință)', grup: 'pret' },
  prorata_marcat: { label: 'Prorata', grup: 'pret' },
  enrollment_moved: { label: 'Mutare la altă grupă', grup: 'inrolari' },
  enrollment_date_corrected: { label: 'Corectare dată de început', grup: 'inrolari' },
  enrollment_backdated: { label: 'Înscriere cu dată în urmă', grup: 'inrolari' },
  abonament_to_sedinte: { label: 'Abonament → ședințe', grup: 'inrolari' },
  sedinte_to_abonament: { label: 'Ședințe → abonament', grup: 'inrolari' },
  enrollment_reziliata: { label: 'Reziliere', grup: 'inrolari' },
  enrollment_deleted: { label: 'Ștergere înrolare', grup: 'inrolari' },
  prezenta_deleted: { label: 'Ștergere prezență', grup: 'inrolari' },
  incasare_modified: { label: 'Modificare încasare', grup: 'plati' },
  incasare_moved: { label: 'Mutare plată', grup: 'plati' },
  incasare_deleted: { label: 'Ștergere încasare', grup: 'plati' },
  datorie_deleted: { label: 'Ștergere datorie', grup: 'plati' },
}

const ROL: Record<string, string> = {
  owner: 'owner',
  admin: 'admin',
  manager: 'manager',
  front_desk: 'recepție',
  teacher: 'instructor',
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const lei = (v: unknown) => `${num(v) ?? '?'} lei`

function rezumat(a: Ajustare): string | null {
  const o = a.vechi ?? {}
  const n = a.nou ?? {}
  switch (a.actiune) {
    case 'price_override': {
      const parti = [`${lei(o.suma)} → ${lei(n.suma)}`]
      if ((num(n.credit_left) ?? 0) > 0) parti.push(`rămas credit ${lei(n.credit_left)}`)
      if ((num(n.refunded) ?? 0) > 0) parti.push(`restituit ${lei(n.refunded)}`)
      if ((num(n.moved) ?? 0) > 0) parti.push(`mutat pe alt rând ${lei(n.moved)}`)
      return parti.join(' · ')
    }
    case 'gratuitate_inrolare': {
      const g = str(n.gratuitate)
      if (!g) return `scos · de plată ${lei(n.suma)}`
      return [
        g === 'angajat' ? 'voucher angajat' : 'gratuitate specială',
        `acoperit ${lei(n.acoperit)}`,
        `de plată ${lei(n.suma)}`,
      ].join(' · ')
    }
    case 'motivare_absenta': {
      const abs = `${num(n.absente) ?? '?'} absențe, prag ${num(n.prag) ?? '?'}`
      return n.scutit === true ? `luna scutită → 0 lei · ${abs}` : `absențe motivate, fără scutire · ${abs}`
    }
    case 'prorata_marcat':
      return n.prorata === true ? 'marcată prorata (prima lună redusă)' : 'scos semnul de prorata'
    case 'enrollment_reziliata': {
      const rate = num(n.rate_anulate)
      return rate != null ? `${rate} ${rate === 1 ? 'rată anulată' : 'rate anulate'}` : null
    }
    case 'enrollment_moved': {
      const mutate = num(n.mutate)
      return [
        `${a.curs ?? '?'} → ${a.curs_nou ?? '?'}`,
        mutate != null && `${mutate} ${mutate === 1 ? 'lună mutată' : 'luni mutate'}`,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'enrollment_date_corrected':
      return `început ${formatDate(str(o.data_incepere))} → ${formatDate(str(n.data_incepere))}`
    case 'enrollment_backdated':
      return `înscris de la ${formatDate(str(n.data_incepere))}`
    case 'abonament_to_sedinte':
      return [
        `abonament ${lei(o.suma)} → ${num(n.sedinte) ?? '?'} ședințe`,
        (num(n.datorie) ?? 0) > 0 && `de plată ${lei(n.datorie)}`,
        (num(n.credit) ?? 0) > 0 && `credit ${lei(n.credit)}`,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'sedinte_to_abonament':
      return [
        `${num(o.sedinte) ?? '?'} ședințe (${lei(o.platit)}) → abonament ${lei(n.pret)}`,
        (num(n.de_incasat) ?? 0) > 0 && `de încasat ${lei(n.de_incasat)}`,
        (num(n.credit) ?? 0) > 0 && `credit ${lei(n.credit)}`,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'enrollment_deleted':
      return [str(o.tip_plata), num(o.suma) != null && lei(o.suma)].filter(Boolean).join(' · ')
    case 'prezenta_deleted':
      return `${str(o.status) ?? 'Prezență'} din ${formatDate(str(o.data))}`
    case 'incasare_modified': {
      if (str(n.action) === 'allocate') return `credit folosit: ${lei(n.used)}`
      if (num(n.transfer_credit) != null) {
        return `${lei(o.suma_incasare)} → ${lei(n.suma_incasare)} · ${lei(n.transfer_credit)} mutați pe altă lună`
      }
      const parti: string[] = []
      if (num(o.suma) != null && num(n.suma) != null && o.suma !== n.suma) {
        parti.push(`${lei(o.suma)} → ${lei(n.suma)}`)
      }
      if (str(o.metoda) && str(n.metoda) && o.metoda !== n.metoda) {
        parti.push(`${o.metoda} → ${n.metoda}`)
      }
      if (str(n.datorie_descriere)) parti.push(`legată de ${n.datorie_descriere}`)
      return parti.join(' · ') || null
    }
    case 'incasare_moved':
      return `${lei(n.suma)}: ${str(o.client_nume) ?? '?'} → ${str(n.client_nume) ?? '?'}`
    case 'incasare_deleted':
      return [lei(o.suma), str(o.metoda), str(o.data) && formatDate(str(o.data))]
        .filter(Boolean)
        .join(' · ')
    case 'datorie_deleted':
      return [str(o.descriere) ?? str(o.categorie), lei(o.suma_datorata)].filter(Boolean).join(' · ')
    default:
      return null
  }
}

// Lunare: rândul are data de început a lunii (sau ziua înscrierii în prima lună) → „septembrie 2026".
function context(a: Ajustare): string | null {
  const parti: string[] = []
  if (a.curs && a.actiune !== 'enrollment_moved') parti.push(a.curs)
  if (a.luna) {
    const tip = str(a.vechi?.tip_plata)
    const data = tip === 'Per sedinta' ? formatDate(a.luna) : formatMonth(a.luna)
    parti.push(a.actiune === 'enrollment_reziliata' ? `din ${data}` : data)
  }
  return parti.join(' · ') || null
}

function ton(a: Ajustare): BadgeTone {
  if (a.actiune.endsWith('_deleted') || a.actiune === 'enrollment_reziliata') return 'danger'
  if (a.actiune === 'motivare_absenta' && a.nou?.scutit === true) return 'warn'
  if (a.actiune === 'price_override') {
    const o = num(a.vechi?.suma)
    const n = num(a.nou?.suma)
    if (o != null && n != null) return n < o ? 'warn' : 'neutral'
  }
  return 'neutral'
}

export function IstoricAjustari(props: Props) {
  const [grup, setGrup] = useState<string>('')
  const familie = 'familieId' in props
  const key = familie ? ['familie', props.familieId] : ['client', props.clientId]

  const query = useQuery({
    queryKey: ['istoric-ajustari', ...key],
    queryFn: () => getAjustari(props),
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const numarPeGrup = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const g = ACTIUNE[r.actiune]?.grup
      if (g) m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }, [rows])

  if (query.isLoading) return <Spinner />
  if (query.error) {
    return (
      <p className="text-sm text-danger">
        {humanizeError(query.error, 'Ajustările nu au putut fi încărcate.')}
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nicio ajustare de preț sau corecție pe {familie ? 'această familie' : 'acest client'}.
      </p>
    )
  }

  const vizibile = grup ? rows.filter((r) => ACTIUNE[r.actiune]?.grup === grup) : rows
  const optiuni = [
    { value: '', label: `Toate (${rows.length})` },
    ...(Object.keys(GRUP) as Grup[])
      .filter((g) => numarPeGrup.has(g))
      .map((g) => ({ value: g, label: `${GRUP[g].label} (${numarPeGrup.get(g)})` })),
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pills
          options={optiuni}
          value={grup}
          onChange={setGrup}
          clearable={false}
          aria-label="Filtru tip ajustare"
        />
        <span className="text-xs text-muted">
          {familie ? 'Toată familia · ' : ''}cele mai noi primele
        </span>
      </div>

      <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
        {vizibile.map((a) => {
          const def = ACTIUNE[a.actiune]
          const corp = rezumat(a)
          const ctx = context(a)
          const cine = [
            familie && a.pentru && `pentru ${a.pentru}`,
            a.autor && `de ${a.autor}${a.rol ? ` (${ROL[a.rol] ?? a.rol})` : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <li key={a.id} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 shrink-0 text-base" aria-hidden>
                {def ? GRUP[def.grup].icon : '•'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{def?.label ?? a.actiune}</span>
                  {corp && <Badge tone={ton(a)}>{corp}</Badge>}
                  <span className="ml-auto whitespace-nowrap text-xs text-muted">
                    {formatDateTime(a.moment)}
                  </span>
                </div>
                {ctx && <p className="mt-0.5 text-xs text-muted">{ctx}</p>}
                {cine && <p className="mt-0.5 text-xs text-muted">{cine}</p>}
                {a.motiv && (
                  <p className="mt-1 whitespace-pre-line break-words text-sm italic text-ink/80">
                    „{a.motiv}"
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
