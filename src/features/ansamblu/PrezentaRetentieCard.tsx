import type { ReactNode } from 'react'
import { Spinner, Tooltip } from '@/components/ui'
import type { RataPrezentaLuna, RetentieLuna } from '@/features/statistici/api'

type Props = {
  prezenta: RataPrezentaLuna | undefined
  retentie: RetentieLuna | undefined
  loading: boolean
  /** Fereastra acoperită de rata de prezență, ex. „1–21 sep". */
  perioadaPrezenta: string
  /** Lunile încheiate pe care le compară retenția, ex. „iulie" și „august". */
  lunaDe: string
  lunaLa: string
  /** Retenția cade pe lunile de vacanță — cifra nu descrie școala. */
  retentieInVacanta: boolean
}

const INFO_PREZENTA = (
  <>
    <p className="font-semibold">Cum se calculează</p>
    <p className="mt-1">
      Prezențe marcate împărțit la locurile din rosterul ședințelor ținute de la 1
      ale lunii până azi.
    </p>
    <p className="mt-1.5">
      Intră doar cursurile recurente și trupele — facultativele și grupele
      suspendate rămân afară.
    </p>
  </>
)

const INFO_RETENTIE = (
  <>
    <p className="font-semibold">Cum se calculează</p>
    <p className="mt-1">
      Din cursanții prezenți în prima lună, câți au mai venit măcar o dată în a
      doua. Ambele luni sunt încheiate — luna în curs încă nu poate fi măsurată.
    </p>
    <p className="mt-1.5">
      Se măsoară pe prezență, nu pe contract: abonamentele „per lună" n-au dată de
      final, deci pe hârtie n-ar pleca nimeni niciodată.
    </p>
  </>
)

function Bloc({
  titlu,
  info,
  procent,
  detaliu,
  nota,
}: {
  titlu: string
  info: ReactNode
  procent: number | null
  detaliu: string
  nota?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {titlu}
        </span>
        <Tooltip content={info} width={300}>
          <span
            role="button"
            tabIndex={0}
            aria-label="Cum se calculează"
            className="flex h-4 w-4 items-center justify-center rounded-full border border-muted text-[10px] font-bold leading-none text-muted transition-colors hover:border-ink hover:text-ink focus:border-ink focus:text-ink focus:outline-none"
          >
            i
          </span>
        </Tooltip>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="fnum font-display text-3xl font-bold tracking-tight text-ink">
          {procent == null ? '—' : `${procent.toLocaleString('ro-RO')}%`}
        </span>
        <span className="fnum shrink-0 text-xs text-muted-2">{detaliu}</span>
      </div>
      {procent != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-quasar-yellow"
            style={{ width: `${Math.min(100, procent)}%` }}
          />
        </div>
      )}
      {nota && <p className="mt-2 text-xs text-muted-2">{nota}</p>}
    </div>
  )
}

export function PrezentaRetentieCard({
  prezenta,
  retentie,
  loading,
  perioadaPrezenta,
  lunaDe,
  lunaLa,
  retentieInVacanta,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-card p-5">
        <Spinner />
      </div>
    )
  }

  const areBazaPrezenta = (prezenta?.global.posibile ?? 0) > 0
  const areBazaRetentie = (retentie?.bazaPrev ?? 0) > 0

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-card p-5">
      <Bloc
        titlu={`Rată prezență · ${perioadaPrezenta}`}
        info={INFO_PREZENTA}
        procent={areBazaPrezenta ? (prezenta?.global.rata ?? null) : null}
        detaliu={
          areBazaPrezenta
            ? `${prezenta!.global.prezenti} din ${prezenta!.global.posibile}`
            : 'nicio ședință ținută încă'
        }
      />
      <div className="border-t border-line" />
      <Bloc
        titlu={`Retenție · ${lunaDe} → ${lunaLa}`}
        info={INFO_RETENTIE}
        procent={areBazaRetentie ? (retentie?.rata ?? null) : null}
        detaliu={
          areBazaRetentie
            ? `${retentie!.retinuti} din ${retentie!.bazaPrev}`
            : `nicio prezență la cursuri recurente în ${lunaDe}`
        }
        nota={
          areBazaRetentie && retentieInVacanta
            ? 'Lunile comparate sunt de vacanță — cifra descrie pauza, nu sezonul.'
            : undefined
        }
      />
    </div>
  )
}
