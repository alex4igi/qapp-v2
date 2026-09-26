import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, MonthPicker, PageHeader, Spinner, Tabs } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { formatRON } from '@/lib/format'
import { adaugaGrupeNoiInPool, getSalarizareLuna } from './api'
import { StaffCard } from './StaffCard'
import type { InstructorLuna, SalarizareLuna } from './types'

const TABS = [
  { id: 'pe-om', label: 'Pe om' },
  { id: 'instructori', label: 'Instructori' },
  { id: 'manageri', label: 'Manageri' },
  { id: 'receptie', label: 'Recepție' },
]

function lunaCurenta(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function StareInstructor({ i }: { i: InstructorLuna }) {
  if (i.confirmat) return <Badge tone="success">✓ confirmat</Badge>
  if (i.blocante.length > 0) return <Badge tone="danger">date lipsă</Badge>
  if (i.provizoriu) return <Badge tone="warn">luna în curs</Badge>
  return <Badge tone="neutral">de confirmat</Badge>
}

type RandPeOm = {
  cheie: string
  nume: string
  roluri: { rol: string; total: number }[]
  total: number
}

/** Un om cu două roluri (manager + instructor, recepție + instructor) apare o singură dată. */
function peOm(d: SalarizareLuna): RandPeOm[] {
  const m = new Map<string, RandPeOm>()
  const add = (cheie: string, nume: string, rol: string, total: number) => {
    const r = m.get(cheie) ?? { cheie, nume, roluri: [], total: 0 }
    r.roluri.push({ rol, total })
    r.total += total
    m.set(cheie, r)
  }
  for (const i of d.instructori) add(i.user_id ?? `t:${i.teacher_id}`, i.nume, 'instructor', Number(i.total))
  for (const x of d.manageri) add(x.user_id, m.get(x.user_id)?.nume ?? x.titular_nume, 'manager', Number(x.total))
  for (const x of d.receptie) add(x.user_id, m.get(x.user_id)?.nume ?? x.titular_nume, 'recepție', Number(x.total))
  return [...m.values()].sort((a, b) => b.total - a.total)
}

function Card({ eticheta, valoare, nota }: { eticheta: string; valoare: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="text-xs text-muted">{eticheta}</div>
      <div className="text-xl font-bold text-ink">{valoare}</div>
      {nota && <div className="text-xs text-muted">{nota}</div>}
    </div>
  )
}

export default function SalarizarePage() {
  const [luna, setLuna] = useState(lunaCurenta)
  const [tab, setTab] = useState('pe-om')
  const queryClient = useQueryClient()
  const [anul, lunaNr] = useMemo(() => luna.split('-').map(Number) as [number, number], [luna])

  const q = useQuery({
    queryKey: ['salarizare-luna', anul, lunaNr],
    queryFn: () => getSalarizareLuna(anul, lunaNr),
    retry: false,
  })

  const pool = useMutation({
    mutationFn: adaugaGrupeNoiInPool,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['salarizare-luna'] }),
  })

  const d = q.data
  const totalLuna = d ? Number(d.total_instructori) + Number(d.total_manageri) + Number(d.total_receptie) : 0
  const provizoriu = d
    ? d.instructori.some((i) => i.provizoriu) ||
      [...d.manageri, ...d.receptie].some((x) => x.componente.some((c) => c.stare === 'provizoriu'))
    : false
  const lipsaPool = d?.manageri.some((x) => x.locatii.some((l) => l.ocupare.grupe_lipsa_din_pool.length > 0))

  return (
    <>
      <PageHeader
        title="Salarizare"
        subtitle="Salariul fiecărui om pe grilele 2026-2027: bază + bonusuri. Ce e confirmat rămâne înghețat; restul se calculează live."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-56"><MonthPicker value={luna} onChange={setLuna} /></div>
        {provizoriu && <Badge tone="warn">unele sume sunt provizorii</Badge>}
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <p className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {humanizeError(q.error, 'Salarizarea lunii nu a putut fi calculată.')}
        </p>
      ) : d ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Card eticheta="Instructori" valoare={formatRON(d.total_instructori)} nota={`${d.instructori.length} oameni`} />
            <Card eticheta="Manageri" valoare={formatRON(d.total_manageri)} nota={`${d.manageri.length} oameni`} />
            <Card eticheta="Recepție" valoare={formatRON(d.total_receptie)} nota={`${d.receptie.length} oameni`} />
            <Card eticheta="Total lună (net)" valoare={formatRON(totalLuna)} />
            <Card eticheta="Beneficii" valoare={formatRON(d.beneficii)} nota="vouchere, abonamente — separat" />
          </div>

          <Tabs tabs={TABS} active={tab} onChange={setTab} />

          {tab === 'pe-om' && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 pr-3">Om</th>
                  <th className="pb-2 pr-3">Roluri</th>
                  <th className="pb-2 text-right">Total lună</th>
                </tr>
              </thead>
              <tbody>
                {peOm(d).map((r) => (
                  <tr key={r.cheie} className="border-t border-line">
                    <td className="py-2 pr-3 font-medium text-ink">{r.nume}</td>
                    <td className="py-2 pr-3 text-muted">
                      {r.roluri.map((x) => `${x.rol} ${formatRON(x.total)}`).join(' + ')}
                    </td>
                    <td className="py-2 text-right font-semibold text-ink">{formatRON(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'instructori' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="pb-2 pr-3">Instructor</th>
                    <th className="pb-2 pr-3">Grupe</th>
                    <th className="pb-2 pr-3 text-right">Bază</th>
                    <th className="pb-2 pr-3 text-right">Retenție</th>
                    <th className="pb-2 pr-3 text-right">Ocupare</th>
                    <th className="pb-2 pr-3 text-right">Vară</th>
                    <th className="pb-2 pr-3 text-right">Total</th>
                    <th className="pb-2">Stare</th>
                  </tr>
                </thead>
                <tbody>
                  {d.instructori.map((i) => (
                    <tr key={i.teacher_id} className="border-t border-line">
                      <td className="py-2 pr-3">
                        <Link to={`/teacheri/${i.teacher_id}?tab=salarii`} className="font-medium text-ink underline-offset-2 hover:underline">
                          {i.nume}
                        </Link>
                        <div className="text-xs text-muted">{i.rang ?? 'fără rang'}</div>
                      </td>
                      <td className="py-2 pr-3 text-ink">{i.nr_grupe}</td>
                      <td className="py-2 pr-3 text-right">{formatRON(i.totaluri?.baza ?? 0)}</td>
                      <td className="py-2 pr-3 text-right">{formatRON(i.totaluri?.retentie ?? 0)}</td>
                      <td className="py-2 pr-3 text-right">{formatRON(i.totaluri?.ocupare ?? 0)}</td>
                      <td className="py-2 pr-3 text-right">{formatRON(i.totaluri?.prezente_vara ?? 0)}</td>
                      <td className="py-2 pr-3 text-right font-semibold text-ink">{formatRON(i.total)}</td>
                      <td className="py-2"><StareInstructor i={i} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">
                Detaliul pe grupe și confirmarea lunii sunt în profilul fiecărui instructor. Voucherul de 300 lei
                intră la beneficii, nu în total.
              </p>
            </div>
          )}

          {tab === 'manageri' && (
            <div className="space-y-3">
              {lipsaPool && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
                  <span>Există grupe active care nu sunt încă în capacitatea locației.</span>
                  <Button variant="secondary" disabled={pool.isPending} onClick={() => pool.mutate()}>
                    Adaugă grupele noi
                  </Button>
                </div>
              )}
              {d.manageri.length === 0 ? (
                <p className="text-sm text-muted">Niciun manager de studio în luna asta.</p>
              ) : (
                d.manageri.map((m) => (
                  <StaffCard key={m.user_id} post="manager" om={m} anul={anul} luna={lunaNr} />
                ))
              )}
            </div>
          )}

          {tab === 'receptie' && (
            <div className="space-y-3">
              {d.receptie.length === 0 ? (
                <p className="text-sm text-muted">Nimeni la recepție în luna asta.</p>
              ) : (
                d.receptie.map((r) => (
                  <StaffCard key={r.user_id} post="receptie" om={r} anul={anul} luna={lunaNr} />
                ))
              )}
            </div>
          )}
        </>
      ) : null}
    </>
  )
}
