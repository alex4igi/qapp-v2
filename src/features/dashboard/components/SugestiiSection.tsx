import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Spinner, WhatsAppIcon } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { humanizeError } from '@/lib/errorMessage'
import { formatDate, formatMonth, formatRON } from '@/lib/format'
import { vineLaLabel } from '@/lib/ultimaPrezenta'
import { waLink } from '@/lib/phone'
import {
  convertSedinteInAbonament,
  countSessionsBetween,
  createInrolari,
  endOfMonth,
  getSedinteToAbonamentPreview,
  previewPoolDiscount,
  rezervaLocOpen,
} from '@/features/plati/api'
import {
  getZiSedintaRapida,
  todayIso,
  type GrupaDashboard,
  type GrupaSugestieRow,
  type ZiSedintaRapida,
} from '../api'

type Curs = Pick<
  GrupaDashboard,
  'cursId' | 'cursNume' | 'sezonId' | 'pretLunar' | 'pretSedinta' | 'zile' | 'sugestii'
>

function initialsOf(nume: string, prenume: string | null): string {
  return `${nume?.[0] ?? ''}${prenume?.[0] ?? ''}`.toUpperCase() || '?'
}

function ziScurta(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ro-RO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function SugestiiSection({
  curs,
  date,
  canEnroll,
  onFormularComplet,
  navigate,
}: {
  curs: Curs
  date: string
  canEnroll: boolean
  // null = fără formular complet (pe telefon)
  onFormularComplet: ((clientId: string) => void) | null
  navigate: (to: string) => void
}) {
  const [deschis, setDeschis] = useState<string | null>(null)
  const [vechiOpen, setVechiOpen] = useState(false)
  const recent = curs.sugestii.filter((s) => s.grup === 'recent')
  const vechi = curs.sugestii.filter((s) => s.grup === 'vechi')

  const ziQ = useQuery({
    queryKey: ['zi-sedinta-rapida', curs.cursId, date],
    queryFn: () =>
      getZiSedintaRapida({
        cursId: curs.cursId,
        date,
        zile: curs.zile,
        sezonId: curs.sezonId,
        azi: todayIso(),
      }),
    enabled: canEnroll && curs.sugestii.length > 0,
  })

  if (curs.sugestii.length === 0) return null

  const renderRow = (s: GrupaSugestieRow) => (
    <SugestieRow
      key={s.clientId}
      s={s}
      curs={curs}
      date={date}
      zi={ziQ.data ?? null}
      canEnroll={canEnroll}
      open={deschis === s.clientId}
      onToggle={() => setDeschis((v) => (v === s.clientId ? null : s.clientId))}
      onDone={() => setDeschis(null)}
      onFormularComplet={onFormularComplet}
      navigate={navigate}
    />
  )

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-[13px] font-semibold text-ink">Au venit recent</span>
        <Badge tone={recent.length ? 'warn' : 'neutral'}>{recent.length}</Badge>
      </div>
      <div className="px-4 pb-2 pt-1 text-xs text-muted">
        Au fost prezenți la grupă în ultimele 30 de zile, dar n-au acces în {ziScurta(date)} —
        nici abonament pe lună, nici ședința rezervată. Nu intră în roster până nu alegi
        „Lunar” sau „Pe ședință”.
      </div>
      {recent.length === 0 && (
        <div className="border-t border-line-2 px-4 py-2.5 text-xs text-muted">
          Nimeni din ultimele 30 de zile.
        </div>
      )}
      {recent.map(renderRow)}

      {vechi.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setVechiOpen((v) => !v)}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left"
            aria-expanded={vechiOpen}
          >
            <span className="text-[13px] font-semibold text-ink">Mai vechi — de recuperat</span>
            <Badge tone="neutral">{vechi.length}</Badge>
            <span className="flex-1" />
            <span className="text-xs text-muted">{vechiOpen ? 'Ascunde' : 'Arată'}</span>
          </button>
          {vechiOpen && (
            <>
              <div className="border-t border-line-2 px-4 py-2 text-xs text-muted">
                Au venit în ultimele 6 luni, dar nu în ultimele 30 de zile. Cei marcați cu ↪ vin
                în continuare la altă grupă — pe ei nu-i suna ca pe cei pierduți.
              </div>
              {vechi.map(renderRow)}
            </>
          )}
        </>
      )}
    </div>
  )
}

