import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Button, Badge, Spinner } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { activeazaGrila, getDefinitiiKpi, getGrilaDetaliu, salveazaLinii } from './api'
import { LinieGrilaCard } from './LinieGrilaCard'
import type { LinieGrila } from './types'

export default function GrilaEditorPage() {
  const { grilaId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [linii, setLinii] = useState<LinieGrila[]>([])
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [probleme, setProbleme] = useState<string[]>([])

  const q = useQuery({
    queryKey: ['kpi-grila', grilaId],
    queryFn: () => getGrilaDetaliu(grilaId),
    enabled: Boolean(grilaId),
  })
  const definitii = useQuery({ queryKey: ['kpi-definitii'], queryFn: getDefinitiiKpi })

  useEffect(() => {
    if (q.data) setLinii(q.data.linii)
  }, [q.data])

  const readOnly = q.data?.grila.stare === 'incheiata'

  const ponderea = useMemo(
    () =>
      linii
        .filter((l) => l.activ && !l.eliminatoriu)
        .reduce((s, l) => s + (Number(l.pondere) || 0), 0),
    [linii],
  )

  const save = useMutation({
    mutationFn: () => salveazaLinii(grilaId, linii),
    onSuccess: () => {
      setMesaj('Grila a fost salvată.')
      void queryClient.invalidateQueries({ queryKey: ['kpi-grila', grilaId] })
      void queryClient.invalidateQueries({ queryKey: ['kpi-grile'] })
    },
    onError: (e: unknown) => setMesaj(humanizeError(e, 'Eroare la salvare.')),
  })

  const activeaza = useMutation({
    mutationFn: async () => {
      await salveazaLinii(grilaId, linii)
      return activeazaGrila(grilaId)
    },
    onSuccess: (r) => {
      setProbleme(r.activata ? [] : (r.probleme ?? []))
      setMesaj(r.activata ? 'Grila e activă. De acum produce bonus.' : null)
      void queryClient.invalidateQueries({ queryKey: ['kpi-grila', grilaId] })
      void queryClient.invalidateQueries({ queryKey: ['kpi-grile'] })
    },
    onError: (e: unknown) => setMesaj(humanizeError(e, 'Eroare la activare.')),
  })

  if (q.isLoading) return <Spinner />
  if (!q.data) return <p className="text-sm text-muted">Grila nu a fost găsită.</p>

  const g = q.data.grila
  const defById = new Map((definitii.data ?? []).map((d) => [d.id, d]))

  return (
    <>
      <PageHeader
        title={`Grilă KPI · ${g.titular_nume}`}
        subtitle={`${g.post} · ${g.perioada === 'vara' ? 'vară' : 'sezon'} · de la ${g.valabil_de_la}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/grile-kpi')}>
              ← Toate grilele
            </Button>
            {!readOnly && (
              <>
                <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? 'Se salvează…' : 'Salvează'}
                </Button>
                <Button onClick={() => activeaza.mutate()} disabled={activeaza.isPending}>
                  {g.stare === 'activa' ? 'Salvează și revalidează' : 'Activează grila'}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={g.stare === 'activa' ? 'success' : g.stare === 'ciorna' ? 'warn' : 'neutral'}>
          {g.stare}
        </Badge>
        <span
          className={`text-sm ${Math.abs(ponderea - 100) > 0.01 ? 'text-warn' : 'text-muted'}`}
        >
          Suma ponderilor: <strong>{ponderea}%</strong>
          {Math.abs(ponderea - 100) > 0.01 && ' — grila nu poate fi activată până nu dă 100%'}
        </span>
        <span className="text-sm text-muted">
          Cota managerului: {Math.round(g.cota_manager * 100)}%
        </span>
      </div>

      {probleme.length > 0 && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          <div className="mb-1 font-semibold">Grila nu poate fi activată încă:</div>
          <ul className="list-inside list-disc">
            {probleme.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      {mesaj && (
        <div className="mb-4 rounded-md border border-line bg-neutral-bg px-3 py-2 text-sm">
          {mesaj}
        </div>
      )}

      <div className="space-y-3">
        {linii.map((linie, i) => {
          const def = defById.get(linie.kpi_id)
          if (!def) return null
          return (
            <LinieGrilaCard
              key={linie.kpi_id}
              linie={linie}
              definitie={def}
              readOnly={Boolean(readOnly)}
              onChange={(patch) =>
                setLinii((prev) =>
                  prev.map((l, k) => (k === i ? { ...l, ...patch } : l)),
                )
              }
            />
          )
        })}
      </div>
    </>
  )
}
