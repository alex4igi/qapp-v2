import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  Field,
  Spinner,
  Select,
  Tabs,
  TextInput,
} from '@/components/ui'
import { ProfileScaffold } from '@/components/layout/ProfileScaffold'
import type { Client, Familie } from '@/types/db'
import { useAuth } from '@/hooks/useAuth'
import { isFrontDeskOrHigher } from '@/lib/rolesMatrix'
import { humanizeError } from '@/lib/errorMessage'
import { FamilieForm } from './FamilieForm'
import { AddMembersModal } from './AddMembersModal'
import {
  getFamilie,
  getFamilieMembers,
  getFamilieInrolariSezon,
  updateFamilie,
  type FamilieInrolareSezon,
} from './api'
import { listSezoane } from '@/features/plati/api'
import { OptOutSection } from '@/features/opt-out/OptOutSection'
import { PortalAccountSection } from '@/components/PortalAccountSection'
import { FACTURARE_LA_CERERE_ENABLED } from '@/features/facturare/flags'

function calcAge(dataNasterii: string | null): number | null {
  if (!dataNasterii) return null
  const [y, m, d] = dataNasterii.split('-').map(Number)
  const birth = new Date(y, m - 1, d)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const mo = today.getMonth() - birth.getMonth()
  if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function getFamilieInitials(numeFamilie: string): string {
  const parts = numeFamilie.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return numeFamilie.slice(0, 2).toUpperCase() || '?'
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm break-words text-ink">{value || '—'}</dd>
    </div>
  )
}

type TabId = 'inrolari' | 'date'

export function FamilieProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [addMembersOpen, setAddMembersOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('inrolari')
  const [sezonId, setSezonId] = useState<string>('')

  const familieQuery = useQuery({
    queryKey: ['familie', id],
    queryFn: () => getFamilie(id!),
    enabled: Boolean(id),
  })

  const membersQuery = useQuery({
    queryKey: ['familie', id, 'membri'],
    queryFn: () => getFamilieMembers(id!),
    enabled: Boolean(id),
  })

  const sezoaneQuery = useQuery({
    queryKey: ['sezoane-list'],
    queryFn: listSezoane,
  })

  const effectiveSezonId = useMemo(() => {
    if (sezonId) return sezonId
    const list = sezoaneQuery.data ?? []
    if (list.length === 0) return ''
    const today = new Date().toISOString().slice(0, 10)
    const current = list.find(
      (s) =>
        s.data_incepere &&
        s.data_final &&
        s.data_incepere <= today &&
        today <= s.data_final,
    )
    return (current ?? list[0]).id
  }, [sezonId, sezoaneQuery.data])

  const sezonSelectat = (sezoaneQuery.data ?? []).find(
    (s) => s.id === effectiveSezonId,
  )

  const inrolariQuery = useQuery({
    queryKey: ['familie-inrolari-sezon', id, effectiveSezonId],
    queryFn: () =>
      getFamilieInrolariSezon({
        familieId: id!,
        sezonStart: sezonSelectat!.data_incepere!,
        sezonEnd: sezonSelectat!.data_final!,
      }),
    enabled: Boolean(
      id && sezonSelectat?.data_incepere && sezonSelectat?.data_final,
    ),
  })

  const balanta = useMemo(() => {
    const rows = inrolariQuery.data ?? []
    let rest = 0
    let total = 0
    for (const r of rows) {
      rest += r.rest ?? 0
      total += r.total_de_plata ?? 0
    }
    return { rest, total }
  }, [inrolariQuery.data])

  // Reprezentanți = membri majori (vârsta >= 18) automat
  const reprezentanti = useMemo(() => {
    return (membersQuery.data ?? []).filter((m) => {
      const v = calcAge(m.data_nasterii)
      return v != null && v >= 18
    })
  }, [membersQuery.data])

  if (familieQuery.isLoading) return <Spinner />
  if (familieQuery.isError || !familieQuery.data) {
    return (
      <div>
        <p className="text-sm text-red-600">Familia nu a fost găsită.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => navigate('/familii')}
        >
          ← Înapoi la familii
        </Button>
      </div>
    )
  }

  const familie = familieQuery.data
  const initials = getFamilieInitials(familie.nume_familie)
  const members = membersQuery.data ?? []

  return (
    <>
      <ProfileScaffold
        section="Familii"
        backTo="/familii"
        title={`Familia ${familie.nume_familie}`}
        actions={<Button onClick={() => setEditOpen(true)}>Editează</Button>}
        sidebar={
          <Sidebar
          initials={initials}
          numeFamilie={familie.nume_familie}
          reprezentanti={reprezentanti}
          numeReprezentantText={
            [familie.nume_reprezentant, familie.prenume_reprezentant]
              .filter(Boolean)
              .join(' ')
          }
          balanta={balanta}
          sezoaneOptions={(sezoaneQuery.data ?? []).map((s) => ({
            value: s.id,
            label: s.numele_sezonului,
          }))}
          sezonValue={effectiveSezonId}
          onSezonChange={setSezonId}
          members={members}
          onNavigateMember={(cid) => navigate(`/clienti/${cid}`)}
          onAddMembers={() => setAddMembersOpen(true)}
          />
        }
      >
        <Tabs
          tabs={[
            { id: 'inrolari', label: 'Detalii înrolări' },
            { id: 'date',     label: 'Detalii personale' },
          ]}
          active={tab}
          onChange={(t) => setTab(t as TabId)}
        />

        <div className="mt-4">
          {tab === 'inrolari' && (
            <InrolariTab
              loading={inrolariQuery.isLoading}
              rows={inrolariQuery.data ?? []}
            />
          )}

          {tab === 'date' && <DatePersonaleTab familie={familie} />}
        </div>
      </ProfileScaffold>

      {editOpen && (
        <FamilieForm
          open
          familie={familie}
          onClose={() => setEditOpen(false)}
        />
      )}

      {addMembersOpen && (
        <AddMembersModal
          open
          familieId={familie.id}
          familieNume={familie.nume_familie}
          onClose={() => setAddMembersOpen(false)}
        />
      )}
    </>
  )
}

