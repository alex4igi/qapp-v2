import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Spinner, TextInput } from '@/components/ui'
import { listPraguri, updatePrag, type Prag } from './api'

type Props = {
  open: boolean
  onClose: () => void
}

type Draft = Record<
  string,
  { prag_standard: number; prag_peste: number; pondere: number }
>

const UNIT_LABEL: Record<string, string> = {
  ore: 'ore',
  numar: 'nr.',
  procent: '%',
}

export function PraguriModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const praguriQ = useQuery({ queryKey: ['scorecard-praguri'], queryFn: listPraguri })
  const [draft, setDraft] = useState<Draft>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!praguriQ.data) return
    const d: Draft = {}
    for (const p of praguriQ.data) {
      d[p.cheie] = {
        prag_standard: Number(p.prag_standard),
        prag_peste: Number(p.prag_peste),
        pondere: Number(p.pondere),
      }
    }
    setDraft(d)
  }, [praguriQ.data])

  const setVal = (cheie: string, field: keyof Draft[string], value: number) =>
    setDraft((prev) => ({
      ...prev,
      [cheie]: { ...prev[cheie], [field]: value },
    }))

  const save = useMutation({
    mutationFn: async () => {
      const rows = praguriQ.data ?? []
      for (const p of rows) {
        const d = draft[p.cheie]
        if (!d) continue
        const changed =
          d.prag_standard !== Number(p.prag_standard) ||
          d.prag_peste !== Number(p.prag_peste) ||
          d.pondere !== Number(p.pondere)
        if (changed) await updatePrag(p.cheie, d)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scorecard-praguri'] })
      void queryClient.invalidateQueries({ queryKey: ['scorecard'] })
      onClose()
    },
    onError: (e: unknown) =>
      setError(humanizeError(e, 'Eroare la salvare.')),
  })

  const renderGroup = (faza: number, titlu: string) => {
    const rows = (praguriQ.data ?? []).filter(
      (p) => p.faza === faza && p.scorat,
    )
    if (rows.length === 0) return null
    return (
      <div key={faza}>
        <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-quasar-gray">
          {titlu}
        </h3>
        <div className="space-y-2">
          {rows.map((p: Prag) => (
            <div
              key={p.cheie}
              className="rounded-md border border-quasar-gray-light p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-quasar-black">
                  {p.eticheta}
                </span>
                <span className="text-xs text-quasar-gray">
                  {UNIT_LABEL[p.unitate] ?? p.unitate} ·{' '}
                  {p.directie === 'mai_mic_e_bine' ? 'mai mic = mai bine' : 'mai mare = mai bine'}
                </span>
              </div>
              {p.descriere && (
                <p className="mt-0.5 text-xs text-quasar-gray">{p.descriere}</p>
              )}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs text-quasar-gray">
                  Standard ≥
                  <TextInput
                    type="number"
                    step="any"
                    value={String(draft[p.cheie]?.prag_standard ?? '')}
                    onChange={(e) =>
                      setVal(p.cheie, 'prag_standard', Number(e.target.value))
                    }
                  />
                </label>
                <label className="text-xs text-quasar-gray">
                  Peste ≥
                  <TextInput
                    type="number"
                    step="any"
                    value={String(draft[p.cheie]?.prag_peste ?? '')}
                    onChange={(e) =>
                      setVal(p.cheie, 'prag_peste', Number(e.target.value))
                    }
                  />
                </label>
                <label className="text-xs text-quasar-gray">
                  Pondere
                  <TextInput
                    type="number"
                    step="any"
                    value={String(draft[p.cheie]?.pondere ?? '')}
                    onChange={(e) =>
                      setVal(p.cheie, 'pondere', Number(e.target.value))
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const PARAM_KEYS = ['recuperare_fereastra_zile', 'rata_restante', 'restante_intarziate']
  const renderParams = () => {
    const params = (praguriQ.data ?? []).filter((p) =>
      PARAM_KEYS.includes(p.cheie),
    )
    if (params.length === 0) return null
    return (
      <div>
        <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-quasar-gray">
          Parametri restanțe
        </h3>
        <div className="space-y-2">
          {params.map((p: Prag) => (
            <div
              key={p.cheie}
              className="flex items-center justify-between gap-3 rounded-md border border-quasar-gray-light p-2.5"
            >
              <div>
                <span className="text-sm font-medium text-quasar-black">
                  {p.eticheta}
                </span>
                {p.descriere && (
                  <p className="text-xs text-quasar-gray">{p.descriere}</p>
                )}
              </div>
              <div className="w-24 shrink-0">
                <TextInput
                  type="number"
                  step="any"
                  value={String(draft[p.cheie]?.prag_standard ?? '')}
                  onChange={(e) =>
                    setVal(p.cheie, 'prag_standard', Number(e.target.value))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Modal
      open={open}
      title="Praguri scorecard"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează pragurile'}
          </Button>
        </>
      }
    >
      {praguriQ.isLoading ? (
        <Spinner />
      ) : (
        <div>
          <p className="mb-2 text-xs text-quasar-gray">
            Valorile inițiale sunt ancorate în industrie. Ajustează-le după ce
            se calibrează pe datele tale reale. „Peste" trebuie să fie pragul
            mai exigent (vezi direcția fiecărui KPI).
          </p>
          {renderGroup(1, 'Faza 1 — Leads')}
          {renderGroup(2, 'Faza 2 — Restanțe')}
          {renderGroup(3, 'Faza 3 — Reactivări')}
          {renderParams()}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
