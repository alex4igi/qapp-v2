import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, DataTable, PageHeader, Tabs, type Column } from '@/components/ui'
import { formatDate, formatRON } from '@/lib/format'
import { LeadModal } from '@/features/leads/LeadModal'
import type { Lead } from '@/types/db'
import { supabase } from '@/lib/supabase'
import {
  STATUS_LABEL,
  getCampanieActiva,
  raportRecomandari,
  type RandRaportRecomandare,
  type StatusRecomandare,
} from './api'

const TONE: Record<StatusRecomandare, 'neutral' | 'warn' | 'success' | 'danger' | 'brand'> = {
  declarat: 'warn',
  verificat: 'brand',
  proba: 'brand',
  inrolat: 'brand',
  eligibil: 'warn',
  recompensat: 'success',
  anulat: 'danger',
}

type TabId = 'de_verificat' | 'in_curs' | 'toate'

// Registrul campaniei de recomandări: ce are recepția de confirmat și raportul pe
// canal / familie / grupă, cu urmărirea pe cele două luni de după (regulile în
// docs/reguli-domeniu.md §Recomandări).
export default function RecomandariPage() {
  const [tab, setTab] = useState<TabId>('de_verificat')
  const [leadDeschis, setLeadDeschis] = useState<Lead | null>(null)
  const campQ = useQuery({ queryKey: ['recomandari', 'campanie'], queryFn: getCampanieActiva })
  const q = useQuery({ queryKey: ['recomandari', 'raport'], queryFn: raportRecomandari })

  const toate = useMemo(() => q.data ?? [], [q.data])
  const deVerificat = toate.filter(
    (r) => r.status === 'declarat' || r.status === 'eligibil',
  )
  const inCurs = toate.filter((r) => ['verificat', 'proba', 'inrolat'].includes(r.status))
  const randuri = tab === 'de_verificat' ? deVerificat : tab === 'in_curs' ? inCurs : toate

  const recompensate = toate.filter((r) => r.status === 'recompensat')
  const creditTotal = recompensate.reduce((a, r) => a + Number(r.credit_acordat ?? 0), 0)
  const pierdut = toate.reduce((a, r) => a + Number(r.credit_pierdut ?? 0), 0)

  const deschideLead = async (leadId: string) => {
    const { data } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()
    if (data) setLeadDeschis(data as Lead)
  }

  const columns: Column<RandRaportRecomandare>[] = [
    {
      header: 'Invitat',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.invitat_nume || r.lead_nume}</div>
          <div className="text-xs text-quasar-gray">
            {r.lead_telefon}
            {r.invitat_tip && ` · ${r.invitat_tip === 'revenit' ? 'fost cursant' : 'nou'}`}
          </div>
        </div>
      ),
      sortValue: (r) => r.invitat_nume || r.lead_nume || '',
    },
    {
      header: 'Cine l-a invitat',
      cell: (r) =>
        r.recomandator_nume ? (
          <div>
            <div>{r.recomandator_nume}</div>
            <div className="text-xs text-quasar-gray">
              {r.familie_nume && `fam. ${r.familie_nume}`}
              {r.curs_recomandator && ` · ${r.curs_recomandator}`}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-amber-800">„{r.nume_declarat ?? '—'}”</div>
            <div className="text-xs text-quasar-gray">nu e confirmat</div>
          </div>
        ),
      sortValue: (r) => r.recomandator_nume || r.nume_declarat || '',
    },
    {
      header: 'Canal',
      cell: (r) => (r.canal === 'site' ? 'Site' : r.canal === 'telefon' ? 'Telefon' : 'Recepție'),
      sortValue: (r) => r.canal,
    },
    {
      header: 'Stare',
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={TONE[r.status as StatusRecomandare]}>
            {STATUS_LABEL[r.status as StatusRecomandare] ?? r.status}
          </Badge>
          {r.motiv_anulare && <span className="text-xs text-quasar-gray">{r.motiv_anulare}</span>}
        </div>
      ),
      sortValue: (r) => r.status,
    },
    {
      header: 'Probă / grupa aleasă',
      cell: (r) => (
        <div>
          <div>{r.proba ? '✅ a venit' : <span className="text-quasar-gray">—</span>}</div>
          {r.curs_ales && (
            <div className="text-xs text-quasar-gray">
              {r.curs_ales}
              {r.locatie && ` · ${r.locatie}`}
            </div>
          )}
        </div>
      ),
      sortValue: (r) => r.curs_ales ?? '',
    },
    {
      header: 'Prima plată',
      cell: (r) => (r.prima_plata ? formatDate(r.prima_plata) : <span className="text-quasar-gray">—</span>),
      sortValue: (r) => r.prima_plata ?? '',
    },
    {
      header: 'Credit',
      cell: (r) => (
        <div>
          {Number(r.credit_acordat) > 0 ? formatRON(Number(r.credit_acordat)) : '—'}
          {Number(r.credit_pierdut) > 0 && (
            <div className="text-xs text-red-700">
              ⚠️ {formatRON(Number(r.credit_pierdut))} consumat înainte de anulare
            </div>
          )}
        </div>
      ),
      sortValue: (r) => Number(r.credit_acordat ?? 0),
    },
    {
      header: 'Urmărire (2 luni)',
      cell: (r) =>
        r.invitat_client_id ? (
          <div className="text-xs">
            <div>
              L1: {r.prezente_luna1} prezențe
              {r.platit_luna1 != null && (r.platit_luna1 ? ' · achitat' : ' · neachitat')}
            </div>
            <div>
              L2: {r.prezente_luna2} prezențe
              {r.platit_luna2 != null && (r.platit_luna2 ? ' · achitat' : ' · neachitat')}
            </div>
          </div>
        ) : (
          <span className="text-quasar-gray">—</span>
        ),
    },
  ]

  const camp = campQ.data

  return (
    <>
      <PageHeader
        title="Recomandări"
        subtitle={
          camp
            ? `${camp.nume} · ${camp.activa ? 'activă' : 'încheiată'} până pe ${formatDate(camp.data_limita)} · ${formatRON(Number(camp.recompensa_lei))} credit pe fiecare prieten înscris și achitat`
            : 'Nicio campanie de recomandări.'
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Recomandări" value={String(toate.length)} />
        <Kpi label="De confirmat" value={String(deVerificat.length)} warn={deVerificat.length > 0} />
        <Kpi label="Credit acordat" value={`${recompensate.length} · ${formatRON(creditTotal)}`} />
        <Kpi label="Consumat înainte de anulare" value={formatRON(pierdut)} warn={pierdut > 0} />
      </div>

      <Tabs
        tabs={[
          { id: 'de_verificat', label: `De confirmat (${deVerificat.length})` },
          { id: 'in_curs', label: `În curs (${inCurs.length})` },
          { id: 'toate', label: `Toate (${toate.length})` },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      <div className="mt-4">
        {q.isLoading ? (
          <p className="text-sm text-quasar-gray">Se încarcă…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={randuri}
            rowKey={(r) => r.id}
            onRowClick={(r) => void deschideLead(r.lead_id)}
            emptyMessage={
              tab === 'de_verificat'
                ? 'Nimic de confirmat. Cererile de pe site cu „Cine te-a invitat?” apar aici.'
                : 'Nicio recomandare.'
            }
          />
        )}
      </div>

      {leadDeschis && (
        <LeadModal open lead={leadDeschis} onClose={() => { setLeadDeschis(null); void q.refetch() }} />
      )}
    </>
  )
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${warn ? 'border-amber-200 bg-amber-50' : 'border-line bg-card'}`}>
      <div className="text-xs text-quasar-gray">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}