// =====================================================================
// Sidebar
// =====================================================================

type SidebarProps = {
  initials: string
  numeFamilie: string
  reprezentanti: Client[]
  numeReprezentantText: string
  balanta: { rest: number; total: number }
  sezoaneOptions: { value: string; label: string }[]
  sezonValue: string
  onSezonChange: (id: string) => void
  members: Client[]
  onNavigateMember: (id: string) => void
  onAddMembers: () => void
}

function Sidebar({
  initials, numeFamilie, reprezentanti, numeReprezentantText,
  balanta, sezoaneOptions, sezonValue, onSezonChange,
  members, onNavigateMember, onAddMembers,
}: SidebarProps) {
  return (
    <aside className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="mb-3 flex justify-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-quasar-yellow font-display text-3xl font-bold text-ink shadow-sm">
          {initials}
        </div>
      </div>
      <h2 className="text-center font-display text-lg font-bold text-ink">
        Familia {numeFamilie}
      </h2>

      <dl className="mt-4 space-y-3">
        <div>
          <dt className="mb-1 text-xs font-medium text-muted">
            Reprezentant{reprezentanti.length > 1 ? 'i' : ''}
          </dt>
          {reprezentanti.length === 0 ? (
            <p className="text-sm text-ink">
              {numeReprezentantText || '—'}
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {reprezentanti.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onNavigateMember(r.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-quasar-yellow/10"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-quasar-yellow text-xs font-bold text-ink">
                      {getFamilieInitials(`${r.nume} ${r.prenume ?? ''}`)}
                    </span>
                    <span className="truncate text-ink">
                      {r.nume} {r.prenume ?? ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-line bg-card p-3 text-center shadow-sm">
          <dt className="text-xs font-medium text-muted">
            Balanța Familiei
          </dt>
          <dd className="mt-1 space-y-0.5">
            <p className="text-sm">
              <span className="text-muted">Rest: </span>
              <span
                className={`font-display font-bold ${
                  balanta.rest > 0 ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {balanta.rest} RON
              </span>
            </p>
            <p className="text-sm">
              <span className="text-muted">Total: </span>
              <span className="font-display font-bold text-ink">
                {balanta.total} RON
              </span>
            </p>
          </dd>
        </div>

        <div>
          <dt className="mb-1 text-xs font-medium text-muted">
            În sezonul
          </dt>
          <Select
            options={sezoaneOptions}
            value={sezonValue}
            onChange={(e) => onSezonChange(e.target.value)}
            placeholder={sezoaneOptions.length ? undefined : '— nu există sezoane —'}
          />
        </div>

        <div>
          <dt className="mb-1 text-xs font-medium text-muted">
            Membri ({members.length})
          </dt>
          {members.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {members.map((m) => {
                const v = calcAge(m.data_nasterii)
                const isAdult = v != null && v >= 18
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onNavigateMember(m.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-quasar-yellow/10"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-quasar-yellow text-xs font-bold text-ink">
                        {getFamilieInitials(`${m.nume} ${m.prenume ?? ''}`)}
                      </span>
                      <span className="min-w-0 truncate text-ink">
                        {m.nume} {m.prenume ?? ''}
                        {v != null && (
                          <span className="ml-1 text-xs text-muted">
                            ({v} ani{isAdult ? ', reprezentant' : ''})
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </dl>
      <Button className="mt-4 w-full" variant="secondary" onClick={onAddMembers}>
        + Adaugă membru
      </Button>
    </aside>
  )
}

// =====================================================================
// Tab: Detalii înrolări (toți membrii, toate înrolările în sezon)
// =====================================================================

function InrolariTab({
  loading,
  rows,
}: {
  loading: boolean
  rows: FamilieInrolareSezon[]
}) {
  if (loading) return <Spinner />
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nicio înrolare în acest sezon pentru membrii familiei.
      </p>
    )
  }
  return (
    <div className="overflow-hidden overflow-x-auto rounded-2xl border border-line bg-card shadow-sm">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 font-medium">Nume membru</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">Nume curs</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">Data începerii</th>
            <th className="whitespace-nowrap px-4 py-3 font-medium">Tipul înrolării</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Status plată</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-2">
          {rows.map((r) => {
            const rest = r.rest ?? 0
            const total = r.total_de_plata ?? 0
            const achitat = rest <= 0
            return (
              <tr key={r.id_enrollment} className="transition-colors hover:bg-rowhover">
                <td className="px-4 py-3 font-medium text-ink">
                  {r.nume_client} {r.prenume_client ?? ''}
                </td>
                <td className="px-4 py-3 text-muted">{r.nume_curs}</td>
                <td className="px-4 py-3 text-muted">{r.data_incepere}</td>
                <td className="px-4 py-3 text-muted">{r.tip_plata ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  {achitat ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      ✓ Achitat ({total} RON)
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {rest} RON rest
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// =====================================================================
// Tab: Detalii personale (read-only)
// =====================================================================

function DatePersonaleTab({ familie }: { familie: Familie }) {
  return (
    <div className="space-y-4">
      <Section title="Bio">
        <DetailRow label="Familia" value={familie.nume_familie} />
        <DetailRow
          label="Nume reprezentant"
          value={familie.nume_reprezentant ?? ''}
        />
        <DetailRow
          label="Prenume reprezentant"
          value={familie.prenume_reprezentant ?? ''}
        />
      </Section>
      <Section title="Contact">
        <DetailRow label="Email" value={familie.email ?? ''} />
        <DetailRow label="Telefon" value={familie.telefon ?? ''} />
        <DetailRow label="Telefon 2" value={familie.telefon_2 ?? ''} />
      </Section>
      <Section title="Altele">
        <DetailRow
          label="Metodă plată"
          value={familie.metoda_plata ?? ''}
        />
        <DetailRow
          label="Metodă comunicare"
          value={familie.metoda_comunicare ?? ''}
        />
        <DetailRow
          label="Apare în poze"
          value={familie.doreste_sa_apara_in_poze ? 'Da' : 'Nu'}
        />
      </Section>
      {familie.observatii && (
        <Section title="Observații">
          <div className="col-span-full">
            <p className="whitespace-pre-wrap text-sm text-ink">
              {familie.observatii}
            </p>
          </div>
        </Section>
      )}
      {FACTURARE_LA_CERERE_ENABLED && <FirmaFacturareSection familie={familie} />}
      <OptOutSection
        entity="familie"
        id={familie.id}
        optOut={familie.opt_out_marketing ?? false}
        motiv={familie.opt_out_motiv ?? null}
        la={familie.opt_out_la ?? null}
        invalidateKey={['familie', familie.id]}
      />
      <PortalAccountSection
        kind="familie"
        id={familie.id}
        authUserId={familie.auth_user_id ?? null}
        defaultEmail={familie.email}
        nameHint={familie.nume_familie}
        invalidateKey={['familie', familie.id]}
      />
    </div>
  )
}

// Datele de facturare pe firmă — introduse de familie din portal (Profil) sau de
// recepție de aici. Când sunt active, TOATE facturile membrilor familiei ies pe firmă
// (au prioritate față de datele PF de pe fișa clientului).
function FirmaFacturareSection({ familie }: { familie: Familie }) {
  const { role } = useAuth()
  const canEdit = isFrontDeskOrHigher(role)
  const queryClient = useQueryClient()

  const [peFirma, setPeFirma] = useState(familie.factura_pe_firma ?? false)
  const [denumire, setDenumire] = useState(familie.firma_denumire ?? '')
  const [cif, setCif] = useState(familie.firma_cif ?? '')
  const [regCom, setRegCom] = useState(familie.firma_reg_com ?? '')
  const [adresa, setAdresa] = useState(familie.firma_adresa ?? '')
  const [banca, setBanca] = useState(familie.firma_banca ?? '')
  const [iban, setIban] = useState(familie.firma_iban ?? '')
  const [error, setError] = useState<string | null>(null)

  const norm = (s: string) => s.trim() || null
  const dirty =
    peFirma !== (familie.factura_pe_firma ?? false) ||
    norm(denumire) !== (familie.firma_denumire ?? null) ||
    norm(cif) !== (familie.firma_cif ?? null) ||
    norm(regCom) !== (familie.firma_reg_com ?? null) ||
    norm(adresa) !== (familie.firma_adresa ?? null) ||
    norm(banca) !== (familie.firma_banca ?? null) ||
    norm(iban) !== (familie.firma_iban ?? null)
  const incomplete = peFirma && (!denumire.trim() || !cif.trim())

  const save = useMutation({
    mutationFn: () =>
      updateFamilie(familie.id, {
        factura_pe_firma: peFirma,
        firma_denumire: norm(denumire),
        firma_cif: norm(cif),
        firma_reg_com: norm(regCom),
        firma_adresa: norm(adresa),
        firma_banca: norm(banca),
        firma_iban: norm(iban),
      }),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['familie', familie.id] })
    },
    onError: (e: unknown) => setError(humanizeError(e, 'Eroare la salvare.')),
  })

  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-bold text-ink">Date facturare firmă</h2>
      <p className="mb-3 text-xs text-muted">
        Completate de familie din portal sau de recepție. Cu bifa activă și CIF completat,
        facturile FGO ale membrilor ies pe firmă.
      </p>
      <div className="space-y-3">
        <Checkbox
          label="Factură pe firmă"
          checked={peFirma}
          onChange={(e) => setPeFirma(e.target.checked)}
          disabled={!canEdit}
        />
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Denumire firmă">
            <TextInput value={denumire} onChange={(e) => setDenumire(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="CIF">
            <TextInput value={cif} onChange={(e) => setCif(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Reg. Com.">
            <TextInput value={regCom} onChange={(e) => setRegCom(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Adresă firmă">
            <TextInput value={adresa} onChange={(e) => setAdresa(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Bancă">
            <TextInput value={banca} onChange={(e) => setBanca(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="IBAN">
            <TextInput value={iban} onChange={(e) => setIban(e.target.value)} disabled={!canEdit} />
          </Field>
        </div>
        {incomplete && (
          <p className="text-xs text-amber-700">
            Pentru factură pe firmă e nevoie cel puțin de denumire și CIF — altfel facturile
            ies în continuare pe persoană fizică.
          </p>
        )}
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Se salvează…' : 'Salvează'}
            </Button>
            {error && <span className="text-xs text-red-700">{error}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold text-ink">{title}</h2>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">{children}</dl>
    </div>
  )
}
