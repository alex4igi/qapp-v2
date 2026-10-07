import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import { Badge, Button, DataTable, PageHeader, Select, Tabs, TextInput, type Column } from '@/components/ui'
import { downloadCsv } from '@/lib/csv'
import { formatDate } from '@/lib/format'
import { matchesWords } from '@/lib/search'
import { supabase } from '@/lib/supabase'
import { LeadModal } from '@/features/leads/LeadModal'
import type { Lead } from '@/types/db'
import {
  CAMPANIE_VL,
  SCOALA_PARTENERA,
  SCOALA_PARTENERA_SCURT,
  STATUSURI,
  STATUS_LABEL,
  getCampanie,
  listPreinscrieri,
  seteazaCampanie,
  stareCampanie,
  type Preinscriere,
  type StatusPreinscriere,
} from './api'
import { GRUPA_LABEL, STIL_LABEL, esteConfirmat, grupaVarsta, persoaneActive } from './analiza'
import { PreinscriereModal } from './PreinscriereModal'
import { DecizieGrupe } from './DecizieGrupe'

const TONE: Record<StatusPreinscriere, 'neutral' | 'warn' | 'success' | 'danger' | 'brand'> = {
  primit: 'warn',
  contactat: 'brand',
  asteapta_programul: 'neutral',
  programat_demo: 'brand',
  inrolat: 'success',
  retras: 'danger',
}

type TabId = 'lista' | 'decizie'

// Recepția caută des fără diacritice („Stefan”, „Ionut”).
const faraDiacritice = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '')

