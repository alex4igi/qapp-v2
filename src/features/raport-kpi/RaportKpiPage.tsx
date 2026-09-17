import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PageHeader, MonthPicker, Badge, Button, Spinner, DataTable, KebabMenu, type Column,
} from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { humanizeError } from '@/lib/errorMessage'
import { formatRON } from '@/lib/format'
import {
  calculeazaRaport, deschideRaport, getCampuriManuale, getManual, getRapoarte,
  inchideLuna, redeschideLuna, salveazaManual,
} from './api'
import { CampuriManualeForm } from './CampuriManualeForm'
import { EliminatoriiCard } from './EliminatoriiCard'
import { InchideLunaModal } from './InchideLunaModal'
import { KpiSectiune } from './KpiSectiune'
import { printRaportKpi } from './print/printRaportKpi'
import { LUNI_LUNG, type CampManual, type RandLista, type ValoriManuale } from './types'

function lunaCurenta(): string {
  // Raportul se închide la începutul lunii următoare, deci deschidem pe luna
  // trecută: e cea pe care omul o are efectiv de închis.
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function RaportKpiPage() {
  const [luna, setLuna] = useState(lunaCurenta)
  const [grilaId, setGrilaId] = useState<string | null>(null)

  const [anul, lunaNr] = useMemo(() => {
    const [y, m] = luna.split('-')
    return [Number(y), Number(m)]
  }, [luna])

  const lista = useQuery({
    queryKey: ['rapoarte-kpi', anul, lunaNr],
    queryFn: () => getRapoarte(anul, lunaNr),
  })
  const campuri = useQuery({ queryKey: ['kpi-campuri'], queryFn: getCampuriManuale })

  const coloane: Column<RandLista>[] = [
    {
      header: 'Angajat',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.titular_nume}</div>
          <div className="text-xs text-muted">{r.locatii ?? 'fără punct de lucru'}</div>
        </div>
      ),
      sortValue: (r) => r.titular_nume,
    },
    { header: 'Post', cell: (r) => r.post, sortValue: (r) => r.post },
    {
      header: 'Grilă',
      cell: (r) => (
        <Badge tone={r.grila_stare === 'activa' ? 'success' : 'warn'}>{r.grila_stare}</Badge>
      ),
      sortValue: (r) => r.grila_stare,
    },
    {
      header: 'Luna',
      cell: (r) => (
        <Badge
          tone={
            r.raport_stare === 'inchis' ? 'success' : r.raport_stare === 'draft' ? 'warn' : 'neutral'
          }
        >
          {r.raport_stare === 'nedeschis' ? 'nedeschisă' : r.raport_stare}
        </Badge>
      ),
      sortValue: (r) => r.raport_stare,
    },
    {
      header: 'Bonus',
      cell: (r) => (r.bonus_titular == null ? '—' : formatRON(Number(r.bonus_titular))),
      className: 'text-right',
      sortValue: (r) => Number(r.bonus_titular ?? 0),
    },
  ]

  return (
    <>
      <PageHeader
        title="Raport KPI lunar"
        subtitle="Bonusul pe indicatori, pe angajat. Se calculează din grila lui și se închide o dată pe lună."
      />

      <div className="mb-4 max-w-xs">
        <MonthPicker value={luna} onChange={setLuna} />
      </div>

      {lista.isLoading ? (
        <Spinner />
      ) : (lista.data ?? []).length === 0 ? (
        <p className="text-sm text-muted">
          Nicio grilă KPI nu acoperă {LUNI_LUNG[lunaNr - 1]} {anul}. Grilele se creează în
          Administrare → Grile KPI.
        </p>
      ) : (
        <DataTable
          columns={coloane}
          rows={lista.data ?? []}
          rowKey={(r) => r.grila_id}
          onRowClick={(r) => setGrilaId(r.grila_id)}
        />
      )}

      {/* `key` = angajatul + luna: la schimbarea selecției componenta se
          remontează cu starea goală. Fără asta, valorile manuale ale omului
          precedent ar rămâne pe ecran un render — pe un ecran cu bani, atât e
          destul cât să fie citit greșit. */}
      {grilaId && (
        <RaportDetaliu
          key={`${grilaId}-${luna}`}
          grilaId={grilaId}
          anul={anul}
          luna={lunaNr}
          campuri={campuri.data ?? []}
        />
      )}
    </>
  )
}

