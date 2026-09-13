import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Field, Select, Spinner, Tabs, WhatsAppIcon } from '@/components/ui'
import { ProfileScaffold } from '@/components/layout/ProfileScaffold'
import { ChecklistBadge } from '@/components/checklist'
import { evalueazaChecklist, type StareItem } from '@/lib/checklist'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { listSezoane } from '@/features/plati/api'
import {
  teacheriOptions,
  saliOptions,
  sezoaneOptions,
  locatiiOptions,
} from '@/lib/lookups'
import { useAuth } from '@/hooks/useAuth'
import {
  canMesajGrupa,
  isFrontDeskOrHigher,
  isManagerOrHigher,
  isTeacher,
} from '@/lib/rolesMatrix'
import { waGroupLink } from '@/lib/phone'
import { formatMonth } from '@/lib/format'
import { ComposeMesajGrupaModal } from '@/features/announcements/ComposeMesajGrupaModal'
import { CursForm } from '../../CursForm'
import { CURS_CHECKLIST, type SectiuneCurs } from '@/lib/checklist/specs/curs'
import {
  getCurs,
  getCursOcupare,
  getCursClientiActivi,
  getCursClientiInactivi,
  getCursClientiFaraDocumente,
  getCursDatorii,
  getCursFaraPrezenteRecente,
  getCursIstoric,
  getCursLuni,
  getCursTeacheri,
  getSuspendareDeschisa,
  lunaCurenta,
  activateReinscriere,
} from '../../api'
import { GrupaEvenimenteSection } from '@/features/evenimente/GrupaEvenimenteSection'
import { MetodologieTab } from '@/features/metodologic/tabs/MetodologieTab'
import { CursSidebar } from './CursSidebar'
import { getCursInitials, labelOf } from './helpers'
import { ClientiActiviTab } from './tabs/ClientiActiviTab'
import { AbsentiTab } from './tabs/AbsentiTab'
import { RestantieriTab } from './tabs/RestantieriTab'
import { ClientiInactiviTab } from './tabs/ClientiInactiviTab'
import { FaraDocumenteTab } from './tabs/FaraDocumenteTab'
import { DetaliiTab } from './tabs/DetaliiTab'
import { IstoricTab } from './tabs/IstoricTab'
import { OpenSesiuniTab } from './tabs/OpenSesiuniTab'

type TabId =
  | 'activi'
  | 'absenti'
  | 'restantieri'
  | 'open'
  | 'fara-documente'
  | 'istoric'
  | 'evenimente'
  | 'metodologie'
  | 'detalii'

