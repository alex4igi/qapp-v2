import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DateInput,
  Field,
  Modal,
  Select,
  Spinner,
  TextInput,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { listSezoane } from '@/features/setari/api'
import { SezonCloneWizard } from '@/features/setari/components/SezonCloneWizard'
import {
  createCampanieReinscriere,
  getReinscrieriProgress,
} from './api'

type Props = {
  onClose: () => void
  onCreated: (campanieId: string) => void
  defaultSezonId?: string
}

type Step = 1 | 2 | 3

type CursPreview = {
  id: string
  numele: string
  varsta: string | null
}

function addDays(iso: string, days: number): string {
  if (!iso) return ''
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function CampanieWizard({ onClose, onCreated, defaultSezonId }: Props) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>(1)
  const [sezonId, setSezonId] = useState(defaultSezonId ?? '')
  const [nume, setNume] = useState('')
  const [target, setTarget] = useState('')
  const [taxa, setTaxa] = useState('')
  const [dataIncepere, setDataIncepere] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [zileProcesare, setZileProcesare] = useState('7')
  const [showSezonWizard, setShowSezonWizard] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sezoaneQ = useQuery({ queryKey: ['sezoane'], queryFn: listSezoane })
  // Doar sezoane de toamnă VIITOARE (planificate, neîncheiate) — exclude sezoanele
  // `planificat` rămase din migrare (ex. 2017-2024) care n-au cursuri recurente.
  const sezoaneOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return (sezoaneQ.data ?? [])
      .filter(
        (s) =>
          s.tip === 'principal' &&
          s.stare === 'planificat' &&
          (!s.data_final || s.data_final >= today),
      )
      .map((s) => ({ value: s.id, label: s.numele_sezonului }))
  }, [sezoaneQ.data])

  useEffect(() => {
    if (!sezonId && sezoaneOptions.length > 0) {
      setSezonId(sezoaneOptions[0].value)
    }
  }, [sezonId, sezoaneOptions])

  // Cursurile recurente din sezonul țintă (read-only preview, pas 2).
  const cursuriQ = useQuery({
    queryKey: ['campanie-wizard', 'cursuri', sezonId],
    enabled: Boolean(sezonId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursuri')
        .select('id,numele,varsta')
        .eq('sezon', sezonId)
        .eq('facultativ', false)
        .order('numele', { ascending: true })
      if (error) throw error
      return (data ?? []) as CursPreview[]
    },
  })

  // Nr. eligibili per curs (din progresul existent pe sezon).
  const progresQ = useQuery({
    queryKey: ['reinscrieri', 'progres', sezonId],
    enabled: Boolean(sezonId) && step === 2,
    queryFn: () => getReinscrieriProgress(sezonId),
  })

  const eligibiliByCurs = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of progresQ.data ?? []) m.set(r.curs_id, r.total_eligibili)
    return m
  }, [progresQ.data])

  const totalEligibili = useMemo(() => {
    let t = 0
    for (const c of cursuriQ.data ?? []) t += eligibiliByCurs.get(c.id) ?? 0
    return t
  }, [cursuriQ.data, eligibiliByCurs])

  const create = useMutation({
    mutationFn: () =>
      createCampanieReinscriere({
        sezonTintaId: sezonId,
        nume: nume.trim(),
        target: Number(target) || 0,
        taxa: Number(taxa),
        dataIncepere,
        dataFinal,
        zileProcesare: Number(zileProcesare) || 7,
      }),
    onSuccess: (id) => onCreated(id),
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la creare.'),
  })

  const next = () => {
    setError(null)
    if (step === 1) {
      if (!sezonId) return setError('Alege sezonul țintă (orarul de toamnă).')
      if (!nume.trim()) return setError('Numele campaniei este obligatoriu.')
      const t = Number(taxa)
      if (!taxa.trim() || !isFinite(t) || t <= 0)
        return setError('Taxa de rezervare trebuie să fie pozitivă.')
      if (!dataIncepere || !dataFinal)
        return setError('Completează perioada campaniei.')
      if (dataFinal < dataIncepere)
        return setError('Data finală nu poate fi înainte de data de început.')
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

  const back = () => {
    setError(null)
    if (step > 1) setStep((step - 1) as Step)
  }

  const sezonLabel =
    sezoaneOptions.find((o) => o.value === sezonId)?.label ?? '—'

  return (
    <Modal
      open
      title={`Campanie de reînscrieri — pas ${step} / 3`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={step === 1 ? onClose : back}>
            {step === 1 ? 'Anulează' : 'Înapoi'}
          </Button>
          {step < 3 ? (
            <Button onClick={next}>Următorul →</Button>
          ) : (
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'Se creează…' : 'Creează campania'}
            </Button>
          )}
        </>
      }
    >
      {step === 1 && (
        <div className="space-y-3">
          <Field label="Sezon țintă (orarul de toamnă)" required>
            <div className="space-y-2">
              {sezoaneQ.isLoading ? (
                <Spinner />
              ) : sezoaneOptions.length === 0 ? (
                <p className="text-sm text-quasar-gray">
                  Niciun sezon de toamnă planificat. Creează-l mai jos (clonează
                  din sezonul activ).
                </p>
              ) : (
                <Select
                  options={sezoaneOptions}
                  value={sezonId}
                  onChange={(e) => setSezonId(e.target.value)}
                />
              )}
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() => setShowSezonWizard(true)}
              >
                ＋ Creează sezon de toamnă (clonează)
              </Button>
            </div>
          </Field>
          <Field label="Nume campanie" required>
            <TextInput
              value={nume}
              onChange={(e) => setNume(e.target.value)}
              placeholder="Reînscrieri toamna 2026"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target (nr. clienți reînscriși)">
              <TextInput
                type="number"
                min={0}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="ex. 200"
              />
            </Field>
            <Field label="Taxă de rezervare (RON)" required>
              <TextInput
                type="number"
                min={0}
                step="0.01"
                value={taxa}
                onChange={(e) => setTaxa(e.target.value)}
                placeholder="ex. 100"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Data început" required>
              <DateInput
                value={dataIncepere}
                onChange={(e) => setDataIncepere(e.target.value)}
              />
            </Field>
            <Field label="Data limită" required>
              <DateInput
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
              />
            </Field>
            <Field label="Zile procesare">
              <TextInput
                type="number"
                min={0}
                value={zileProcesare}
                onChange={(e) => setZileProcesare(e.target.value)}
              />
            </Field>
          </div>
          {dataFinal && (
            <p className="text-xs text-quasar-gray">
              Fereastra de procesare se închide pe{' '}
              <strong>{addDays(dataFinal, Number(zileProcesare) || 7)}</strong>{' '}
              (data limită + {Number(zileProcesare) || 7} zile).
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-quasar-gray">
            Campania vizează <strong>toate cursurile recurente</strong> din{' '}
            <strong>{sezonLabel}</strong>. Cursurile facultative nu intră în
            reînscriere.
          </p>
          {cursuriQ.isLoading || progresQ.isLoading ? (
            <Spinner />
          ) : (cursuriQ.data ?? []).length === 0 ? (
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Sezonul țintă nu are cursuri recurente. Verifică orarul de toamnă.
            </p>
          ) : (
            <div className="max-h-72 overflow-auto rounded border border-quasar-gray-light">
              <table className="w-full text-sm">
                <thead className="bg-quasar-gray-light/30 text-left">
                  <tr>
                    <th className="px-3 py-2">Curs</th>
                    <th className="px-3 py-2">Grupă</th>
                    <th className="px-3 py-2 text-right">Eligibili</th>
                  </tr>
                </thead>
                <tbody>
                  {(cursuriQ.data ?? []).map((c) => (
                    <tr key={c.id} className="border-t border-quasar-gray-light">
                      <td className="px-3 py-2 font-medium">{c.numele}</td>
                      <td className="px-3 py-2">{c.varsta ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {eligibiliByCurs.get(c.id) ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-quasar-gray">
            Total eligibili: <strong>{totalEligibili}</strong>. Reînscrierea e
            validă doar după taxa de rezervare + actul adițional semnat
            (esemneaza.ro sau manual).
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2 text-sm">
          <p className="text-quasar-gray">Verifică detaliile campaniei:</p>
          <ul className="space-y-1">
            <li>
              Sezon țintă: <strong>{sezonLabel}</strong>
            </li>
            <li>
              Nume: <strong>{nume.trim() || '—'}</strong>
            </li>
            <li>
              Target: <strong>{Number(target) || 0}</strong> clienți
            </li>
            <li>
              Taxă de rezervare: <strong>{Number(taxa) || 0} RON</strong>
            </li>
            <li>
              Perioadă:{' '}
              <strong>
                {dataIncepere} → {dataFinal}
              </strong>{' '}
              (+{Number(zileProcesare) || 7} zile procesare, până pe{' '}
              {addDays(dataFinal, Number(zileProcesare) || 7)})
            </li>
            <li>
              Cursuri recurente vizate:{' '}
              <strong>{(cursuriQ.data ?? []).length}</strong>
            </li>
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {showSezonWizard && (
        <SezonCloneWizard
          onClose={() => setShowSezonWizard(false)}
          onCreated={(newSezonId) => {
            setShowSezonWizard(false)
            setStep(1)
            setSezonId(newSezonId)
            // Reîmprospătează lista de sezoane + preview-ul de cursuri pentru
            // sezonul nou (altfel pasul 2 putea afișa o stare goală cache-uită).
            void queryClient.invalidateQueries({ queryKey: ['sezoane'] })
            void queryClient.invalidateQueries({
              queryKey: ['campanie-wizard', 'cursuri'],
            })
            void queryClient.invalidateQueries({
              queryKey: ['reinscrieri', 'progres'],
            })
          }}
        />
      )}
    </Modal>
  )
}