// Preînscrierile campaniei „Quasar Dance vine în Valea Lupului": lista de lucru pentru
// cine sună familiile și datele din care se decid grupele și cererea de închiriere.
// Reguli: docs/reguli-domeniu.md §11.
export default function PreinscrieriPage() {
  const [tab, setTab] = useState<TabId>('lista')
  const [status, setStatus] = useState('')
  const [scoala, setScoala] = useState('')
  const [sursa, setSursa] = useState('')
  const [cauta, setCauta] = useState('')
  const [deschisa, setDeschisa] = useState<Preinscriere | null>(null)
  const [leadDeschis, setLeadDeschis] = useState<Lead | null>(null)
  const q = useQuery({ queryKey: ['preinscrieri'], queryFn: listPreinscrieri })
  const { role } = useAuth()
  const campQ = useQuery({ queryKey: ['preinscrieri', 'campanie'], queryFn: () => getCampanie(CAMPANIE_VL) })
  const comuta = useMutation({
    meta: { erroareAfisata: true },
    mutationFn: (actiune: 'porneste' | 'inchide') => seteazaCampanie(CAMPANIE_VL, actiune),
    onSuccess: () => void campQ.refetch(),
  })
  const camp = campQ.data
  const stare = camp ? stareCampanie(camp) : null
  const comutaCuConfirmare = (actiune: 'porneste' | 'inchide') => {
    const text = actiune === 'porneste'
      ? 'Pornești campania? Pagina quasardance.ro/valea-lupului primește preînscrieri și pop-up-ul apare pe site (în cel mult un minut).'
      : 'Închizi campania? Formularul nu mai primește preînscrieri, pop-up-ul dispare, iar pagina arată că preînscrierile s-au încheiat.'
    if (window.confirm(text)) comuta.mutate(actiune)
  }

  const toate = useMemo(() => q.data ?? [], [q.data])
  const surse = useMemo(
    () => [...new Set(toate.map((r) => r.utm_content || r.utm_source).filter((s): s is string => !!s))].sort(),
    [toate],
  )
  const filtrate = useMemo(
    () =>
      toate.filter(
        (r) =>
          (!status || r.status === status) &&
          (!scoala || String(r.elev_scoala_partenera) === scoala) &&
          (!sursa || r.utm_content === sursa || r.utm_source === sursa) &&
          (!cauta || matchesWords(
            faraDiacritice([r.nume_participant, r.nume_contact, r.telefon, r.email].filter(Boolean).join(' ')),
            faraDiacritice(cauta),
          )),
      ),
    [toate, status, scoala, sursa, cauta],
  )
  const active = useMemo(
    () =>
      persoaneActive(toate).filter(
        (r) =>
          (!scoala || String(r.elev_scoala_partenera) === scoala) &&
          (!sursa || r.utm_content === sursa || r.utm_source === sursa),
      ),
    [toate, scoala, sursa],
  )

  const contacte = new Set(active.map((r) => r.telefon)).size
  const confirmati = active.filter(esteConfirmat).length
  const elevi = active.filter((r) => r.elev_scoala_partenera).length
  const deSunat = active.filter((r) => r.status === 'primit').length

  const deschideLead = async (leadId: string) => {
    const { data } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()
    if (data) setLeadDeschis(data as Lead)
  }

  const exporta = () =>
    downloadCsv(
      `preinscrieri-valea-lupului-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })}.csv`,
      ['Data', 'Participant', 'Vârstă', 'Grupa', 'Activități', 'Disponibilitate', 'Confirmat', `Elev ${SCOALA_PARTENERA}`,
        'Contact', 'Telefon', 'Email', 'Stare', 'Sursă', 'Lot', 'Acord marketing'],
      filtrate.map((r) => [
        formatDate(r.created), r.nume_participant, r.varsta, GRUPA_LABEL[grupaVarsta(r)],
        r.stiluri.map((s) => STIL_LABEL[s] ?? s).join(', '), r.disponibilitate.join(', '),
        esteConfirmat(r) ? 'da' : 'nu', r.elev_scoala_partenera == null ? '' : r.elev_scoala_partenera ? 'da' : 'nu',
        r.nume_contact, r.telefon, r.email, STATUS_LABEL[r.status as StatusPreinscriere] ?? r.status,
        r.utm_source, r.utm_content, r.acord_marketing ? 'da' : 'nu',
      ]),
    )

  const columns: Column<Preinscriere>[] = [
    {
      header: 'Participant',
      cell: (r) => (
        <div>
          <div className="font-medium">
            {r.nume_participant}
            {r.client && <span title="Client existent"> 🔁</span>}
          </div>
          <div className="text-xs text-quasar-gray">
            {GRUPA_LABEL[grupaVarsta(r)]}{r.varsta != null && ` · ${r.varsta} ani`}
            {r.elev_scoala_partenera && ` · ${SCOALA_PARTENERA_SCURT}`}
          </div>
        </div>
      ),
      sortValue: (r) => r.nume_participant,
    },
    {
      header: 'Contact',
      cell: (r) => (
        <div>
          <div>{r.nume_contact}</div>
          <div className="text-xs text-quasar-gray">{r.telefon}</div>
        </div>
      ),
      sortValue: (r) => r.nume_contact,
    },
    {
      header: 'Activități',
      cell: (r) => r.stiluri.map((s) => STIL_LABEL[s] ?? s).join(', '),
    },
    {
      header: 'Când poate',
      cell: (r) => (
        <div className="text-xs">
          <div>{r.disponibilitate.length ? r.disponibilitate.join(', ') : '—'}</div>
          {esteConfirmat(r) ? (
            <span className="text-success">confirmat</span>
          ) : (
            <span className="text-quasar-gray">declarat</span>
          )}
        </div>
      ),
      sortValue: (r) => (esteConfirmat(r) ? 1 : 0),
    },
    {
      header: 'Stare',
      cell: (r) => (
        <Badge tone={TONE[r.status as StatusPreinscriere]}>
          {STATUS_LABEL[r.status as StatusPreinscriere] ?? r.status}
        </Badge>
      ),
      sortValue: (r) => STATUSURI.indexOf(r.status as StatusPreinscriere),
    },
    {
      header: 'Sursă',
      cell: (r) => (
        <span className="text-xs">{[r.utm_source, r.utm_content].filter(Boolean).join(' · ') || '—'}</span>
      ),
      sortValue: (r) => r.utm_content ?? r.utm_source ?? '',
    },
    {
      header: 'Data',
      cell: (r) => formatDate(r.created),
      sortValue: (r) => r.created,
      defaultDir: 'desc',
    },
  ]

  return (
    <>
      <PageHeader
        title="Preînscrieri Valea Lupului"
        subtitle={`Quasar Dance vine în Valea Lupului · din noiembrie, la Școala Verde · parteneriat cu ${SCOALA_PARTENERA}`}
        actions={<Button variant="secondary" onClick={exporta} disabled={!filtrate.length}>Exportă CSV</Button>}
      />

      {camp && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
            stare === 'activa' ? 'border-green-200 bg-green-50' : 'border-line bg-card'
          }`}
        >
          <Badge tone={stare === 'activa' ? 'success' : stare === 'inchisa' ? 'danger' : 'warn'}>
            {stare === 'activa' ? 'Campania e LIVE' : stare === 'inchisa' ? 'Campania e închisă' : 'Campania nu e pornită'}
          </Badge>
          <span className="text-quasar-gray">
            {stare === 'activa' && `Pornită pe ${formatDate(camp.pornita_la)}. Site-ul primește preînscrieri și arată pop-up-ul.`}
            {stare === 'inchisa' && `Închisă pe ${formatDate(camp.inchisa_la)}. Pagina de pe site spune că preînscrierile s-au încheiat.`}
            {stare === 'nepornita' && 'Pagina de pe site arată „în curând” și nu primește preînscrieri; pop-up-ul nu apare.'}
          </span>
          {isAdminOrHigher(role) && (
            <div className="ml-auto">
              {stare === 'activa' ? (
                <Button variant="secondary" onClick={() => comutaCuConfirmare('inchide')} disabled={comuta.isPending}>
                  Închide campania
                </Button>
              ) : (
                <Button onClick={() => comutaCuConfirmare('porneste')} disabled={comuta.isPending}>
                  {stare === 'inchisa' ? 'Redeschide campania' : 'Pornește campania'}
                </Button>
              )}
            </div>
          )}
          {comuta.error && <span className="w-full text-xs text-danger">{(comuta.error as Error).message}</span>}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Participanți" value={String(active.length)} />
        <Kpi label="Contacte distincte" value={String(contacte)} />
        <Kpi label="De sunat" value={String(deSunat)} warn={deSunat > 0} />
        <Kpi label="Disponibilitate confirmată" value={`${confirmati} din ${active.length}`} />
        <Kpi label={`Elevi ${SCOALA_PARTENERA_SCURT}`} value={String(elevi)} />
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-4">
        {tab === 'lista' && (
          <TextInput type="search" value={cauta} onChange={(e) => setCauta(e.target.value)}
            placeholder="Caută: copil, părinte, telefon" aria-label="Caută în preînscrieri" />
        )}
        <Select value={scoala} onChange={(e) => setScoala(e.target.value)}
          options={[{ value: '', label: 'Toți' }, { value: 'true', label: `Elevi ${SCOALA_PARTENERA_SCURT}` }, { value: 'false', label: 'Din afara școlii partenere' }]} />
        <Select value={sursa} onChange={(e) => setSursa(e.target.value)}
          options={[{ value: '', label: 'Toate sursele' }, ...surse.map((s) => ({ value: s, label: s }))]} />
        {tab === 'lista' && (
          <Select value={status} onChange={(e) => setStatus(e.target.value)}
            options={[{ value: '', label: 'Toate stările' }, ...STATUSURI.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'lista', label: `Cereri (${filtrate.length})` },
          { id: 'decizie', label: 'Decizie grupe' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      <div className="mt-4">
        {q.isLoading ? (
          <p className="text-sm text-quasar-gray">Se încarcă…</p>
        ) : q.error ? (
          <p className="text-sm text-danger">Nu s-au putut încărca preînscrierile: {(q.error as Error).message}</p>
        ) : tab === 'lista' ? (
          <DataTable
            columns={columns}
            rows={filtrate}
            rowKey={(r) => r.id}
            onRowClick={setDeschisa}
            defaultSort={{ idx: 6, dir: 'desc' }}
            emptyMessage="Nicio preînscriere. Cererile de pe quasardance.ro/valea-lupului apar aici."
          />
        ) : (
          <DecizieGrupe persoane={active} />
        )}
      </div>

      {deschisa && (
        <PreinscriereModal
          p={deschisa}
          onClose={() => setDeschisa(null)}
          onSaved={() => void q.refetch()}
          onOpenLead={(id) => { setDeschisa(null); void deschideLead(id) }}
        />
      )}
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