function SugestieRow({
  s,
  curs,
  date,
  zi,
  canEnroll,
  open,
  onToggle,
  onDone,
  onFormularComplet,
  navigate,
}: {
  s: GrupaSugestieRow
  curs: Curs
  date: string
  zi: ZiSedintaRapida | null
  canEnroll: boolean
  open: boolean
  onToggle: () => void
  onDone: () => void
  onFormularComplet: ((clientId: string) => void) | null
  navigate: (to: string) => void
}) {
  const name = [s.nume, s.prenume].filter(Boolean).join(' ')
  const waHref = waLink(
    s.telefon,
    `Bună ziua! Vă scriem de la Quasar Dance în legătură cu ${s.prenume || s.nume}.`,
  )
  const detaliu =
    s.grup === 'recent'
      ? `prezent la ${s.zilePrezente} ${s.zilePrezente === 1 ? 'ședință' : 'ședințe'} în ultimele 30 de zile · ultima ${formatDate(s.ultimaPrezenta)}`
      : s.ultimaPrezenta
        ? `ultima prezență pe această grupă ${formatDate(s.ultimaPrezenta)}`
        : s.ultimaLuna
          ? `ultima înrolare ${formatMonth(s.ultimaLuna)}`
          : '—'

  return (
    <div className="border-t border-line-2">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-bg text-[11px] font-bold text-muted-2">
          {s.poza ? (
            <img src={s.poza} alt={name} className="h-full w-full object-cover" />
          ) : (
            initialsOf(s.nume, s.prenume)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block text-[11px] text-muted">{detaliu}</span>
          {s.vineLa && (
            <span className="block truncate text-[11px] font-medium text-success">
              ↪ vine la {vineLaLabel(s.vineLa, curs.cursNume)} — {formatDate(s.vineLa.data)}
            </span>
          )}
        </span>
        {canEnroll && (
          <Button
            variant={open ? 'primary' : 'secondary'}
            onClick={onToggle}
            aria-expanded={open}
          >
            Înrolează
          </Button>
        )}
        <button
          type="button"
          onClick={() => navigate(`/clienti/${s.clientId}`)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-card text-muted-2 max-md:hidden"
          aria-label="Profil cursant"
          title="Profil cursant"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="12" cy="8" r="3.4" />
            <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
          </svg>
        </button>
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-success/30 bg-card text-success"
            aria-label="Scrie părintelui pe WhatsApp"
            title="Scrie părintelui pe WhatsApp"
          >
            <WhatsAppIcon className="h-[15px] w-[15px]" />
          </a>
        )}
      </div>
      {open && (
        <InrolareRapida
          s={s}
          curs={curs}
          date={date}
          zi={zi}
          onDone={onDone}
          onFormularComplet={onFormularComplet}
        />
      )}
    </div>
  )
}

function InrolareRapida({
  s,
  curs,
  date,
  zi,
  onDone,
  onFormularComplet,
}: {
  s: GrupaSugestieRow
  curs: Curs
  date: string
  zi: ZiSedintaRapida | null
  onDone: () => void
  onFormularComplet: ((clientId: string) => void) | null
}) {
  const queryClient = useQueryClient()
  const { locatieId } = useWorkingLocatie()
  const [eroare, setEroare] = useState<string | null>(null)

  const lunaStart = `${date.slice(0, 7)}-01`
  const lunaNume = new Date(`${lunaStart}T12:00:00`).toLocaleDateString('ro-RO', { month: 'long' })
  const lunaTrecuta = lunaStart < `${todayIso().slice(0, 7)}-01`
  const conversie = s.sedintaLunaId != null

  const pretQ = useQuery({
    queryKey: ['preview-pool-discount', s.clientId, curs.cursId, 'Per luna', curs.pretLunar, false],
    queryFn: () =>
      previewPoolDiscount({
        client: s.clientId,
        cursId: curs.cursId,
        tipPlata: 'Per luna',
        sumaBaza: curs.pretLunar!,
      }),
    enabled: !conversie && curs.pretLunar != null,
    staleTime: 30_000,
  })
  const conversieQ = useQuery({
    queryKey: ['sedinte-to-abonament', s.sedintaLunaId],
    queryFn: () => getSedinteToAbonamentPreview({ enrollmentId: s.sedintaLunaId! }),
    enabled: conversie,
  })
  const pretLunar = pretQ.data?.suma_finala ?? curs.pretLunar

  const sedinteRamase = countSessionsBetween(date, endOfMonth(lunaStart), curs.zile)
  const dupa15 = !conversie && Number(date.slice(8, 10)) > 15
  const valoareRamasa = sedinteRamase * (curs.pretSedinta ?? 0)

  const dupaSucces = () => {
    void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard', curs.cursId] })
    void queryClient.invalidateQueries({ queryKey: ['zi-sedinta-rapida', curs.cursId] })
    void queryClient.invalidateQueries({ queryKey: ['open-sesiune'] })
    void queryClient.invalidateQueries({ queryKey: ['open-rezervari'] })
    void queryClient.invalidateQueries({ queryKey: ['plati'] })
    void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['client'] })
    onDone()
  }

  const lunarMut = useMutation({
    mutationFn: async () => {
      if (conversie) {
        await convertSedinteInAbonament({
          clientId: s.clientId,
          cursId: curs.cursId,
          luna: lunaStart,
          motiv: 'Abonat din roster — ședințele plătite devin avans',
        })
        return
      }
      await createInrolari({
        client: s.clientId,
        cursId: curs.cursId,
        tipInrolare: 'facultativ',
        tipPlata: 'Per luna',
        dataIncepere: date,
      })
    },
    onMutate: () => setEroare(null),
    onSuccess: dupaSucces,
    onError: (e) => setEroare(humanizeError(e, 'Înrolarea nu s-a salvat.')),
    meta: { erroareAfisata: true },
  })

  const sedintaMut = useMutation({
    mutationFn: () => {
      if (!zi?.ok) throw new Error('Ziua nu se poate rezerva.')
      return rezervaLocOpen({
        clientId: s.clientId,
        suma: 0,
        metoda: 'Cash',
        pret: curs.pretSedinta,
        locatieId: locatieId!,
        sesiuneId: zi.sesiuneId,
        cursId: curs.cursId,
        data: date,
        instructorId: null,
      })
    },
    onMutate: () => setEroare(null),
    onSuccess: dupaSucces,
    onError: (e) => setEroare(humanizeError(e, 'Rezervarea nu s-a salvat.')),
    meta: { erroareAfisata: true },
  })

  const pending = lunarMut.isPending || sedintaMut.isPending

  const lunarBlocat = lunaTrecuta
    ? 'Luna e încheiată — nu se mai deschide.'
    : curs.pretLunar == null
      ? 'Grupa nu are preț lunar.'
      : conversie && conversieQ.data && !conversieQ.data.applicable
        ? (conversieQ.data.reason ?? 'Conversia nu se poate face.')
        : null
  const plina = zi?.ok === true && zi.ocupate >= zi.capacitate
  const sedintaBlocat =
    curs.pretSedinta == null
      ? 'Grupa nu are preț pe ședință.'
      : zi == null
        ? 'Se verifică ziua…'
        : !zi.ok
          ? zi.motiv
          : plina
            ? `Ședința e plină (${zi.ocupate}/${zi.capacitate}) — pentru suprarezervare folosește formularul complet.`
            : !locatieId
              ? 'Setează locația de lucru din bara de sus (📍 lângă dată).'
              : null

  const cp = conversieQ.data
  const lunar = (
    <OptiuneButon
      key="lunar"
      track={conversie ? 'sugestii.abonare' : 'sugestii.lunar'}
      titlu={
        conversie
          ? `Abonează — ${lunaNume} · ${formatRON(cp?.pretLunar ?? curs.pretLunar)}`
          : `Lunar — ${lunaNume} · ${pretQ.isLoading ? '…' : formatRON(pretLunar)}`
      }
      detaliu={
        conversie
          ? cp?.applicable
            ? `${cp.sedinte?.length ?? 0} ${cp.sedinte?.length === 1 ? 'ședință din luna asta intră' : 'ședințe din luna asta intră'} în abonament${cp.platit ? ` · plătit deja ${formatRON(cp.platit)}, devine avans` : ''} · ${cp.credit ? `credit ${formatRON(cp.credit)}` : `rămân de achitat ${formatRON(cp.deIncasat)}`}`
            : conversieQ.isLoading
              ? 'Se calculează avansul…'
              : null
          : pretQ.data && curs.pretLunar != null && pretQ.data.suma_finala < curs.pretLunar
            ? `reducere de familie / al doilea curs (preț de listă ${formatRON(curs.pretLunar)})`
            : 'acces la toate ședințele lunii'
      }
      blocat={lunarBlocat}
      pending={lunarMut.isPending}
      disabled={pending}
      onClick={() => lunarMut.mutate()}
    />
  )
  const sedinta = (
    <OptiuneButon
      key="sedinta"
      track="sugestii.sedinta"
      titlu={`Pe ședință — ${ziScurta(date)} · ${formatRON(curs.pretSedinta)}`}
      detaliu="doar ședința din ziua asta"
      blocat={sedintaBlocat}
      pending={sedintaMut.isPending}
      disabled={pending}
      onClick={() => sedintaMut.mutate()}
    />
  )

  return (
    <div className="mx-4 mb-3 rounded-xl border border-line bg-surface px-3 py-3">
      {dupa15 && !lunaTrecuta && (
        <div className="mb-2 rounded-lg bg-warn-bg px-2.5 py-1.5 text-[12px] text-warn">
          După 15: mai sunt {sedinteRamase} {sedinteRamase === 1 ? 'ședință' : 'ședințe'} în{' '}
          {lunaNume} — pe ședință ar costa {formatRON(valoareRamasa)}, abonamentul{' '}
          {formatRON(pretLunar)}. De regulă se plătește pe ședință.
        </div>
      )}
      <div className="flex flex-col gap-2">{dupa15 ? [sedinta, lunar] : [lunar, sedinta]}</div>
      {eroare && <div className="mt-2 text-[12px] font-medium text-danger">{eroare}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>Înrolare fără încasare — suma rămâne de achitat; încasezi din butonul $ de pe card.</span>
        {onFormularComplet && (
          <button
            type="button"
            onClick={() => onFormularComplet(s.clientId)}
            className="font-semibold text-ink underline underline-offset-2"
          >
            Formular complet (voucher, excepții)
          </button>
        )}
      </div>
    </div>
  )
}

function OptiuneButon({
  track,
  titlu,
  detaliu,
  blocat,
  pending,
  disabled,
  onClick,
}: {
  track: string
  titlu: string
  detaliu: string | null
  blocat: string | null
  pending: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-track={track}
      onClick={onClick}
      disabled={disabled || blocat != null}
      className="flex w-full items-center gap-3 rounded-[10px] border border-line bg-card px-3 py-2 text-left transition-colors hover:border-quasar-yellow disabled:cursor-not-allowed disabled:opacity-60 max-md:min-h-12"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{titlu}</span>
        <span className="block text-[11px] text-muted">{blocat ?? detaliu}</span>
      </span>
      {pending && <Spinner />}
    </button>
  )
}
