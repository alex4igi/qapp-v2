import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  DateInput,
  Button,
  CheckboxGroup,
  Spinner,
} from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { formatDate } from '@/lib/format'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { sezonActivId } from '@/lib/lookups'
import type { SesiuneEvaluare, InsertDto } from '@/types/db'
import {
  createSesiune,
  updateSesiune,
  getGrupeSesiune,
  ZILE_VERIFICARE,
  ZILE_GRATIE,
} from '../flowApi'

type Props = {
  sesiune?: SesiuneEvaluare | null
  onClose: () => void
}

function adauga(iso: string, zile: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + zile)
  return d.toISOString().slice(0, 10)
}

export function SesiuneForm({ sesiune, onClose }: Props) {
  const qc = useQueryClient()
  const isEdit = Boolean(sesiune)

  const [nume, setNume] = useState(sesiune?.nume ?? '')
  const [dataTrimitere, setDataTrimitere] = useState(sesiune?.data_trimitere ?? '')
  const [dataLimita, setDataLimita] = useState(sesiune?.data_limita_teacher ?? '')
  const [dataInchidere, setDataInchidere] = useState(sesiune?.data_inchidere ?? '')
  const [zileAvans, setZileAvans] = useState(String(sesiune?.zile_avans ?? 28))
  const [grupe, setGrupe] = useState<string[]>([])
  const [eroare, setEroare] = useState<string | null>(null)

  const sezonQ = useQuery({ queryKey: ['lookup', 'sezon-activ'], queryFn: sezonActivId })
  const cursuriQ = useCursuriOptions({ sezonId: sezonQ.data ?? null })

  const grupeQ = useQuery({
    queryKey: ['evaluari', 'sesiune-grupe', sesiune?.id],
    queryFn: () => getGrupeSesiune(sesiune!.id),
    enabled: isEdit,
  })
  useEffect(() => {
    if (grupeQ.data) setGrupe(grupeQ.data)
  }, [grupeQ.data])

  // Managerul se gândește în „când ajunge la părinți". Celelalte două date se
  // deduc din ea — dar rămân editabile, că un decembrie cu sărbători cere altă marjă.
  const onDataTrimitere = (v: string) => {
    setDataTrimitere(v)
    if (!v) return
    if (!isEdit || !dataLimita) setDataLimita(adauga(v, -ZILE_VERIFICARE))
    if (!isEdit || !dataInchidere) setDataInchidere(adauga(v, ZILE_GRATIE))
  }

  const save = useMutation({
    mutationFn: async () => {
      const dto = {
        nume: nume.trim(),
        data_limita_teacher: dataLimita,
        data_trimitere: dataTrimitere,
        data_inchidere: dataInchidere,
        zile_avans: Number(zileAvans) || 28,
        sezon_id: sezonQ.data ?? null,
      }
      if (isEdit) return updateSesiune(sesiune!.id, dto, grupe)
      return createSesiune(dto as InsertDto<'sesiuni_evaluare'>, grupe)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['evaluari'] })
      onClose()
    },
    onError: (e) => setEroare(humanizeError(e, 'Eroare la salvare.')),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setEroare(null)
    if (!nume.trim()) return setEroare('Dă un nume rundei (ex. „Checkpoint Decembrie 2026").')
    if (!dataTrimitere || !dataLimita || !dataInchidere) return setEroare('Completează toate cele trei date.')
    if (dataLimita > dataTrimitere) return setEroare('Termenul instructorilor trebuie să fie înaintea trimiterii.')
    if (dataInchidere < dataTrimitere) return setEroare('Închiderea nu poate fi înaintea trimiterii.')
    if (grupe.length === 0) return setEroare('Alege cel puțin o grupă.')
    save.mutate()
  }

  const deschidere = dataLimita ? adauga(dataLimita, -(Number(zileAvans) || 28)) : ''

  return (
    <Modal
      open
      title={isEdit ? 'Editează runda' : 'Rundă nouă de evaluare'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="sesiune-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="sesiune-form" onSubmit={submit} className="space-y-4">
        <Field label="Numele rundei" htmlFor="nume" required>
          <TextInput
            id="nume"
            placeholder="Checkpoint Decembrie 2026"
            value={nume}
            onChange={(e) => setNume(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Termen instructori" htmlFor="limita" required>
            <DateInput id="limita" value={dataLimita} onChange={(e) => setDataLimita(e.target.value)} />
          </Field>
          <Field label="Trimitere la părinți" htmlFor="trimitere" required>
            <DateInput
              id="trimitere"
              value={dataTrimitere}
              onChange={(e) => onDataTrimitere(e.target.value)}
            />
          </Field>
          <Field label="Închidere" htmlFor="inchidere" required>
            <DateInput
              id="inchidere"
              value={dataInchidere}
              onChange={(e) => setDataInchidere(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Contorul instructorilor pornește cu (zile înainte de termen)" htmlFor="avans">
          <TextInput
            id="avans"
            type="number"
            min={1}
            value={zileAvans}
            onChange={(e) => setZileAvans(e.target.value)}
          />
        </Field>

        {deschidere && dataTrimitere && dataInchidere && (
          <div className="rounded-md bg-surface px-3 py-2 text-xs text-muted-2">
            <p className="mb-1 font-semibold text-ink">Cum decurge runda</p>
            <p>
              {formatDate(deschidere)} — instructorii văd contorul ·{' '}
              {formatDate(dataLimita)} — termenul lor ·{' '}
              {formatDate(dataTrimitere)} — pleacă ce e aprobat ·{' '}
              {formatDate(dataInchidere)} — ce n-a fost aprobat expiră
            </p>
          </div>
        )}

        <Field label="Grupele care intră în rundă" htmlFor="grupe" required>
          {cursuriQ.isLoading ? (
            <Spinner />
          ) : (
            <CheckboxGroup
              options={cursuriQ.data ?? []}
              value={grupe}
              onChange={setGrupe}
            />
          )}
        </Field>

        {eroare && <p className="text-sm text-danger">{eroare}</p>}
      </form>
    </Modal>
  )
}
