import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select } from '@/components/ui'
import { formatRON } from '@/lib/format'
import type { Enums } from '@/types/db'
import { listVouchereAplicabile, type VoucherAplicabil } from './api'

type Ctx = {
  clientId: string
  cursId: string
  tipPlata: Enums<'tip_plata'> | null
}

export function useVouchereAplicabile({ clientId, cursId, tipPlata }: Ctx) {
  return useQuery({
    queryKey: ['vouchere-aplicabile', clientId, cursId, tipPlata],
    queryFn: () => listVouchereAplicabile({ clientId, cursId, tipPlata: tipPlata! }),
    enabled: Boolean(clientId && cursId && tipPlata),
    staleTime: 30_000,
  })
}

export function findVoucherValid(
  vouchere: VoucherAplicabil[] | undefined,
  voucherId: string,
): VoucherAplicabil | null {
  if (!voucherId) return null
  return vouchere?.find((v) => v.id === voucherId && v.valid) ?? null
}

function label(v: VoucherAplicabil): string {
  if (v.tip === 'Procent') return `${v.cod_voucher} — ${v.valoare}%`
  if (v.tip === 'Valoare') return `${v.cod_voucher} — ${formatRON(v.valoare)}`
  return v.cod_voucher
}

type Props = Ctx & {
  value: string
  onChange: (id: string) => void
  // Motiv pentru care nu se poate alege niciun voucher (ex. preț de reînscriere bifat).
  blockedReason?: string | null
}

// Dropdown-ul de voucher de la recepție: arată doar ce se poate aplica acum și spune,
// pentru restul, de ce nu (ex. „TRUPA50: Doar membrii trupelor…").
export function VoucherField({ clientId, cursId, tipPlata, value, onChange, blockedReason }: Props) {
  const q = useVouchereAplicabile({ clientId, cursId, tipPlata })
  const valide = (q.data ?? []).filter((v) => v.valid)
  const respinse = (q.data ?? []).filter((v) => !v.valid)
  const selectat = findVoucherValid(q.data, value)

  // Clientul/cursul s-a schimbat și voucherul ales nu mai e valabil → îl scot, altfel
  // formularul ar trimite un voucher pe care DB-ul îl refuză.
  useEffect(() => {
    if (!value || !q.data) return
    if (blockedReason || !findVoucherValid(q.data, value)) onChange('')
  }, [value, q.data, blockedReason, onChange])

  const ready = Boolean(clientId && cursId && tipPlata)
  const placeholder = !ready
    ? '— alege întâi clientul și cursul —'
    : q.isLoading
      ? 'Se încarcă…'
      : valide.length === 0
        ? '— niciun voucher aplicabil —'
        : '— fără voucher —'

  return (
    <Field label="Voucher (opțional)" htmlFor="voucher">
      <Select
        id="voucher"
        placeholder={placeholder}
        options={valide.map((v) => ({ value: v.id, label: label(v) }))}
        value={blockedReason ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!ready || Boolean(blockedReason) || valide.length === 0}
      />
      {blockedReason ? (
        <p className="mt-1 text-xs text-quasar-gray">{blockedReason}</p>
      ) : (
        <>
          {selectat?.descriere && (
            <p className="mt-1 text-xs text-quasar-gray">{selectat.descriere}</p>
          )}
          {respinse.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              {respinse.map((v) => `${v.cod_voucher}: ${v.motiv}`).join(' · ')}
            </p>
          )}
        </>
      )}
    </Field>
  )
}