function RaportDetaliu({
  grilaId, anul, luna, campuri,
}: {
  grilaId: string
  anul: number
  luna: number
  campuri: CampManual[]
}) {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const [manual, setManual] = useState<ValoriManuale>({})
  const [zile, setZile] = useState({ lucrate: '', baza: '' })
  const [modificat, setModificat] = useState(false)
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [modalInchidere, setModalInchidere] = useState(false)
  const [eroareInchidere, setEroareInchidere] = useState<string | null>(null)
  const [hidratatPentru, setHidratatPentru] = useState<string | null>(null)

  const raport = useQuery({
    queryKey: ['raport-kpi', grilaId, anul, luna],
    queryFn: () => calculeazaRaport(grilaId, anul, luna),
  })

  const raportId = raport.data?.raport_id ?? null

  const salvate = useQuery({
    queryKey: ['raport-kpi-manual', raportId],
    queryFn: () => getManual(raportId as string),
    enabled: Boolean(raportId),
  })

  // Formularul se hidratează din rândul salvat, nu din calcul: calculul e
  // derivat, rândul e sursa. Ajustare în timpul randării, nu în efect — altfel
  // un render întreg ar arăta câmpuri goale peste un raport deja salvat.
  // `modificat` e gardul: ce n-a fost încă salvat nu se suprascrie niciodată.
  if (salvate.data && raportId && hidratatPentru !== raportId && !modificat) {
    setHidratatPentru(raportId)
    setManual(salvate.data.manual)
    setZile({
      lucrate: salvate.data.zile_lucrate == null ? '' : String(salvate.data.zile_lucrate),
      baza: salvate.data.zile_baza == null ? '' : String(salvate.data.zile_baza),
    })
  }

  const deschide = useMutation({
    mutationFn: () => deschideRaport(grilaId, anul, luna),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['raport-kpi', grilaId, anul, luna] })
      void queryClient.invalidateQueries({ queryKey: ['rapoarte-kpi', anul, luna] })
    },
    onError: (e: unknown) => setMesaj(humanizeError(e, 'Nu s-a putut deschide luna.')),
  })

  const salveaza = useMutation({
    mutationFn: async () => {
      let id = raportId
      if (!id) id = await deschideRaport(grilaId, anul, luna)
      await salveazaManual(id, manual, {
        lucrate: zile.lucrate === '' ? null : Number(zile.lucrate),
        baza: zile.baza === '' ? null : Number(zile.baza),
      })
      return id
    },
    onSuccess: (id) => {
      setModificat(false)
      setMesaj('Salvat.')
      void queryClient.invalidateQueries({ queryKey: ['raport-kpi-manual', id] })
      void queryClient.invalidateQueries({ queryKey: ['raport-kpi', grilaId, anul, luna] })
    },
    onError: (e: unknown) => setMesaj(humanizeError(e, 'Eroare la salvare.')),
  })

  const inchide = useMutation({
    mutationFn: () => inchideLuna(raportId as string),
    onSuccess: () => {
      setModalInchidere(false)
      setEroareInchidere(null)
      setMesaj('Luna e închisă. Valorile sunt înghețate.')
      void queryClient.invalidateQueries({ queryKey: ['raport-kpi', grilaId, anul, luna] })
      void queryClient.invalidateQueries({ queryKey: ['raport-kpi-manual', raportId] })
      void queryClient.invalidateQueries({ queryKey: ['rapoarte-kpi', anul, luna] })
    },
    onError: (e: unknown) => setEroareInchidere(humanizeError(e, 'Luna nu a putut fi închisă.')),
  })

  const redeschide = useMutation({
    mutationFn: (motiv: string) => redeschideLuna(raportId as string, motiv),
    onSuccess: () => {
      setMesaj('Luna e redeschisă. Valorile înghețate au fost șterse.')
      void queryClient.invalidateQueries({ queryKey: ['raport-kpi', grilaId, anul, luna] })
      void queryClient.invalidateQueries({ queryKey: ['raport-kpi-manual', raportId] })
      void queryClient.invalidateQueries({ queryKey: ['rapoarte-kpi', anul, luna] })
    },
    onError: (e: unknown) => setMesaj(humanizeError(e, 'Redeschiderea a eșuat.')),
  })

  if (raport.isLoading) return <Spinner />
  if (raport.isError) {
    return (
      <div className="mt-4 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
        {humanizeError(raport.error, 'Raportul nu a putut fi calculat.')}
      </div>
    )
  }

  const r = raport.data
  if (!r) return null
  const readOnly = r.stare_raport === 'inchis'

  return (
    <>
      {mesaj && (
        <div className="mt-4 rounded-md border border-line bg-neutral-bg px-3 py-2 text-sm">
          {mesaj}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">
              {r.grila.titular_nume} · {LUNI_LUNG[r.luna - 1]} {r.anul}
            </h2>
            <p className="text-sm text-muted">
              {r.grila.locatii} · cota managerului {Math.round(r.cota_manager * 100)}%
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <KebabMenu
              items={[
                { label: 'Tipărește — intern', onClick: () => printRaportKpi(r, 'intern') },
                { label: 'Tipărește — pentru angajat', onClick: () => printRaportKpi(r, 'titular') },
                { label: 'Tipărește — pentru salarizare', onClick: () => printRaportKpi(r, 'salarizare') },
              ]}
            />
            {r.stare_raport === 'nedeschis' && (
              <Button variant="secondary" onClick={() => deschide.mutate()}>
                Deschide luna
              </Button>
            )}
            {r.stare_raport === 'draft' && (
              <Button onClick={() => { setEroareInchidere(null); setModalInchidere(true) }}>
                Închide luna
              </Button>
            )}
            {readOnly && role === 'owner' && (
              <Button
                variant="secondary"
                onClick={() => {
                  const motiv = window.prompt('De ce redeschizi luna?')
                  if (motiv) redeschide.mutate(motiv)
                }}
              >
                Redeschide
              </Button>
            )}
          </div>
        </div>

        {readOnly && (
          <div className="rounded-md border border-success/30 bg-success-bg px-3 py-2 text-sm text-success">
            Luna e închisă. Valorile de mai jos sunt cele înghețate la închidere.
          </div>
        )}

        {r.blocante.length > 0 && (
          <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
            <div className="mb-1 font-semibold">Luna nu se poate închide:</div>
            <ul className="list-inside list-disc">
              {r.blocante.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {r.avertismente.length > 0 && (
          <div className="rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
            {r.avertismente.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="text-xs text-muted">Bonus titular</div>
            <div className="text-xl font-bold text-ink">{formatRON(r.bonus_titular)}</div>
          </div>
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="text-xs text-muted">Fond total</div>
            <div className="text-xl font-bold text-ink">{formatRON(r.fond_total)}</div>
          </div>
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="text-xs text-muted">Sumă brută a liniilor</div>
            <div className="text-xl font-bold text-ink">{formatRON(r.bonus_brut)}</div>
          </div>
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="text-xs text-muted">Pondere evaluată</div>
            <div className="text-xl font-bold text-ink">
              {r.pondere_evaluata}% / {r.pondere_luna}%
            </div>
            {r.factor_redistribuire > 1.0001 && (
              <div className="text-xs text-muted">redistribuire ×{r.factor_redistribuire}</div>
            )}
          </div>
        </div>

        {r.zile.sub_prag && (
          <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
            {r.zile.lucrate} zile lucrate, sub pragul de {r.zile.prag}: luna nu se bonifică.
          </div>
        )}

        <CampuriManualeForm
          raport={r}
          campuri={campuri}
          valori={manual}
          zile={zile}
          readOnly={readOnly}
          salvand={salveaza.isPending}
          modificat={modificat}
          onChange={(kpi, camp, v) => {
            setManual((m) => ({ ...m, [kpi]: { ...(m[kpi] ?? {}), [camp]: v } }))
            setModificat(true)
          }}
          onZile={(care, v) => {
            setZile((z) => ({ ...z, [care]: v }))
            setModificat(true)
          }}
          onSave={() => salveaza.mutate()}
        />

        <div className="space-y-3">
          {r.linii.map((l) => (
            <KpiSectiune key={l.kpi_id} linie={l} />
          ))}
        </div>

        <EliminatoriiCard eliminatorii={r.eliminatorii} picat={r.eliminatoriu_picat} />
      </div>

      <InchideLunaModal
        open={modalInchidere}
        raport={r}
        eroare={eroareInchidere}
        seLucreaza={inchide.isPending}
        onClose={() => setModalInchidere(false)}
        onConfirm={() => inchide.mutate()}
      />
    </>
  )
}