export function CursProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabId>('activi')
  // Luna de lucru a fișei ("YYYY-MM"). Tot ce e roster (activi, inactivi, fără
  // documente, ocupare) se citește pe ea, nu pe „azi" — altfel o grupă dintr-un
  // sezon încheiat arată goală. `null` = n-a ales nimeni nimic încă.
  const [lunaAleasa, setLunaAleasa] = useState<string | null>(null)
  const [inactiviOpen, setInactiviOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [focusSection, setFocusSection] = useState<SectiuneCurs | undefined>()
  const [payClientId, setPayClientId] = useState<string | null>(null)
  const [mesajOpen, setMesajOpen] = useState(false)
  const { role } = useAuth()
  const canSendMesajGrupa = canMesajGrupa(role)
  // Scrierea pe cursuri e permisă doar manager+ (RLS cursuri_manager_update).
  // Fără gard, front-desk vedea butonul, edita și primea eroarea RLS brută.
  const canEdit = isManagerOrHigher(role)

  const activeazaReinscriereMut = useMutation({
    mutationFn: (clientId: string) => activateReinscriere(clientId, id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['curs', id, 'clienti-activi'],
      })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
    },
  })

  const cursQuery = useQuery({
    queryKey: ['curs', id],
    queryFn: () => getCurs(id!),
    enabled: Boolean(id),
  })

  // Starea de suspendare, inclusiv cea PROGRAMATĂ într-o lună viitoare: pe aceea
  // `cursuri.suspendat` e încă false, dar managerul trebuie s-o vadă.
  const suspendareQuery = useQuery({
    queryKey: ['curs', id, 'suspendare-deschisa'],
    queryFn: () => getSuspendareDeschisa(id!),
    enabled: Boolean(id),
  })

  const luniQuery = useQuery({
    queryKey: ['curs', id, 'luni'],
    queryFn: () => getCursLuni(id!),
    enabled: Boolean(id),
  })

  // Grupă dintr-un sezon închis: se deschide direct pe ultima lună cu oameni. Pe
  // grupele sezonului curent nu se schimbă nimic — luna curentă e în listă.
  const lunaImplicita = useMemo(() => {
    const luni = luniQuery.data ?? []
    if (luni.length > 0 && !luni.some((l) => l.luna === lunaCurenta())) {
      return luni[0].luna
    }
    return lunaCurenta()
  }, [luniQuery.data])

  const luna = lunaAleasa ?? lunaImplicita
  const esteLunaIstorica = luna !== lunaCurenta()

  // „Absenți" e un semnal de acum (fără prezență în ultimele 21 de zile) — pe o
  // lună închisă n-ar însemna nimic, deci tab-ul dispare și selecția cade înapoi
  // pe „Clienți activi".
  const tabActiv: TabId = esteLunaIstorica && tab === 'absenti' ? 'activi' : tab

  const ocupareQuery = useQuery({
    queryKey: ['curs', id, 'ocupare', luna],
    queryFn: () => getCursOcupare(id!, luna),
    enabled: Boolean(id),
  })

  const activiQuery = useQuery({
    queryKey: ['curs', id, 'clienti-activi', luna],
    queryFn: () => getCursClientiActivi(id!, luna),
    enabled: Boolean(id) && tabActiv === 'activi',
  })

  const inactiviQuery = useQuery({
    queryKey: ['curs', id, 'clienti-inactivi', luna],
    queryFn: () => getCursClientiInactivi(id!, luna),
    enabled: Boolean(id) && tabActiv === 'activi' && inactiviOpen,
  })

  const faraDocQuery = useQuery({
    queryKey: ['curs', id, 'fara-documente', luna],
    queryFn: () => getCursClientiFaraDocumente(id!, luna),
    enabled: Boolean(id) && tabActiv === 'fara-documente',
  })

  const istoricQuery = useQuery({
    queryKey: ['curs', id, 'istoric'],
    queryFn: () => getCursIstoric(id!),
    enabled: Boolean(id) && tabActiv === 'istoric',
  })

  const absentiQuery = useQuery({
    queryKey: ['curs', id, 'absenti-21z'],
    queryFn: () => getCursFaraPrezenteRecente({ cursId: id!, days: 21 }),
    enabled: Boolean(id) && tabActiv === 'absenti',
  })

  const sezoaneQuery = useQuery({
    queryKey: ['sezoane-list'],
    queryFn: listSezoane,
  })

  const sezonCurent = useMemo(() => {
    const list = sezoaneQuery.data ?? []
    if (list.length === 0) return null
    const today = new Date().toISOString().slice(0, 10)
    return (
      list.find(
        (s) =>
          s.data_incepere &&
          s.data_final &&
          s.data_incepere <= today &&
          today <= s.data_final,
      ) ?? list[0]
    )
  }, [sezoaneQuery.data])

  // Restanțele se citesc pe sezonul CURSULUI, nu pe cel care conține ziua de azi:
  // altfel o grupă din 2025-2026 raportează zero restanțieri, pentru că fereastra
  // căutată e sezonul în curs.
  const sezonCurs = useMemo(() => {
    const list = sezoaneQuery.data ?? []
    const cursSezonId = cursQuery.data?.sezon
    return list.find((s) => s.id === cursSezonId) ?? sezonCurent
  }, [sezoaneQuery.data, cursQuery.data?.sezon, sezonCurent])

  const sezonIncheiat = Boolean(
    sezonCurs && sezonCurent && sezonCurs.id !== sezonCurent.id,
  )

  const restantieriQuery = useQuery({
    queryKey: ['curs', id, 'restantieri', sezonCurs?.id],
    queryFn: () =>
      getCursDatorii({
        cursId: id!,
        sezonStart: sezonCurs!.data_incepere!,
        sezonEnd: sezonCurs!.data_final!,
      }),
    enabled:
      Boolean(id && sezonCurs?.data_incepere && sezonCurs?.data_final) &&
      tabActiv === 'restantieri',
  })

  // Hartă de etichete: un titular arhivat trebuie să apară în continuare pe fișă.
  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri', 'cu-arhivati'],
    queryFn: () => teacheriOptions(undefined, { includeArhivati: true }),
    enabled: tabActiv === 'detalii',
  })
  const sali = useQuery({
    queryKey: ['lookup', 'sali'],
    queryFn: () => saliOptions(),
    enabled: tabActiv === 'detalii',
  })
  const sezoane = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
    enabled: tabActiv === 'detalii',
  })
  const locatii = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
    enabled: tabActiv === 'detalii',
  })
  const cursTeacheri = useQuery({
    queryKey: ['curs', id, 'teacheri'],
    queryFn: () => getCursTeacheri(id!),
    enabled: Boolean(id) && tabActiv === 'detalii',
  })

  const lunaLabel = formatMonth(`${luna}-01`)
  const lunaOptions = useMemo(() => {
    const luni = luniQuery.data ?? []
    const optiuni = luni.map((l) => ({
      value: l.luna,
      label: `${formatMonth(`${l.luna}-01`)} · ${l.cursanti} cursanți`,
    }))
    // Luna curentă (și cea aleasă manual) rămân selectabile chiar dacă grupa
    // n-are pe nimeni în ele — altfel nu se mai poate reveni „la azi".
    for (const l of [luna, lunaCurenta()]) {
      if (!optiuni.some((o) => o.value === l)) {
        optiuni.unshift({
          value: l,
          label: `${formatMonth(`${l}-01`)} · 0 cursanți`,
        })
      }
    }
    return optiuni
  }, [luniQuery.data, luna])

  if (cursQuery.isLoading) return <Spinner />
  if (cursQuery.isError || !cursQuery.data) {
    return (
      <div>
        <p className="text-sm text-red-600">Cursul nu a fost găsit.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => navigate('/cursuri')}
        >
          ← Înapoi la cursuri
        </Button>
      </div>
    )
  }

  const curs = cursQuery.data
  const initials = getCursInitials(curs.numele)
  // Derivat din rândul cursului — fără query suplimentar.
  const checklist = evalueazaChecklist(CURS_CHECKLIST, curs)

  const openEdit = (sectiune?: SectiuneCurs) => {
    setFocusSection(sectiune)
    setEditOpen(true)
  }
  const onFixChecklist = (item: StareItem) =>
    openEdit(item.sectiune as SectiuneCurs | undefined)

  return (
    <>
      <ProfileScaffold
        section="Studio"
        backTo="/cursuri"
        title={curs.numele}
        actions={
          <>
            {/* Starea de suspendat se vede în header; butonul care o schimbă stă
                în modalul „Editează". */}
            {curs.suspendat ? (
              <Badge tone="warn">
                ⏸ Suspendat
                {suspendareQuery.data
                  ? ` din ${formatMonth(suspendareQuery.data.din_luna)}`
                  : ''}
              </Badge>
            ) : suspendareQuery.data ? (
              <Badge tone="neutral">
                ⏳ Se suspendă din {formatMonth(suspendareQuery.data.din_luna)}
              </Badge>
            ) : null}
            <ChecklistBadge rezultat={checklist} />
            {canSendMesajGrupa && (
              <Button variant="secondary" onClick={() => setMesajOpen(true)}>
                💬 Mesaj grupă
              </Button>
            )}
            {waGroupLink(curs.link_whatsapp) && (
              <a
                href={waGroupLink(curs.link_whatsapp)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
                title="Deschide grupul de WhatsApp al grupei"
              >
                <WhatsAppIcon />
                Grup WhatsApp
              </a>
            )}
            {canEdit && <Button onClick={() => openEdit()}>Editează</Button>}
          </>
        }
        sidebar={
          <CursSidebar
            initials={initials}
            numele={curs.numele}
            ocupare={ocupareQuery.data}
            checklist={checklist}
            onFix={canEdit ? onFixChecklist : undefined}
          />
        }
      >
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Field label="Luna" htmlFor="curs-luna">
                <Select
                  id="curs-luna"
                  options={lunaOptions}
                  value={luna}
                  onChange={(e) => setLunaAleasa(e.target.value)}
                />
              </Field>
            </div>
            {esteLunaIstorica && (
              <Badge tone="warn" className="mb-2">
                Vizualizare istorică — {lunaLabel}
              </Badge>
            )}
            {sezonIncheiat && sezonCurs && (
              <Badge tone="neutral" className="mb-2">
                Sezon {sezonCurs.numele_sezonului}
              </Badge>
            )}
          </div>

          <Tabs
            tabs={[
              { id: 'activi',      label: 'Clienți activi' },
              ...(esteLunaIstorica ? [] : [{ id: 'absenti', label: 'Absenți' }]),
              { id: 'restantieri', label: 'Restanțieri' },
              ...(curs.facultativ && curs.rezervari_online
                ? [{ id: 'open', label: 'Sesiuni OPEN' }]
                : []),
              { id: 'fara-documente', label: 'Fără documente' },
              { id: 'istoric',     label: 'Istoric' },
              { id: 'evenimente',  label: 'Evenimente' },
              ...(curs.facultativ ? [] : [{ id: 'metodologie', label: 'Metodologie' }]),
              { id: 'detalii',     label: 'Detalii curs' },
            ]}
            active={tabActiv}
            onChange={(t) => setTab(t as TabId)}
          />

          {tabActiv === 'activi' && (
            <>
              <ClientiActiviTab
                loading={activiQuery.isLoading}
                rows={activiQuery.data ?? []}
                cursNume={curs.numele}
                lunaLabel={lunaLabel}
                pretLunarPromo={curs.facultativ ? null : curs.pret_lunar_promo}
                onRowClick={(cid) => navigate(`/clienti/${cid}`)}
                onActivateReinscriere={(cid) =>
                  activeazaReinscriereMut.mutate(cid)
                }
                activatingClientId={
                  activeazaReinscriereMut.isPending
                    ? activeazaReinscriereMut.variables ?? null
                    : null
                }
              />

              <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  aria-expanded={inactiviOpen}
                  onClick={() => setInactiviOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-quasar-yellow/5"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-quasar-black">
                    <span
                      className={`text-quasar-gray transition-transform ${inactiviOpen ? 'rotate-90' : ''}`}
                    >
                      ▶
                    </span>
                    Clienți inactivi
                  </span>
                  {inactiviOpen && !inactiviQuery.isLoading && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-quasar-gray">
                      {inactiviQuery.data?.length ?? 0}
                    </span>
                  )}
                </button>
                {inactiviOpen && (
                  <div className="border-t border-gray-200">
                    <ClientiInactiviTab
                      loading={inactiviQuery.isLoading}
                      rows={inactiviQuery.data ?? []}
                      cursNume={curs.numele}
                      onRowClick={(cid) => navigate(`/clienti/${cid}`)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {tabActiv === 'absenti' && (
            <AbsentiTab
              loading={absentiQuery.isLoading}
              rows={absentiQuery.data ?? []}
              cursNume={curs.numele}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
            />
          )}

          {tabActiv === 'restantieri' && (
            <RestantieriTab
              loading={restantieriQuery.isLoading}
              rows={restantieriQuery.data ?? []}
              canPay={isFrontDeskOrHigher(role)}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
              onPayClick={(cid) => setPayClientId(cid)}
            />
          )}

          {tabActiv === 'open' && curs.facultativ && curs.rezervari_online && (
            <OpenSesiuniTab
              cursId={curs.id}
              canManage={!isTeacher(role)}
              capacitateImplicita={curs.capacitate_maxima ?? 35}
            />
          )}

          {tabActiv === 'fara-documente' && (
            <FaraDocumenteTab
              loading={faraDocQuery.isLoading}
              rows={faraDocQuery.data ?? []}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
            />
          )}

          {tabActiv === 'istoric' && (
            <IstoricTab
              loading={istoricQuery.isLoading}
              rows={istoricQuery.data ?? []}
              cursNume={curs.numele}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
            />
          )}

          {tabActiv === 'evenimente' && (
            <div className="mt-4">
              <GrupaEvenimenteSection cursId={curs.id} />
            </div>
          )}

          {tabActiv === 'metodologie' && !curs.facultativ && (
            <MetodologieTab
              cursId={curs.id}
              programId={curs.program_metodologic}
              canEdit={canSendMesajGrupa}
              canLink={canEdit}
            />
          )}

          {tabActiv === 'detalii' && (
            <DetaliiTab
              curs={curs}
              teacherLabel={labelOf(teacheri.data, curs.teacher)}
              coInstructorLabel={labelOf(
                teacheri.data,
                cursTeacheri.data?.find(
                  (t) => t.rol === 'asistent' && t.teacher_id !== curs.teacher,
                )?.teacher_id ?? null,
              )}
              salaLabel={labelOf(sali.data, curs.sala)}
              sezonLabel={labelOf(sezoane.data, curs.sezon)}
              locatieLabel={labelOf(locatii.data, curs.locatie)}
            />
          )}
        </div>
      </ProfileScaffold>

      {editOpen && (
        <CursForm
          open
          curs={curs}
          focusSection={focusSection}
          onDeleted={() => navigate('/cursuri')}
          onClose={() => {
            setEditOpen(false)
            setFocusSection(undefined)
          }}
        />
      )}

      {payClientId && (
        <PlataNouaModal
          open
          defaultClientId={payClientId}
          onClose={() => setPayClientId(null)}
        />
      )}

      {mesajOpen && (
        <ComposeMesajGrupaModal
          open
          cursId={curs.id}
          cursNume={curs.numele}
          onClose={() => setMesajOpen(false)}
        />
      )}
    </>
  )
}
