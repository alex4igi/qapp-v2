import { Checkbox, Field, Select, TextInput } from '@/components/ui'
import { capacitateGrupaOptionsCu } from '@/lib/capacitateGrupa'
import type { FormState, SetField } from './helpers'

type Props = {
  form: FormState
  set: SetField
  /** Capacitatea standard a sălii alese — treapta implicită pentru grupă. */
  capacitateSala: number | null
}

// Tarife (capacitate maximă, preț lunar/PROMO/anual/ședință) și flag-uri
// (one-time, suspendat). Facultativul se plătește pe lună sau pe ședință, deci
// PROMO, prețul anual și prețul de reziliere sunt ascunse acolo.
// Capacitatea e o listă de trepte, nu un număr liber — vezi @/lib/capacitateGrupa.
export function TarifFields({ form, set, capacitateSala }: Props) {
  return (
    <>
      <div
        className={
          form.tip === 'facultativ' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-3'
        }
      >
        <Field label="Capacitate max." htmlFor="capacitate">
          <Select
            id="capacitate"
            placeholder="—"
            options={capacitateGrupaOptionsCu(form.capacitate_maxima)}
            value={form.capacitate_maxima}
            onChange={(e) => set('capacitate_maxima', e.target.value)}
          />
          {capacitateSala != null && (
            <p className="mt-1 text-xs text-muted">Standard sală: {capacitateSala}</p>
          )}
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
        {form.tip !== 'facultativ' && (
          <Field label="Preț anual" htmlFor="pret_anual">
            <TextInput
              id="pret_anual"
              type="number"
              min={0}
              value={form.pret_anual}
              onChange={(e) => set('pret_anual', e.target.value)}
            />
          </Field>
        )}
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

      {form.tip !== 'facultativ' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preț ședință (reziliere)" htmlFor="pret_sedinta_reziliere">
            <TextInput
              id="pret_sedinta_reziliere"
              type="number"
              min={0}
              value={form.pret_sedinta_reziliere}
              onChange={(e) => set('pret_sedinta_reziliere', e.target.value)}
            />
          </Field>
        </div>
      )}

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
        {form.tip === 'facultativ' && (
          <Checkbox
            id="rezervari_online"
            label="Rezervări online (portal membri)"
            checked={form.rezervari_online}
            onChange={(e) => set('rezervari_online', e.target.checked)}
          />
        )}
      </div>
    </>
  )
}
