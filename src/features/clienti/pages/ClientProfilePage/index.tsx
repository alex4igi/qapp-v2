import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, Tabs } from '@/components/ui'
import { ProfileScaffold } from '@/components/layout/ProfileScaffold'
import {
  listSezoane,
  rezilizaInrolari,
  recalcUltimaLunaReziliere,
  convertSedintaInAbonament,
  deleteInrolareDuplicat,
  endOfMonth,
} from '@/features/plati/api'
import type { Enrollment } from '@/types/db'
import { reintegrateClientAsLead } from '@/features/leads/api'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import { PlataNouaModal } from '@/features/plati/PlataNouaModal'
import { PriceAdjustmentModal } from '@/features/plati/PriceAdjustmentModal'
import { MoveEnrollmentModal } from '@/features/plati/MoveEnrollmentModal'
import { MotivareAbsentaModal } from '@/features/plati/MotivareAbsentaModal'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher, isFrontDeskOrHigher, isTeacher } from '@/lib/rolesMatrix'
import { waLink } from '@/lib/phone'
import { ClientForm } from '../../ClientForm'
import {
  getClient,
  getClientEnrollments,
  getClientFamilia,
  getClientInrolariSezon,
  getClientPrezenteSezon,
  type ClientInrolareSezon,
} from '../../api'
import { ClientSidebar } from './ClientSidebar'
import { ConfirmReziliereModal } from './ConfirmReziliereModal'
import { ConfirmDeleteInrolareModal } from './ConfirmDeleteInrolareModal'
import { calcAge, getInitials } from './helpers'
import { InrolariSezonTab } from './tabs/InrolariSezonTab'
import { PrezenteSezonTab } from './tabs/PrezenteSezonTab'
import { DatePersonaleTab } from './tabs/DatePersonaleTab'
import { DocumenteTab } from './tabs/DocumenteTab'

type TabId = 'inrolari' | 'prezente' | 'date' | 'documente'

