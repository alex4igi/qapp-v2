import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Pills, Spinner, type BadgeTone } from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { getIstoricComunicari, type CanalComunicare, type Comunicare } from './api'

type Props = { clientId: string } | { familieId: string }

const CANAL: Record<CanalComunicare, { label: string; icon: string }> = {
  sms: { label: 'SMS', icon: '💬' },
  contact: { label: 'Contacte', icon: '📞' },
  email: { label: 'Email', icon: '✉️' },
  contract: { label: 'Contracte', icon: '📝' },
  anunt: { label: 'Anunțuri', icon: '🔔' },
}

const TIP_SMS: Record<string, string> = {
  confirmare: 'Confirmare ședință gratuită',
  reminder: 'Reminder ședință gratuită',
  post_demo: 'După ședința gratuită',
  review: 'Cerere de recenzie',
  followup: 'După neprezentare',
  waiting_list: 'Listă de așteptare',
  preinscriere: 'Confirmare preînscriere',
  confirmare_inrolare: 'Confirmare înscriere',
  start_sezon: 'Reminder început de sezon',
  prima_sedinta: 'Reminder prima ședință',
  reminder_plata: 'Reminder plată',
  notificare_restante: 'Notificare restanțe',
  avertisment_loc: 'Avertisment pierdere loc',
  contract: 'Contract trimis la semnat',
  contract_reminder: 'Reminder contract',
  cont_portal: 'Date cont portal',
  manual: 'SMS manual',
  mesaj_liber: 'Mesaj liber',
  absenta_fara_raspuns: 'Absent 21 zile — fără răspuns',
}

const TIP_CONTRACT: Record<string, string> = {
  email_trimis: 'Contract trimis pe email',
  deschis: 'Familia a deschis contractul',
  semnat: 'Contract semnat',
}

const SCOP_CONTACT: Record<string, string> = {
  recuperare: 'Apel recuperare plată',
  reactivare: 'Contact reactivare',
  lead: 'Contact lead',
}

// Aceleași etichete ca în modalurile din care se loghează contactul.
const REZULTAT_CONTACT: Record<string, Record<string, string>> = {
  recuperare: { reusit: 'A plătit / promite', follow_up: 'Revine cu plata', pierdut: 'Refuză' },
  reactivare: {
    reusit: 'Revine la curs',
    follow_up: 'Amână',
    pierdut: 'Renunță',
    nu_raspunde: 'Nu răspunde',
  },
  lead: { reusit: 'Contact reușit', follow_up: 'Follow-up', pierdut: 'Pierdut' },
}

const CANAL_CONTACT: Record<string, string> = {
  telefon: 'telefon',
  sms: 'SMS',
  email: 'email',
  dm: 'DM',
}

function titlu(c: Comunicare): string {
  const tip = c.tip ?? ''
  switch (c.canal) {
    case 'sms':
      return TIP_SMS[tip] ?? 'SMS'
    case 'contract':
      return TIP_CONTRACT[tip] ?? 'Contract'
    case 'contact':
      return SCOP_CONTACT[tip] ?? 'Contact'
    case 'anunt':
      return 'Anunț în portal'
    case 'email':
      return 'Email'
  }
}

function eticheta(c: Comunicare): { text: string; tone: BadgeTone } | null {
  const s = c.status
  if (!s) return null
  if (c.canal === 'contact') {
    const text = REZULTAT_CONTACT[c.tip ?? '']?.[s] ?? s
    const tone: BadgeTone = s === 'reusit' ? 'success' : s === 'pierdut' ? 'danger' : 'warn'
    return { text, tone }
  }
  switch (s) {
    case 'trimis':
      return { text: 'Trimis', tone: 'success' }
    case 'esuat':
      return { text: 'Eșuat', tone: 'danger' }
    case 'programat':
      return { text: 'Programat', tone: 'warn' }
    case 'anulat':
      return { text: 'Anulat', tone: 'neutral' }
    case 'citit':
      return { text: 'Citit', tone: 'success' }
    case 'necitit':
      return { text: 'Necitit', tone: 'neutral' }
    default:
      return { text: s, tone: 'neutral' }
  }
}

