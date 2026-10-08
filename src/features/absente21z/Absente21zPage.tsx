import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, DataTable, Badge, Button, Tabs, Tooltip, type Column } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { getWorklistAbsente } from './api'
import { ContactAbsentaModal, type CerereReziliere } from './ContactAbsentaModal'
import { ReziliereDinAbsentaModal } from './ReziliereDinAbsentaModal'
import { DecizieManagerModal } from './DecizieManagerModal'
import { CerereReziliereModal } from './CerereReziliereModal'
import { ProceduraAbsenteModal } from './ProceduraAbsenteModal'
import { STARE_PROCEDURA, STARI_INCHISE } from './procedura'
import { urgenta, type CazAbsenta } from './types'

type Tab = 'de_sunat' | 'asteptare' | 'de_confirmat' | 'istoric'
const TABURI: Tab[] = ['de_sunat', 'asteptare', 'de_confirmat', 'istoric']

function dataRo(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10).split('-').reverse().join('.')
}

function zileDe(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

// Rândul de sub stare: ce se întâmplă concret cu cazul acum.
function detaliuStare(r: CazAbsenta): string {
  switch (r.stare) {
    case 'de_contactat':
      return `${Math.floor(r.ore_de_la_intrare)} h lucrătoare în listă`
    case 'reincercare':
      return r.de_sunat ? 'al doilea apel — azi' : `al doilea apel pe ${dataRo(r.urmatoarea_incercare)}`
    case 'amanat':
      return r.de_sunat ? 'revine azi — sună familia' : `revine pe ${dataRo(r.urmatoarea_incercare)}`
    case 'fara_raspuns':
      if (r.sms_fara_raspuns_eroare) return `SMS-ul nu a plecat: ${r.sms_fara_raspuns_eroare}`
      return r.sms_fara_raspuns_la
        ? `SMS trimis pe ${dataRo(r.sms_fara_raspuns_la)}`
        : 'SMS-ul pleacă la 16:00 (luni–vineri)'
    case 'de_confirmat':
      return `așteaptă managerul de ${zileDe(r.reziliere_propusa_la)} zile`
    case 'reziliat':
    case 'pastrat':
      return r.reziliere_decisa_la ? `decis pe ${dataRo(r.reziliere_decisa_la)}` : ''
    default:
      return ''
  }
}

function StareBadge({ r }: { r: CazAbsenta }) {
  const p = STARE_PROCEDURA[r.stare]
  const u = urgenta(r)
  const ton = r.stare === 'de_contactat' ? (u === 'rosu' ? 'danger' : u === 'galben' ? 'warn' : 'success') : p.ton
  return (
    <Tooltip
      width={320}
      content={
        <div className="space-y-2">
          <div>
            <div className="text-sm font-semibold text-quasar-yellow">{p.eticheta}</div>
            <div className="mt-0.5 text-white/65">{p.inseamna}</div>
          </div>
          <div className="space-y-1.5 border-t border-white/15 pt-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/45">Ce faci tu</div>
              <div className="text-white/90">{p.peScurt.ceFaci}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/45">Ce face aplicația</div>
              <div className="text-white/90">{p.peScurt.aplicatia}</div>
            </div>
          </div>
          <div className="text-[10px] text-white/40">ℹ︎ Procedura din capul paginii = toți pașii</div>
        </div>
      }
    >
      <span className="cursor-help">
        <Badge tone={ton}>{p.eticheta}</Badge>
      </span>
    </Tooltip>
  )
}

export default function Absente21zPage() {
  const { locatieId } = useWorkingLocatie()
  const { role } = useAuth()
  const esteManager = isManagerOrHigher(role)
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABURI.includes(tabParam) ? tabParam : 'de_sunat'
  const setTab = (t: Tab) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (t === 'de_sunat') n.delete('tab')
      else n.set('tab', t)
      return n
    })

  const [caz, setCaz] = useState<CazAbsenta | null>(null)
  const [decizie, setDecizie] = useState<CazAbsenta | null>(null)
  const [reziliere, setReziliere] = useState<CerereReziliere | null>(null)
  const [procedura, setProcedura] = useState(false)
  const [cerereSemnat, setCerereSemnat] = useState<{ id: string; nume: string; dupaReziliere: boolean } | null>(null)
  const peReziliat = useCallback(
    (c: CerereReziliere) => setCerereSemnat({ id: c.caz.client_id, nume: c.caz.client_nume, dupaReziliere: true }),
    [],
  )
  const inchideReziliere = useCallback(() => setReziliere(null), [])

  const locatii = useMemo(
    () => (locatieId && locatieId !== '__ALL__' ? [locatieId] : null),
    [locatieId],
  )

  const q = useQuery({
    queryKey: ['absente-21z', locatii],
    queryFn: () => getWorklistAbsente(locatii),
    staleTime: 60_000,
  })

  const toate = q.data ?? []
  const grupe: Record<Tab, CazAbsenta[]> = {
    de_sunat: toate.filter((c) => c.de_sunat),
    asteptare: toate.filter(
      (c) => !c.de_sunat && ['reincercare', 'amanat', 'fara_raspuns'].includes(c.stare),
    ),
    de_confirmat: toate.filter((c) => c.stare === 'de_confirmat'),
    istoric: toate.filter((c) => STARI_INCHISE.includes(c.stare)),
  }
  const randuri = grupe[tab]
  const depasite = grupe.de_sunat.filter(
    (c) => c.stare === 'de_contactat' && c.ore_de_la_intrare >= 48,
  ).length

  const columns: Column<CazAbsenta>[] = [
    {
      header: 'Cursant',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.client_nume}</div>
          <div className="text-xs text-quasar-gray">
            {r.curs_nume}
            {r.telefon && ` · ${r.telefon}`}
          </div>
        </div>
      ),
      sortValue: (r) => r.client_nume,
    },
    {
      header: 'Tăcere',
      cell: (r) => (
        <div>
          <div>{r.zile_tacere} zile</div>
          <div className="text-xs text-quasar-gray">
            {r.ultima_prezenta ? `ultima: ${r.ultima_prezenta}` : 'nu a venit niciodată'}
          </div>
        </div>
      ),
      sortValue: (r) => r.zile_tacere,
      defaultDir: 'desc',
    },
    {
      header: 'Stare',
      cell: (r) => (
        <div>
          <StareBadge r={r} />
          <div className="mt-0.5 text-xs text-quasar-gray">{detaliuStare(r)}</div>
        </div>
      ),
      sortValue: (r) => (r.stare === 'de_contactat' ? 1000 + r.ore_de_la_intrare : r.incercari),
      defaultDir: 'desc',
    },
    {
      header: 'Motiv',
      cell: (r) => r.motiv ?? <span className="text-quasar-gray">—</span>,
      sortValue: (r) => r.motiv ?? '',
    },
    {
      header: 'K3',
      cell: (r) =>
        r.exclus_k3 ? (
          <span className="text-xs text-quasar-gray">în afara K3</span>
        ) : r.reactivat == null ? (
          <span className="text-xs text-quasar-gray">fereastră deschisă</span>
        ) : r.reactivat ? (
          <Badge tone="success">reactivat {r.reactivat_la}</Badge>
        ) : (
          <Badge tone="neutral">nereactivat</Badge>
        ),
      sortValue: (r) => (r.exclus_k3 ? -1 : r.reactivat == null ? 0 : r.reactivat ? 2 : 1),
    },
    {
      header: '',
      cell: (r) => {
        if (r.stare === 'de_confirmat' && esteManager) {
          return (
            <Button
              variant="danger"
              onClick={(e) => {
                e.stopPropagation()
                setDecizie(r)
              }}
            >
              Decide
            </Button>
          )
        }
        if (r.de_sunat) {
          return (
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation()
                setCaz(r)
              }}
            >
              📞 Notează apelul
            </Button>
          )
        }
        // Familia sună înapoi (după SMS, înainte de reîncercare): discuția se notează tot pe caz.
        if (['reincercare', 'amanat', 'fara_raspuns', 'de_confirmat', 'revine'].includes(r.stare)) {
          return (
            <button
              type="button"
              className="text-xs text-quasar-gray underline-offset-2 hover:text-quasar-black hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                setCaz(r)
              }}
            >
              notează o discuție
            </button>
          )
        }
        if (['renunta', 'amanat', 'reziliat'].includes(r.stare)) {
          return (
            <button
              type="button"
              className="text-xs text-quasar-gray underline-offset-2 hover:text-quasar-black hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                setCerereSemnat({ id: r.client_id, nume: r.client_nume, dupaReziliere: false })
              }}
            >
              📄 cerere de reziliere
            </button>
          )
        }
        return null
      },
    },
  ]

  const goale: Record<Tab, string> = {
    de_sunat: 'Nimic de sunat azi. Lista se completează automat în fiecare dimineață.',
    asteptare: 'Niciun caz în așteptare.',
    de_confirmat: 'Nicio reziliere de confirmat.',
    istoric: 'Niciun caz închis încă.',
  }

  return (
    <>
      <PageHeader
        title="Absenți de 21 de zile"
        subtitle="Cursanți care au încetat să vină. Primul apel în maximum 48 de ore lucrătoare (fără weekend)."
        actions={
          <Button variant="secondary" onClick={() => setProcedura(true)}>
            ℹ︎ Procedura
          </Button>
        }
      />

      {depasite > 0 && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <strong>{depasite}</strong>{' '}
          {depasite === 1 ? 'caz a depășit' : 'cazuri au depășit'} 48 de ore lucrătoare fără niciun apel.
        </div>
      )}

      {grupe.de_confirmat.length > 0 && tab !== 'de_confirmat' && (
        <button
          type="button"
          onClick={() => setTab('de_confirmat')}
          className="mb-4 block w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-800"
        >
          <strong>{grupe.de_confirmat.length}</strong>{' '}
          {grupe.de_confirmat.length === 1 ? 'reziliere așteaptă' : 'rezilieri așteaptă'} decizia managerului →
        </button>
      )}

      <Tabs
        tabs={[
          { id: 'de_sunat', label: `De sunat azi (${grupe.de_sunat.length})` },
          { id: 'asteptare', label: `În așteptare (${grupe.asteptare.length})` },
          { id: 'de_confirmat', label: `La manager (${grupe.de_confirmat.length})` },
          { id: 'istoric', label: `Istoric (${grupe.istoric.length})` },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      <div className="mt-4">
        {q.isLoading ? (
          <p className="text-sm text-quasar-gray">Se încarcă…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={randuri}
            rowKey={(r) => r.id}
            defaultSort={{ idx: 2, dir: 'desc' }}
            emptyMessage={goale[tab]}
            rowClassName={(r) =>
              r.stare === 'de_contactat' && r.ore_de_la_intrare >= 48 ? 'bg-red-50/60' : undefined
            }
          />
        )}
      </div>

      <ContactAbsentaModal
        open={caz != null}
        caz={caz}
        onClose={() => setCaz(null)}
        onCereReziliere={setReziliere}
      />
      <ReziliereDinAbsentaModal cerere={reziliere} onClose={inchideReziliere} onReziliat={peReziliat} />
      <CerereReziliereModal
        key={cerereSemnat?.id ?? 'niciuna'}
        client={cerereSemnat}
        dupaReziliere={cerereSemnat?.dupaReziliere}
        onClose={() => setCerereSemnat(null)}
      />
      <DecizieManagerModal caz={decizie} onClose={() => setDecizie(null)} />
      <ProceduraAbsenteModal open={procedura} onClose={() => setProcedura(false)} />
    </>
  )
}
