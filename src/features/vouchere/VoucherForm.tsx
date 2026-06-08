import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Field,
  TextInput,
  TextArea,
  Select,
  Button,
} from '@/components/ui'
import { tipVoucherOptions, tipPlataOptions } from '@/lib/enums'
import { clientiOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import type { Voucher } from '@/types/db'
import {
  createVoucher,
  updateVoucher,
  deleteVoucher,
  voucherCodExists,
} from './api'

type Props = {
  open: boolean
  voucher?: Voucher | null
  onClose: () => void
}

type FormState = {
  cod_voucher: string
  descriere: string
  tip: string
  valoare: string
  data_inceperii: string
  data_expirarii: string
  numar_utilizari: string
  client: string
  curs: string
  tip_enrollment: string
}

function initialState(v?: Voucher | null): FormState {
  return {
    cod_voucher: v?.cod_voucher ?? '',
    descriere: v?.descriere ?? '',
    tip: v?.tip ?? '',
    valoare: v?.valoare != null ? String(v.valoare) : '',
    data_inceperii: v?.data_inceperii ?? '',
    data_expirarii: v?.data_expirarii ?? '',
    numar_utilizari:
      v?.numar_utilizari != null ? String(v.numar_utilizari) : '',
    client: v?.client ?? '',
    curs: v?.curs ?? '',
    tip_enrollment: v?.tip_enrollment ?? '',
  }
}

const toNum = (s: string) => (s.trim() ? Number(s) : null)

export function VoucherForm({ open, voucher, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(voucher)
  const [form, setForm] = useState<FormState>(() => initialState(voucher))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const clienti = useQuery({
    queryKey: ['lookup', 'clienti'],
    queryFn: clientiOptions,
  })
  const cursuri = useCursuriOptions()

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['vouchere'] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        cod_voucher: form.cod_voucher.trim(),
        descriere: form.descriere.trim() || null,
        tip: (form.tip || null) as Voucher['tip'],
        valoare: toNum(form.valoare),
        data_inceperii: form.data_inceperii || null,
        data_expirarii: form.data_expirarii || null,
        numar_utilizari: toNum(form.numar_utilizari),
        client: form.client || null,
        curs: form.curs || null,
        tip_enrollment: (form.tip_enrollment ||
          null) as Voucher['tip_enrollment'],
      }
      return isEdit
        ? updateVoucher(voucher!.id, payload)
        : createVoucher(payload)
    },
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la salvare.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteVoucher(voucher!.id),
    onSuccess: () => {
      void invalidate()
      onClose()
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : 'Eroare la ștergere.'),
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const cod = form.cod_voucher.trim()
    if (!cod) {
      setError('Codul voucherului este obligatoriu.')
      return
    }

    // Valoare obligatorie dacă Tip e setat
    const valoare = toNum(form.valoare)
    if (form.tip && (valoare == null || valoare <= 0)) {
      setError('Când alegi un tip, valoarea trebuie să fie pozitivă.')
      return
    }
    if (form.tip === 'Procent' && valoare != null && valoare > 100) {
      setError('Procentul nu poate depăși 100.')
      return
    }

    // Interval valid
    if (
      form.data_inceperii &&
      form.data_expirarii &&
      form.data_inceperii > form.data_expirarii
    ) {
      setError('„Valabil de la" trebuie să fie ≤ „Valabil până la".')
      return
    }

    // Cod unic (cu excludere la edit)
    try {
      const exists = await voucherCodExists(cod, voucher?.id)
      if (exists) {
        setError(`Există deja un voucher cu codul „${cod}".`)
        return
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Eroare la verificarea codului: ${err.message}`
          : 'Eroare la verificarea codului.',
      )
      return
    }

    save.mutate()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editează voucher' : 'Voucher nou'}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <div className="mr-auto flex items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-sm text-quasar-gray">
                    Confirmi ștergerea?
                  </span>
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Șterge
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Nu
                  </Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Șterge voucher
                </Button>
              )}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Anulează
          </Button>
          <Button type="submit" form="voucher-form" disabled={save.isPending}>
            {save.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </>
      }
    >
      <form id="voucher-form" onSubmit={handleSubmit} className="space-y-3">
        <Field label="Cod voucher" required htmlFor="cod_voucher">
          <TextInput
            id="cod_voucher"
            value={form.cod_voucher}
            onChange={(e) => set('cod_voucher')(e.target.value)}
          />
        </Field>

        <Field label="Descriere" htmlFor="descriere">
          <TextArea
            id="descriere"
            rows={2}
            value={form.descriere}
            onChange={(e) => set('descriere')(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tip" htmlFor="tip">
            <Select
              id="tip"
              placeholder="—"
              options={tipVoucherOptions}
              value={form.tip}
              onChange={(e) => set('tip')(e.target.value)}
            />
          </Field>
          <Field label="Valoare" htmlFor="valoare">
            <TextInput
              id="valoare"
              type="number"
              min={0}
              value={form.valoare}
              onChange={(e) => set('valoare')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Valabil de la" htmlFor="data_inceperii">
            <TextInput
              id="data_inceperii"
              type="date"
              value={form.data_inceperii}
              onChange={(e) => set('data_inceperii')(e.target.value)}
            />
          </Field>
          <Field label="Valabil până la" htmlFor="data_expirarii">
            <TextInput
              id="data_expirarii"
              type="date"
              value={form.data_expirarii}
              onChange={(e) => set('data_expirarii')(e.target.value)}
            />
          </Field>
          <Field label="Nr. utilizări" htmlFor="numar_utilizari">
            <TextInput
              id="numar_utilizari"
              type="number"
              min={0}
              value={form.numar_utilizari}
              onChange={(e) => set('numar_utilizari')(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Client (opțional)" htmlFor="client">
            <Select
              id="client"
              placeholder="— oricare —"
              options={clienti.data ?? []}
              value={form.client}
              onChange={(e) => set('client')(e.target.value)}
            />
          </Field>
          <Field label="Curs (opțional)" htmlFor="curs">
            <Select
              id="curs"
              placeholder="— oricare —"
              options={cursuri.data ?? []}
              value={form.curs}
              onChange={(e) => set('curs')(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Restricție tip plată (opțional)" htmlFor="tip_enrollment">
          <Select
            id="tip_enrollment"
            placeholder="— oricare —"
            options={tipPlataOptions}
            value={form.tip_enrollment}
            onChange={(e) => set('tip_enrollment')(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
