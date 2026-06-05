import { Checkbox, Field, TextInput } from '@/components/ui'
import type { FormState, SetField } from './helpers'

type Props = {
  form: FormState
  set: SetField
}

// Tarife (capacitate maximă, preț lunar/PROMO/anual/ședință) și flag-uri
// (one-time, suspendat). Câmpul PROMO e ascuns pentru cursurile facultative.
export function TarifFields({ form, set }: Props) {
  return (
    <>
      <div
        className={
          form.tip === 'facultativ' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-3'
        }
      >
        <Field label="Capacitate max." htmlFor="capacitate">
          <TextInput
            id="capacitate"
            type="number"
            min={0}
            value={form.capacitate_maxima}
            onChange={(e) => set('capacitate_maxima', e.target.value)}
          />
        </Field>
        <Field label="Preț lunar" htmlFor="pret_lunar">
          <TextInput
            id="pret_lunar"
            type="number"
            min={0}
            value={form.pret_lunar}
            onChange={(e) => set('pret_lunar', e.target.value)}
          />
        </Field>
        {form.tip !== 'facultativ' && (
          <Field label="Preț lunar PROMO" htmlFor="pret_promo">
            <TextInput
              id="pret_promo"
              type="number"
              min={0}
              value={form.pret_lunar_promo}
              onChange={(e) => set('pret_lunar_promo', e.target.value)}
            />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Preț anual" htmlFor="pret_anual">
          <TextInput
            id="pret_anual"
            type="number"
            min={0}
            value={form.pret_anual}
            onChange={(e) => set('pret_anual', e.target.value)}
          />
        </Field>
        <Field label="Preț ședință" htmlFor="pret_sedinta">
          <TextInput
            id="pret_sedinta"
            type="number"
            min={0}
            value={form.pret_sedinta}
            onChange={(e) => set('pret_sedinta', e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Checkbox
          id="one_time"
          label="One-time"
          checked={form.one_time}
          onChange={(e) => set('one_time', e.target.checked)}
        />
        <Checkbox
          id="suspendat"
          label="Suspendat"
          checked={form.suspendat}
          onChange={(e) => set('suspendat', e.target.checked)}
        />
      </div>
    </>
  )
}