function text(c: Comunicare): string | null {
  if (c.mesaj) return c.mesaj
  const d = c.detalii ?? {}
  if (c.tip === 'start_sezon' || c.tip === 'prima_sedinta') {
    const curs = typeof d.curs === 'string' ? d.curs : null
    const data = typeof d.data_sedinta === 'string' ? formatDate(d.data_sedinta) : null
    return [curs, data && `ședința din ${data}`].filter(Boolean).join(' · ') || null
  }
  return null
}

function subtitlu(c: Comunicare): string {
  const d = c.detalii ?? {}
  const parti: string[] = []
  if (c.pentru) parti.push(`pentru ${c.pentru}`)
  if (c.destinatar) parti.push(`către ${c.destinatar}`)
  if (c.canal === 'contact') {
    const canal = typeof d.canal === 'string' ? CANAL_CONTACT[d.canal] : null
    if (canal) parti.push(`prin ${canal}`)
    if (c.autor) parti.push(`de ${c.autor}`)
    if (typeof d.suma_promisa === 'number') {
      const termen = typeof d.promisiune_data === 'string' ? ` până pe ${formatDate(d.promisiune_data)}` : ''
      parti.push(`a promis ${d.suma_promisa} lei${termen}`)
    }
  }
  if (c.canal === 'anunt' && typeof d.citit_la === 'string') {
    parti.push(`citit pe ${formatDateTime(d.citit_la)}`)
  }
  return parti.join(' · ')
}

export function IstoricComunicari(props: Props) {
  const [canal, setCanal] = useState<string>('')
  const key = 'clientId' in props ? ['client', props.clientId] : ['familie', props.familieId]

  const query = useQuery({
    queryKey: ['istoric-comunicari', ...key],
    queryFn: () => getIstoricComunicari(props),
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const numarPeCanal = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.canal, (m.get(r.canal) ?? 0) + 1)
    return m
  }, [rows])

  if (query.isLoading) return <Spinner />
  if (query.error) {
    return (
      <p className="text-sm text-danger">
        {humanizeError(query.error, 'Istoricul nu a putut fi încărcat.')}
      </p>
    )
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nicio comunicare înregistrată cu această familie.</p>
  }

  const vizibile = canal ? rows.filter((r) => r.canal === canal) : rows
  const optiuni = [
    { value: '', label: `Toate (${rows.length})` },
    ...(Object.keys(CANAL) as CanalComunicare[])
      .filter((k) => numarPeCanal.has(k))
      .map((k) => ({ value: k, label: `${CANAL[k].label} (${numarPeCanal.get(k)})` })),
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pills
          options={optiuni}
          value={canal}
          onChange={setCanal}
          clearable={false}
          aria-label="Filtru canal"
        />
        <span className="text-xs text-muted">Toată familia · cele mai noi primele</span>
      </div>

      <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
        {vizibile.map((c, i) => {
          const badge = eticheta(c)
          const corp = text(c)
          const sub = subtitlu(c)
          const eroare =
            c.status === 'esuat' && typeof c.detalii?.eroare === 'string' ? c.detalii.eroare : null
          return (
            <li key={i} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 shrink-0 text-base" aria-hidden>
                {CANAL[c.canal]?.icon ?? '•'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{titlu(c)}</span>
                  {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
                  <span className="ml-auto whitespace-nowrap text-xs text-muted">
                    {formatDateTime(c.moment)}
                  </span>
                </div>
                {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
                {corp && (
                  <p className="mt-1 whitespace-pre-line break-words text-sm text-ink/80">{corp}</p>
                )}
                {eroare && <p className="mt-1 text-xs text-danger">{eroare}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