export function ClientProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [plataOpen, setPlataOpen] = useState(false)
  const [confirmCursId, setConfirmCursId] = useState<string | null>(null)
  const [reintegrateAsLead, setReintegrateAsLead] = useState(false)
  const [recalcUltimaLuna, setRecalcUltimaLuna] = useState(false)
  const [motivReziliere, setMotivReziliere] = useState('')
  const { role } = useAuth()
  const canManagerActions = isManagerOrHigher(role)
  const teacherMode = isTeacher(role)
  const [tab, setTab] = useState<TabId>(teacherMode ? 'prezente' : 'inrolari')
  const [sezonId, setSezonId] = useState<string>('')
  const [adjustEnrollmentId, setAdjustEnrollmentId] = useState<string | null>(null)
  const [moveEnrollmentId, setMoveEnrollmentId] = useState<string | null>(null)
  const [motivareEnrollmentId, setMotivareEnrollmentId] = useState<string | null>(null)
  const [convertSedinta, setConvertSedinta] = useState<{
    sedintaId: string
    cursId: string
  } | null>(null)
  const [deleteRow, setDeleteRow] = useState<ClientInrolareSezon | null>(null)
  const [motivStergere, setMotivStergere] = useState('')

  const clientQuery = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClient(id!),
    enabled: Boolean(id),
  })

  const sezoaneQuery = useQuery({
    queryKey: ['sezoane-list'],
    queryFn: listSezoane,
  })

  // Default sezon: cel care conține azi, altfel cel mai recent
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

  const familiaQuery = useQuery({
    queryKey: ['client-familia', clientQuery.data?.familia],
    queryFn: () => getClientFamilia(clientQuery.data!.familia!),
    enabled: Boolean(clientQuery.data?.familia),
  })

  const inrolariSezonQuery = useQuery({
    queryKey: ['client-inrolari-sezon', id, effectiveSezonId],
    queryFn: () =>
      getClientInrolariSezon({
        clientId: id!,
        sezonStart: sezonSelectat!.data_incepere!,
        sezonEnd: sezonSelectat!.data_final!,
      }),
    enabled: Boolean(
      id && sezonSelectat?.data_incepere && sezonSelectat?.data_final,
    ),
  })

  const prezenteQuery = useQuery({
    queryKey: ['client-prezente-sezon', id, effectiveSezonId],
    queryFn: () =>
      getClientPrezenteSezon({
        clientId: id!,
        sezonStart: sezonSelectat!.data_incepere!,
        sezonEnd: sezonSelectat!.data_final!,
      }),
    enabled: Boolean(
      id && sezonSelectat?.data_incepere && sezonSelectat?.data_final,
    ),
  })

  // Lista cursurilor unice ale clientului în sezon (pentru sidebar)
  const cursuriSezon = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of inrolariSezonQuery.data ?? []) {
      if (!seen.has(r.id_curs)) seen.set(r.id_curs, r.nume_curs)
    }
    return Array.from(seen, ([id, nume]) => ({ id, nume }))
  }, [inrolariSezonQuery.data])

  // Pentru reziliere: înrolări TOATE (nu doar pe sezon) ca să găsim viitoarele
  const enrollmentsQuery = useQuery({
    queryKey: ['client', id, 'enrollments'],
    queryFn: () => getClientEnrollments(id!),
    enabled: Boolean(id),
  })

  const today = new Date()
  const monthEnd = endOfMonth(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
  )

  const reziliereByCurs = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of enrollmentsQuery.data ?? []) {
      const c = e.cursul
      if (!c || c.facultativ || c.nivelul === 'Trupa') continue
      if (e.reziliat) continue
      if (e.data_incepere && e.data_incepere > monthEnd) {
        map.set(c.id, (map.get(c.id) ?? 0) + 1)
      }
    }
    return map
  }, [enrollmentsQuery.data, monthEnd])

  const rezilia = useMutation({
    mutationFn: async (input: {
      cursId: string
      reintegrateAsLead: boolean
      recalcUltimaLuna: boolean
      motiv: string
    }) => {
      await rezilizaInrolari({
        clientId: id!,
        cursId: input.cursId,
        motiv: input.motiv,
      })
      if (input.recalcUltimaLuna) {
        await recalcUltimaLunaReziliere({ clientId: id!, cursId: input.cursId })
      }
      if (input.reintegrateAsLead) {
        await reintegrateClientAsLead(id!)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', id] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({
        queryKey: ['plata-noua-inrolari'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['client-inrolari-sezon', id],
      })
      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      setConfirmCursId(null)
      setReintegrateAsLead(false)
      setRecalcUltimaLuna(false)
      setMotivReziliere('')
    },
  })

  const closeReziliereModal = () => {
    setConfirmCursId(null)
    setReintegrateAsLead(false)
    setRecalcUltimaLuna(false)
    setMotivReziliere('')
  }

  const stergeInrolare = useMutation({
    mutationFn: (input: { enrollmentId: string; motiv: string }) =>
      deleteInrolareDuplicat(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', id] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({
        queryKey: ['client-inrolari-sezon', id],
      })
      // Restanța din rosterul grupei se însumează per client → invalidăm grupele.
      void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard'] })
      setDeleteRow(null)
      setMotivStergere('')
    },
  })

  const closeDeleteModal = () => {
    setDeleteRow(null)
    setMotivStergere('')
  }

  // Conversie ședință → abonament: abonamentul s-a creat deja (EnrollmentForm a
  // întors rândurile); ținta = rândul cel mai timpuriu (luna curentă). RPC-ul mută
  // eventuala încasare, zerează rezervarea OPEN și face void curat al ședinței.
  const convertSedintaMut = useMutation({
    mutationFn: (input: { sedintaId: string; targetEnrollmentId: string }) =>
      convertSedintaInAbonament(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', id] })
      void queryClient.invalidateQueries({ queryKey: ['plati'] })
      void queryClient.invalidateQueries({ queryKey: ['plata-noua-inrolari'] })
      void queryClient.invalidateQueries({
        queryKey: ['client-inrolari-sezon', id],
      })
      void queryClient.invalidateQueries({ queryKey: ['grupa-dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['open-rezervari'] })
    },
  })

  const handleConvertEnrolled = (rows: Enrollment[]) => {
    if (!convertSedinta) return
    const target = [...rows].sort((a, b) =>
      (a.data_incepere ?? '').localeCompare(b.data_incepere ?? ''),
    )[0]
    // Rânduri goale = fluxul OPEN per ședință a fost ales din nou (nu e abonament);
    // nu avem țintă de creditat, deci nu rezilim ședința.
    if (!target) return
    convertSedintaMut.mutate({
      sedintaId: convertSedinta.sedintaId,
      targetEnrollmentId: target.id,
    })
  }

  if (clientQuery.isLoading) return <Spinner />
  if (clientQuery.isError || !clientQuery.data) {
    return (
      <div>
        <p className="text-sm text-red-600">Clientul nu a fost găsit.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => navigate('/clienti')}
        >
          ← Înapoi la clienți
        </Button>
      </div>
    )
  }

  const client = clientQuery.data
  const initials = getInitials(client.nume, client.prenume)
  const varsta = calcAge(client.data_nasterii)
  const familiaLabel = familiaQuery.data?.nume_familie ?? ''

  return (
    <>
      <ProfileScaffold
        section="Clienți"
        backTo="/clienti"
        title={`${client.nume} ${client.prenume ?? ''}`.trim()}
        actions={
          <>
            {!teacherMode && (
              <Button variant="secondary" onClick={() => setPlataOpen(true)}>
                ＄ Plată
              </Button>
            )}
            {waLink(
              client.telefon,
              `Bună ziua! Vă scriem de la Quasar Dance în legătură cu ${client.prenume || client.nume}.`,
            ) && (
              <a
                href={
                  waLink(
                    client.telefon,
                    `Bună ziua! Vă scriem de la Quasar Dance în legătură cu ${client.prenume || client.nume}.`,
                  )!
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
                title="Scrie părintelui pe WhatsApp"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.207zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
                WhatsApp
              </a>
            )}
            <Button onClick={() => setEditOpen(true)}>Editează</Button>
          </>
        }
        sidebar={
          <ClientSidebar
          initials={initials}
          nume={client.nume}
          prenume={client.prenume}
          status={client.status}
          varsta={varsta}
          familia={familiaLabel}
          familiaId={familiaQuery.data?.id ?? null}
          sezoaneOptions={(sezoaneQuery.data ?? []).map((s) => ({
            value: s.id,
            label: s.numele_sezonului,
          }))}
          sezonValue={effectiveSezonId}
          onSezonChange={setSezonId}
          cursuri={cursuriSezon}
          onEnroll={() => setEnrollOpen(true)}
          />
        }
      >
        <div>
          <Tabs
            tabs={
              teacherMode
                ? [
                    { id: 'prezente', label: 'Detalii prezențe' },
                    { id: 'date',     label: 'Detalii personale' },
                  ]
                : [
                    { id: 'inrolari',  label: 'Detalii înrolări' },
                    { id: 'prezente',  label: 'Detalii prezențe' },
                    { id: 'date',      label: 'Detalii personale' },
                    { id: 'documente', label: 'Documente' },
                  ]
            }
            active={tab}
            onChange={(t) => setTab(t as TabId)}
          />

          {!teacherMode && tab === 'inrolari' && (
            <InrolariSezonTab
              loading={inrolariSezonQuery.isLoading}
              rows={inrolariSezonQuery.data ?? []}
              cursuri={cursuriSezon}
              reziliereByCurs={reziliereByCurs}
              onAskRezilia={(cId) => {
                setConfirmCursId(cId)
                setReintegrateAsLead(false)
                setRecalcUltimaLuna(false)
                setMotivReziliere('')
              }}
              onAdjustPrice={
                canManagerActions ? (eId) => setAdjustEnrollmentId(eId) : undefined
              }
              // Mutarea între grupe e permisă și front_desk-ului; managerul
              // primește o notificare informativă (vezi notify_enrollment_move).
              onMoveCurs={(eId) => setMoveEnrollmentId(eId)}
              // Motivarea absențelor + eventuala scutire de lună e doar manager+.
              onMotiveaza={
                canManagerActions ? (eId) => setMotivareEnrollmentId(eId) : undefined
              }
              // Conversia ședință → abonament (campanie iulie) e permisă și front_desk.
              // Butonul apare doar pe rândurile „Per sedinta" (vezi InrolariSezonTab).
              onConvertToAbonament={
                isFrontDeskOrHigher(role)
                  ? (eId, cId) => setConvertSedinta({ sedintaId: eId, cursId: cId })
                  : undefined
              }
              // Ștergerea fizică a unei înrolări (duplicat din eroare) e doar manager+.
              onDelete={
                canManagerActions
                  ? (r) => {
                      setDeleteRow(r)
                      setMotivStergere('')
                    }
                  : undefined
              }
            />
          )}

          {tab === 'prezente' && (
            <PrezenteSezonTab
              loading={prezenteQuery.isLoading}
              rows={prezenteQuery.data ?? []}
            />
          )}

          {tab === 'date' && (
            <DatePersonaleTab
              client={client}
              familia={familiaLabel}
              teacherMode={teacherMode}
            />
          )}

          {!teacherMode && tab === 'documente' && (
            <DocumenteTab client={client} />
          )}
        </div>
      </ProfileScaffold>

      {editOpen && (
        <ClientForm open client={client} onClose={() => setEditOpen(false)} />
      )}

      {enrollOpen && (
        <EnrollmentForm
          open
          defaultClientId={client.id}
          onClose={() => setEnrollOpen(false)}
        />
      )}

      {plataOpen && (
        <PlataNouaModal
          open
          defaultClientId={client.id}
          onClose={() => setPlataOpen(false)}
        />
      )}

      {adjustEnrollmentId && (
        <PriceAdjustmentModal
          open
          enrollmentId={adjustEnrollmentId}
          onClose={() => setAdjustEnrollmentId(null)}
        />
      )}

      {moveEnrollmentId && (
        <MoveEnrollmentModal
          open
          enrollmentId={moveEnrollmentId}
          onClose={() => setMoveEnrollmentId(null)}
        />
      )}

      {motivareEnrollmentId && (
        <MotivareAbsentaModal
          open
          enrollmentId={motivareEnrollmentId}
          onClose={() => setMotivareEnrollmentId(null)}
        />
      )}

      {convertSedinta && (
        <EnrollmentForm
          open
          defaultClientId={client.id}
          defaultCursId={convertSedinta.cursId}
          onEnrolled={handleConvertEnrolled}
          onClose={() => setConvertSedinta(null)}
        />
      )}

      {deleteRow && (
        <ConfirmDeleteInrolareModal
          open
          platit={deleteRow.platit ?? 0}
          motiv={motivStergere}
          isPending={stergeInrolare.isPending}
          onMotivChange={setMotivStergere}
          onConfirm={() =>
            stergeInrolare.mutate({
              enrollmentId: deleteRow.id_enrollment,
              motiv: motivStergere,
            })
          }
          onClose={closeDeleteModal}
        />
      )}

      {confirmCursId && (
        <ConfirmReziliereModal
          open
          cursId={confirmCursId}
          clientId={client.id}
          reziliereCount={reziliereByCurs.get(confirmCursId) ?? 0}
          motiv={motivReziliere}
          reintegrateAsLead={reintegrateAsLead}
          canRecalc={canManagerActions}
          recalcChecked={recalcUltimaLuna}
          isPending={rezilia.isPending}
          onMotivChange={setMotivReziliere}
          onReintegrateChange={setReintegrateAsLead}
          onRecalcChange={setRecalcUltimaLuna}
          onConfirm={() =>
            rezilia.mutate({
              cursId: confirmCursId,
              reintegrateAsLead,
              recalcUltimaLuna,
              motiv: motivReziliere,
            })
          }
          onClose={closeReziliereModal}
        />
      )}
    </>
  )
}
