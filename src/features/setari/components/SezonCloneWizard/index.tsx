import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Modal } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import {
  cloneSezon,
  listSezoane,
  type CloneSezonCursOverride,
  type CloneSezonInput,
} from '../../api'
import {
  validatePas1,
  validatePas3,
  type CursRow,
  type Step,
  type SursaCurs,
  type Tip,
  type VacantaRow,
} from './helpers'
import { Step1Detalii } from './wizard/Step1Detalii'
import { Step2Cursuri } from './wizard/Step2Cursuri'
import { Step3Vacante } from './wizard/Step3Vacante'
import { Step4Rezumat } from './wizard/Step4Rezumat'

type Props = {
  onClose: () => void
  onCreated: (newSezonId: string) => void
}

export function SezonCloneWizard({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1)

  // Pas 1
  const [sursaId, setSursaId] = useState('')
  const [nume, setNume] = useState('')
  const [tip, setTip] = useState<Tip>('principal')
  const [dataIncepere, setDataIncepere] = useState('')
  const [dataFinal, setDataFinal] = useState('')

  // Pas 2
  const [cursuri, setCursuri] = useState<CursRow[]>([])

  // Pas 3
  const [vacante, setVacante] = useState<VacantaRow[]>([])

  const [error, setError] = useState<string | null>(null)

  const sezoaneQ = useQuery({ queryKey: ['sezoane'], queryFn: listSezoane })
  const sezoaneOptions = useMemo(
    () =>
      (sezoaneQ.data ?? [])
        .filter((s) => s.stare !== 'arhivat')
        .map((s) => ({ value: s.id, label: s.numele_sezonului })),
    [sezoaneQ.data],
  )

  // Auto-selectează prima opțiune disponibilă (Select-ul nu emite onChange pentru default).
  useEffect(() => {
    if (!sursaId && sezoaneOptions.length > 0) {
      setSursaId(sezoaneOptions[0].value)
    }
  }, [sezoaneOptions, sursaId])

  const cursuriQ = useQuery({
    queryKey: ['sezon-clone', 'cursuri', sursaId],
    enabled: Boolean(sursaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursuri')
        .select(
          'id,numele,varsta,stil,facultativ,pret_lunar,pret_anual,pret_sedinta,pret_lunar_promo,capacitate_maxima',
        )
        .eq('sezon', sursaId)
        .order('numele', { ascending: true })
      if (error) throw error
      return (data ?? []) as SursaCurs[]
    },
  })

  // Inițializează lista de cursuri din sursă atunci când datele se încarcă
  // sau când se schimbă tipul (extra filtrează doar facultative).
  useEffect(() => {
    const src = cursuriQ.data
    if (!src) return
    const filtrate = tip === 'extra' ? src.filter((c) => c.facultativ) : src
    setCursuri(
      filtrate.map((c) => ({
        sursa: c,
        selected: true,
        numele: c.numele,
        pret_lunar: c.pret_lunar?.toString() ?? '',
        capacitate_maxima: c.capacitate_maxima?.toString() ?? '',
      })),
    )
  }, [cursuriQ.data, tip])

  const clone = useMutation({
    mutationFn: async () => {
      const payload: CloneSezonInput = {
        sezon_sursa: sursaId,
        nume: nume.trim(),
        tip,
        data_incepere: dataIncepere,
        data_final: dataFinal,
        cursuri: cursuri
          .filter((c) => c.selected)
          .map((c) => {
            const overrides: CloneSezonCursOverride = {}
            if (c.numele.trim() !== c.sursa.numele) {
              overrides.numele = c.numele.trim()
            }
            const pl = c.pret_lunar.trim()
            if (pl !== (c.sursa.pret_lunar?.toString() ?? '')) {
              if (pl) overrides.pret_lunar = Number(pl)
            }
            const cap = c.capacitate_maxima.trim()
            if (cap !== (c.sursa.capacitate_maxima?.toString() ?? '')) {
              if (cap) overrides.capacitate_maxima = Number(cap)
            }
            return {
              sursa_id: c.sursa.id,
              overrides:
                Object.keys(overrides).length > 0 ? overrides : undefined,
            }
          }),
        vacante: vacante
          .filter((v) => v.nume.trim() && v.data_incepere && v.data_final)
          .map((v) => ({
            nume: v.nume.trim(),
            data_incepere: v.data_incepere,
            data_final: v.data_final,
          })),
      }
      return cloneSezon(payload)
    },
    onSuccess: (newId) => onCreated(newId),
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la clonare.'),
  })

  const next = () => {
    setError(null)
    if (step === 1) {
      const e = validatePas1({ sursaId, nume, dataIncepere, dataFinal })
      if (e) {
        setError(e)
        return
      }
      setStep(2)
    } else if (step === 2) {
      if (!cursuri.some((c) => c.selected)) {
        setError('Selectează cel puțin un curs sau revino la pasul 1.')
        return
      }
      setStep(3)
    } else if (step === 3) {
      const e = validatePas3({ vacante, dataIncepere, dataFinal })
      if (e) {
        setError(e)
        return
      }
      setStep(4)
    }
  }

  const back = () => {
    setError(null)
    if (step > 1) setStep((step - 1) as Step)
  }

  return (
    <Modal
      open
      title={`Sezon nou prin clonare — pas ${step} / 4`}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={step === 1 ? onClose : back}>
            {step === 1 ? 'Anulează' : 'Înapoi'}
          </Button>
          {step < 4 ? (
            <Button onClick={next}>Următorul →</Button>
          ) : (
            <Button onClick={() => clone.mutate()} disabled={clone.isPending}>
              {clone.isPending ? 'Se creează…' : 'Creează sezon'}
            </Button>
          )}
        </>
      }
    >
      {step === 1 && (
        <Step1Detalii
          sezoaneOptions={sezoaneOptions}
          sezoaneLoading={sezoaneQ.isLoading}
          sursaId={sursaId}
          setSursaId={setSursaId}
          nume={nume}
          setNume={setNume}
          tip={tip}
          setTip={setTip}
          dataIncepere={dataIncepere}
          setDataIncepere={setDataIncepere}
          dataFinal={dataFinal}
          setDataFinal={setDataFinal}
        />
      )}

      {step === 2 && (
        <Step2Cursuri
          loading={cursuriQ.isLoading}
          tip={tip}
          cursuri={cursuri}
          setCursuri={setCursuri}
        />
      )}

      {step === 3 && (
        <Step3Vacante vacante={vacante} setVacante={setVacante} />
      )}

      {step === 4 && (
        <Step4Rezumat
          nume={nume}
          tip={tip}
          dataIncepere={dataIncepere}
          dataFinal={dataFinal}
          cursuri={cursuri}
          vacante={vacante}
        />
      )}

      {error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </Modal>
  )
}
