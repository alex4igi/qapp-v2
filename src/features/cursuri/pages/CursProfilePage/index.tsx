import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, Tabs, WhatsAppIcon } from '@/components/ui'
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
import { ArchiveConfirmModal } from '@/features/shared/ArchiveConfirmModal'
import { DeleteConfirmModal } from '@/features/shared/DeleteConfirmModal'
import { useAuth } from '@/hooks/useAuth'
import {
  canMesajGrupa,
  isAdminOrHigher,
  isFrontDeskOrHigher,
  isManagerOrHigher,
  isTeacher,
} from '@/lib/rolesMatrix'
import { waGroupLink } from '@/lib/phone'
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
  getCursTeacheri,
  activateReinscriere,
  toggleCursArchived,
  deleteCurs,
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
import { OpenSesiuniTab } from './tabs/OpenSesiuniTab'

type TabId =
  | 'activi'
  | 'absenti'
  | 'restantieri'
  | 'open'
  | 'fara-documente'
  | 'evenimente'
  | 'metodologie'
  | 'detalii'

export function CursProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabId>('activi')
  const [inactiviOpen, setInactiviOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [focusSection, setFocusSection] = useState<SectiuneCurs | undefined>()
  const [payClientId, setPayClientId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [mesajOpen, setMesajOpen] = useState(false)
  const { role } = useAuth()
  const canSendMesajGrupa = canMesajGrupa(role)
  const canArchive = isManagerOrHigher(role)
  const canDelete = isAdminOrHigher(role)
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

  const ocupareQuery = useQuery({
    queryKey: ['curs', id, 'ocupare'],
    queryFn: () => getCursOcupare(id!),
    enabled: Boolean(id),
  })

  const activiQuery = useQuery({
    queryKey: ['curs', id, 'clienti-activi'],
    queryFn: () => getCursClientiActivi(id!),
    enabled: Boolean(id) && tab === 'activi',
  })

  const inactiviQuery = useQuery({
    queryKey: ['curs', id, 'clienti-inactivi'],
    queryFn: () => getCursClientiInactivi(id!),
    enabled: Boolean(id) && tab === 'activi' && inactiviOpen,
  })

  const faraDocQuery = useQuery({
    queryKey: ['curs', id, 'fara-documente'],
    queryFn: () => getCursClientiFaraDocumente(id!),
    enabled: Boolean(id) && tab === 'fara-documente',
  })

  const absentiQuery = useQuery({
    queryKey: ['curs', id, 'absenti-21z'],
    queryFn: () => getCursFaraPrezenteRecente({ cursId: id!, days: 21 }),
    enabled: Boolean(id) && tab === 'absenti',
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

  const restantieriQuery = useQuery({
    queryKey: ['curs', id, 'restantieri', sezonCurent?.id],
    queryFn: () =>
      getCursDatorii({
        cursId: id!,
        sezonStart: sezonCurent!.data_incepere!,
        sezonEnd: sezonCurent!.data_final!,
      }),
    enabled:
      Boolean(id && sezonCurent?.data_incepere && sezonCurent?.data_final) &&
      tab === 'restantieri',
  })

  // Hartă de etichete: un titular arhivat trebuie să apară în continuare pe fișă.
  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri', 'cu-arhivati'],
    queryFn: () => teacheriOptions(undefined, { includeArhivati: true }),
    enabled: tab === 'detalii',
  })
  const sali = useQuery({
    queryKey: ['lookup', 'sali'],
    queryFn: () => saliOptions(),
    enabled: tab === 'detalii',
  })
  const sezoane = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
    enabled: tab === 'detalii',
  })
  const locatii = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
    enabled: tab === 'detalii',
  })
  const cursTeacheri = useQuery({
    queryKey: ['curs', id, 'teacheri'],
    queryFn: () => getCursTeacheri(id!),
    enabled: Boolean(id) && tab === 'detalii',
  })

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
            {canArchive && (
              <Button
                variant={curs.suspendat ? 'secondary' : 'ghost'}
                onClick={() => setArchiveOpen(true)}
                title={
                  curs.suspendat ? 'Dezarhivează cursul' : 'Arhivează cursul'
                }
              >
                {curs.suspendat ? '↩ Dezarhivează' : '📦 Arhivează'}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                title="Șterge definitiv cursul"
              >
                🗑 Șterge
              </Button>
            )}
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
          <Tabs
            tabs={[
              { id: 'activi',      label: 'Clienți activi' },
              { id: 'absenti',     label: 'Absenți' },
              { id: 'restantieri', label: 'Restanțieri' },
              ...(curs.facultativ && curs.rezervari_online
                ? [{ id: 'open', label: 'Sesiuni OPEN' }]
                : []),
              { id: 'fara-documente', label: 'Fără documente' },
              { id: 'evenimente',  label: 'Evenimente' },
              ...(curs.facultativ ? [] : [{ id: 'metodologie', label: 'Metodologie' }]),
              { id: 'detalii',     label: 'Detalii curs' },
            ]}
            active={tab}
            onChange={(t) => setTab(t as TabId)}
          />

          {tab === 'activi' && (
            <>
              <ClientiActiviTab
                loading={activiQuery.isLoading}
                rows={activiQuery.data ?? []}
                cursNume={curs.numele}
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

          {tab === 'absenti' && (
            <AbsentiTab
              loading={absentiQuery.isLoading}
              rows={absentiQuery.data ?? []}
              cursNume={curs.numele}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
            />
          )}

          {tab === 'restantieri' && (
            <RestantieriTab
              loading={restantieriQuery.isLoading}
              rows={restantieriQuery.data ?? []}
              canPay={isFrontDeskOrHigher(role)}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
              onPayClick={(cid) => setPayClientId(cid)}
            />
          )}

          {tab === 'open' && curs.facultativ && curs.rezervari_online && (
            <OpenSesiuniTab
              cursId={curs.id}
              canManage={!isTeacher(role)}
              capacitateImplicita={curs.capacitate_maxima ?? 35}
            />
          )}

          {tab === 'fara-documente' && (
            <FaraDocumenteTab
              loading={faraDocQuery.isLoading}
              rows={faraDocQuery.data ?? []}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
            />
          )}

          {tab === 'evenimente' && (
            <div className="mt-4">
              <GrupaEvenimenteSection cursId={curs.id} />
            </div>
          )}

          {tab === 'metodologie' && !curs.facultativ && (
            <MetodologieTab
              cursId={curs.id}
              programId={curs.program_metodologic}
              canEdit={canSendMesajGrupa}
              canLink={canEdit}
            />
          )}

          {tab === 'detalii' && (
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

      {archiveOpen && (
        <ArchiveConfirmModal
          open
          title={curs.suspendat ? 'Dezarhivează curs' : 'Arhivează curs'}
          entityLabel={curs.numele}
          archive={!curs.suspendat}
          onConfirm={async (motiv) => {
            await toggleCursArchived({
              cursId: curs.id,
              archive: !curs.suspendat,
              motiv,
            })
            await queryClient.invalidateQueries({ queryKey: ['curs', curs.id] })
            await queryClient.invalidateQueries({ queryKey: ['cursuri'] })
          }}
          onClose={() => setArchiveOpen(false)}
        />
      )}

      {deleteOpen && (
        <DeleteConfirmModal
          open
          title="Șterge definitiv curs"
          entityLabel={curs.numele}
          noun="cursul"
          onConfirm={async (force) => {
            await deleteCurs(curs.id, force)
            await queryClient.invalidateQueries({ queryKey: ['cursuri'] })
            navigate('/cursuri')
          }}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </>
  )
}
