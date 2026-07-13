import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, Tabs } from '@/components/ui'
import { ProfileScaffold } from '@/components/layout/ProfileScaffold'
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
import { isAdminOrHigher, isManagerOrHigher, isTeacher } from '@/lib/rolesMatrix'
import { CursForm } from '../../CursForm'
import {
  getCurs,
  getCursOcupare,
  getCursClientiActivi,
  getCursClientiInactivi,
  getCursDatorii,
  getCursFaraPrezenteRecente,
  activateReinscriere,
  toggleCursArchived,
  deleteCurs,
} from '../../api'
import { CursSidebar } from './CursSidebar'
import { getCursInitials, labelOf } from './helpers'
import { ClientiActiviTab } from './tabs/ClientiActiviTab'
import { AbsentiTab } from './tabs/AbsentiTab'
import { RestantieriTab } from './tabs/RestantieriTab'
import { ClientiInactiviTab } from './tabs/ClientiInactiviTab'
import { DetaliiTab } from './tabs/DetaliiTab'
import { OpenSesiuniTab } from './tabs/OpenSesiuniTab'

type TabId = 'activi' | 'absenti' | 'restantieri' | 'inactivi' | 'open' | 'detalii'

export function CursProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabId>('activi')
  const [editOpen, setEditOpen] = useState(false)
  const [payClientId, setPayClientId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { role } = useAuth()
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
    enabled: Boolean(id) && tab === 'inactivi',
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

  const teacheri = useQuery({
    queryKey: ['lookup', 'teacheri'],
    queryFn: () => teacheriOptions(),
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

  return (
    <>
      <ProfileScaffold
        section="Studio"
        backTo="/cursuri"
        title={curs.numele}
        actions={
          <>
            {canEdit && <Button onClick={() => setEditOpen(true)}>Editează</Button>}
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
          />
        }
      >
        <div className="min-w-0">
          <Tabs
            tabs={[
              { id: 'activi',      label: 'Clienți activi' },
              { id: 'absenti',     label: 'Absenți' },
              { id: 'restantieri', label: 'Restanțieri' },
              { id: 'inactivi',    label: 'Clienți inactivi' },
              ...(curs.facultativ
                ? [{ id: 'open', label: 'Sesiuni OPEN' }]
                : []),
              { id: 'detalii',     label: 'Detalii curs' },
            ]}
            active={tab}
            onChange={(t) => setTab(t as TabId)}
          />

          {tab === 'activi' && (
            <ClientiActiviTab
              loading={activiQuery.isLoading}
              rows={activiQuery.data ?? []}
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
          )}

          {tab === 'absenti' && (
            <AbsentiTab
              loading={absentiQuery.isLoading}
              rows={absentiQuery.data ?? []}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
            />
          )}

          {tab === 'restantieri' && (
            <RestantieriTab
              loading={restantieriQuery.isLoading}
              rows={restantieriQuery.data ?? []}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
              onPayClick={(cid) => setPayClientId(cid)}
            />
          )}

          {tab === 'inactivi' && (
            <ClientiInactiviTab
              loading={inactiviQuery.isLoading}
              rows={inactiviQuery.data ?? []}
              onRowClick={(cid) => navigate(`/clienti/${cid}`)}
            />
          )}

          {tab === 'open' && curs.facultativ && (
            <OpenSesiuniTab
              cursId={curs.id}
              canManage={!isTeacher(role)}
              capacitateImplicita={curs.capacitate_maxima ?? 35}
            />
          )}

          {tab === 'detalii' && (
            <DetaliiTab
              curs={curs}
              teacherLabel={labelOf(teacheri.data, curs.teacher)}
              salaLabel={labelOf(sali.data, curs.sala)}
              sezonLabel={labelOf(sezoane.data, curs.sezon)}
              locatieLabel={labelOf(locatii.data, curs.locatie)}
            />
          )}
        </div>
      </ProfileScaffold>

      {editOpen && (
        <CursForm open curs={curs} onClose={() => setEditOpen(false)} />
      )}

      {payClientId && (
        <PlataNouaModal
          open
          defaultClientId={payClientId}
          onClose={() => setPayClientId(null)}
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
