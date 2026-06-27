import { Field, TextInput } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import { metodaPlataOptions } from '@/lib/enums'
import { formatRON } from '@/lib/format'
import type { Enums } from '@/types/db'

// Sentinel pentru plata împărțită Cash + Card. NU e o valoare a enum-ului
// metoda_plata din DB — la salvare se descompune în două încasări (vezi resolveTenders).
export const MIXT = '__mixt__' as const
export type MetodaSel = Enums<'metoda_plata'> | typeof MIXT

export type Tender = { metoda: Enums<'metoda_plata'>; suma: number }

export const metodaPlataSelectOptions: SelectOption[] = [
  ...metodaPlataOptions,
  { label: 'Mixt (Cash + Card)', value: MIXT },
]

const round2 = (n: number) => Math.round(n * 100) / 100

// Transformă selecția (metodă unică SAU mixt cash+card) într-o listă de „tenders".
// Aruncă dacă mixt-ul nu însumează exact totalul așteptat.
export function resolveTenders(args: {
  metoda: MetodaSel
  total: number
  cash: string
  card: string
}): Tender[] {
  const { metoda, total } = args
  if (metoda !== MIXT) {
    return [{ metoda, suma: round2(total) }]
  }
  const cash = round2(Number(args.cash) || 0)
  const card = round2(Number(args.card) || 0)
  if (cash < 0 || card < 0) {
    throw new Error('Sumele Cash și Card trebuie să fie pozitive.')
  }
  if (cash === 0 && card === 0) {
    throw new Error('Completează sumele Cash și Card.')
  }
  if (Math.abs(cash + card - round2(total)) > 0.01) {
    throw new Error(
      `Cash + Card (${formatRON(cash + card)}) trebuie să fie egal cu totalul (${formatRON(total)}).`,
    )
  }
  const out: Tender[] = []
  if (cash > 0) out.push({ metoda: 'Cash', suma: cash })
  if (card > 0) out.push({ metoda: 'Card', suma: card })
  return out
}

type Props = {
  metoda: MetodaSel
  onMetoda: (m: MetodaSel) => void
  /** Totalul de împărțit (post-voucher / parțial). Folosit pentru auto-completare + validare vizuală. */
  total: number
  cash: string
  card: string
  onCash: (v: string) => void
  onCard: (v: string) => void
  label?: string
}

// Selector metodă de plată + (când e „Mixt") două câmpuri Cash/Card cu
// auto-completarea complementului față de total.
export function MetodaPlataField({
  metoda,
  onMetoda,
  total,
  cash,
  card,
  onCash,
  onCard,
  label = 'Metoda de plată',
}: Props) {
  const isSplit = metoda === MIXT
  const sum = round2((Number(cash) || 0) + (Number(card) || 0))
  const mismatch = isSplit && total > 0 && Math.abs(sum - round2(total)) > 0.01

  return (
    <div className="space-y-2">
      <Field label={label}>
        <div className="flex flex-wrap gap-1.5">
          {metodaPlataSelectOptions.map((opt) => {
            const active = opt.value === metoda
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onMetoda(opt.value as MetodaSel)}
                className={[
                  'rounded-[10px] border px-3 py-2 text-[13px] font-semibold transition-colors',
                  active
                    ? 'border-quasar-yellow bg-quasar-yellow text-ink'
                    : 'border-line bg-card text-muted-2 hover:border-quasar-yellow/60 hover:text-ink',
                ].join(' ')}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </Field>

      {isSplit && (
        <div className="grid grid-cols-2 gap-3 rounded-[10px] border border-line bg-surface p-3">
          <Field label="Cash (RON)">
            <TextInput
              type="number"
              min={0}
              step="0.01"
              value={cash}
              onChange={(e) => {
                onCash(e.target.value)
                if (total > 0) {
                  onCard(String(round2(Math.max(0, total - (Number(e.target.value) || 0)))))
                }
              }}
            />
          </Field>
          <Field label="Card (RON)">
            <TextInput
              type="number"
              min={0}
              step="0.01"
              value={card}
              onChange={(e) => {
                onCard(e.target.value)
                if (total > 0) {
                  onCash(String(round2(Math.max(0, total - (Number(e.target.value) || 0)))))
                }
              }}
            />
          </Field>
          <p
            className={[
              'col-span-2 text-xs',
              mismatch ? 'font-medium text-danger' : 'text-muted',
            ].join(' ')}
          >
            Cash + Card = {formatRON(sum)}
            {total > 0 && ` / ${formatRON(total)} de încasat`}
          </p>
        </div>
      )}
    </div>
  )
}
