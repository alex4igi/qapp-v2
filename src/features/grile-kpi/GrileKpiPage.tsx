import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, DataTable, Badge, Button, Tabs, type Column } from '@/components/ui'
import { getDefinitiiKpi, getGrile, getSabloane } from './api'
import { AtribuieGrilaModal } from './AtribuieGrilaModal'
import type { GrilaSumar, KpiDefinitie, Sablon } from './types'

export default function GrileKpiPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'grile' | 'sabloane' | 'catalog'>('grile')
  const [modal, setModal] = useState(false)

  const grile = useQuery({ queryKey: ['kpi-grile'], queryFn: getGrile })
  const sabloane = useQuery({ queryKey: ['kpi-sabloane'], queryFn: getSabloane })
  const definitii = useQuery({ queryKey: ['kpi-definitii'], queryFn: getDefinitiiKpi })

  const colGrile: Column<GrilaSumar>[] = [
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
      header: 'Perioadă',
      cell: (r) => (r.perioada === 'vara' ? 'vară' : 'sezon'),
      sortValue: (r) => r.perioada,
    },
    {
      header: 'Valabilă',
      cell: (r) => `${r.valabil_de_la} → ${r.valabil_pana_la ?? '…'}`,
      sortValue: (r) => r.valabil_de_la,
      defaultDir: 'desc',
    },
    {
      header: 'Ponderi',
      cell: (r) => (
        <span className={Math.abs(r.pondere_totala - 100) > 0.01 ? 'text-warn' : undefined}>
          {r.pondere_totala}%
        </span>
      ),
      sortValue: (r) => r.pondere_totala,
    },
    {
      header: 'Stare',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Badge tone={r.stare === 'activa' ? 'success' : r.stare === 'ciorna' ? 'warn' : 'neutral'}>
            {r.stare}
          </Badge>
          {r.sume_lipsa > 0 && <Badge tone="danger">{r.sume_lipsa} sume lipsă</Badge>}
        </div>
      ),
      sortValue: (r) => r.stare,
    },
  ]

  const colSabloane: Column<Sablon>[] = [
    { header: 'Șablon', cell: (r) => r.nume, sortValue: (r) => r.nume },
    { header: 'Post', cell: (r) => r.post, sortValue: (r) => r.post },
    {
      header: 'Perioadă',
      cell: (r) => (r.perioada === 'vara' ? 'vară' : 'sezon'),
      sortValue: (r) => r.perioada,
    },
    { header: 'Cotă manager', cell: (r) => `${Math.round(r.cota_manager * 100)}%` },
    { header: 'Stare', cell: (r) => <Badge tone="neutral">{r.stare}</Badge> },
  ]

  const colCatalog: Column<KpiDefinitie>[] = [
    {
      header: 'Indicator',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.denumire}</div>
          {r.descriere && <div className="max-w-xl text-xs text-muted">{r.descriere}</div>}
        </div>
      ),
      sortValue: (r) => r.ordine,
    },
    {
      header: 'Sursă',
      cell: (r) => (
        <Badge tone={r.sursa === 'auto' ? 'success' : 'neutral'}>
          {r.sursa === 'auto' ? 'automat' : 'manual'}
        </Badge>
      ),
      sortValue: (r) => r.sursa,
    },
    { header: 'Tip', cell: (r) => r.tip_valoare, sortValue: (r) => r.tip_valoare },
    {
      header: 'Numere editabile',
      cell: (r) =>
        r.parametri_schema?.length ? (
          <span className="text-xs text-muted">
            {r.parametri_schema.map((p) => p.eticheta).join(' · ')}
          </span>
        ) : (
          <span className="text-xs text-muted-2">—</span>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Grile KPI"
        subtitle="Bonusurile fiecărui angajat: ponderi, condiții, praguri și sume — toate editabile aici."
        actions={<Button onClick={() => setModal(true)}>+ Atribuie o grilă</Button>}
      />

      <Tabs
        tabs={[
          { id: 'grile', label: `Grile active (${grile.data?.length ?? 0})` },
          { id: 'sabloane', label: `Șabloane (${sabloane.data?.length ?? 0})` },
          { id: 'catalog', label: `Catalog KPI (${definitii.data?.length ?? 0})` },
        ]}
        active={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      <div className="mt-4">
        {tab === 'grile' && (
          <DataTable
            columns={colGrile}
            rows={grile.data ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/grile-kpi/${r.id}`)}
            emptyMessage="Nicio grilă atribuită. Începe cu „Atribuie o grilă”."
          />
        )}
        {tab === 'sabloane' && (
          <>
            <p className="mb-3 text-sm text-muted">
              Șablonul e structura pe post. La atribuire se <strong>copiază</strong> în
              grila angajatului — modificările de aici nu ating grilele deja create.
            </p>
            <DataTable
              columns={colSabloane}
              rows={sabloane.data ?? []}
              rowKey={(r) => r.id}
              emptyMessage="Niciun șablon."
            />
          </>
        )}
        {tab === 'catalog' && (
          <>
            <p className="mb-3 text-sm text-muted">
              Indicatorii <strong>automați</strong> se calculează din datele din qapp.
              Cei <strong>manuali</strong> se completează lunar de manager. Numerele din
              ultima coloană se editează pe fiecare grilă în parte.
            </p>
            <DataTable
              columns={colCatalog}
              rows={definitii.data ?? []}
              rowKey={(r) => r.id}
              emptyMessage="Catalog gol."
            />
          </>
        )}
      </div>

      <AtribuieGrilaModal
        open={modal}
        onClose={() => setModal(false)}
        onCreat={(id) => navigate(`/grile-kpi/${id}`)}
      />
    </>
  )
}
