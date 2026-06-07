import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Button, Spinner, Tabs } from '@/components/ui'
import {
  listSezoane,
  rezilizaInrolari,
  recalcUltimaLunaReziliere,
  endOfMonth,
} from '@/features/plati/api'
import { reintegrateClientAsLead } from '@/features/leads/api'
import { EnrollmentForm } from '@/features/plati/EnrollmentForm'
import { PriceAdjustmentModal } from '@/features/plati/PriceAdjustmentModal'
import { MoveEnrollmentModal } from '@/features/plati/MoveEnrollmentModal'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher, isTeacher } from '@/lib/rolesMatrix'
import { ClientForm } from '../../ClientForm'
import {
  getClient,
  getClientEnrollments,
  getClientFamilia,
  getClientInrolariSezon,
  getClientPrezenteSezon,
} from '../../api'
import { ClientSidebar } from './ClientSidebar'
import { ConfirmReziliereModal } from './ConfirmReziliereModal'
import { calcAge, getInitials } from './helpers'
import { InrolariSezonTab } from './tabs/InrolariSezonTab'
import { PrezenteSezonTab } from './tabs/PrezenteSezonTab'
import { DatePersonaleTab } from './tabs/DatePersonaleTab'

type TabId = 'inrolari' | 'prezente' | 'date'

export function ClientProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
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
    <div>
      <PageHeader
        title={`${client.nume} ${client.prenume ?? ''}`.trim()}
        subtitle={client.status ?? undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/clienti')}>
              ← Înapoi
            </Button>
            <Button onClick={() => setEditOpen(true)}>Editează</Button>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-[256px_1fr]">
        <ClientSidebar
          initials={initials}
          nume={client.nume}
          prenume={client.prenume}
          varsta={varsta}
          familia={familiaLabel}
          sezoaneOptions={(sezoaneQuery.data ?? []).map((s) => ({
            value: s.id,
            label: s.numele_sezonului,
          }))}
          sezonValue={effectiveSezonId}
          onSezonChange={setSezonId}
          cursuri={cursuriSezon}
          onEnroll={() => setEnrollOpen(true)}
        />

        <div>
          <Tabs
            tabs={
              teacherMode
                ? [
                    { id: 'prezente', label: 'Detalii prezențe' },
                    { id: 'date',     label: 'Detalii personale' },
                  ]
                : [
                    { id: 'inrolari', label: 'Detalii înrolări' },
                    { id: 'prezente', label: 'Detalii prezențe' },
                    { id: 'date',     label: 'Detalii personale' },
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
              onMoveCurs={
                canManagerActions ? (eId) => setMoveEnrollmentId(eId) : undefined
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
        </div>
      </div>

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
    </div>
  )
}
